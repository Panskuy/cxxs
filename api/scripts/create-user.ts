// Usage: bun run user:create            (prompts for email + password, password is hidden)
import { prisma } from '../src/db'
import { hashPassword, passwordProblem } from '../src/security'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    let buf = ''
    if (hidden && stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          if (hidden && stdin.isTTY) stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(buf)
        }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1)
        else buf += ch
      }
    }
    stdin.on('data', onData)
  })
}

const email = (await ask('Email: ')).trim().toLowerCase()
if (!EMAIL_RE.test(email) || email.length > 254) {
  console.error('Invalid email.')
  process.exit(1)
}
const name = (await ask('Name (optional): ')).trim() || null
const roleInput = (await ask('Role [USER/ADMIN] (default USER): ')).trim().toUpperCase()
const role = roleInput === 'ADMIN' ? 'ADMIN' : 'USER'

const pw = await ask('Password (min 12 chars): ', true)
const problem = passwordProblem(pw, email)
if (problem) {
  console.error(problem)
  process.exit(1)
}
const pw2 = await ask('Repeat password: ', true)
if (pw !== pw2) {
  console.error('Passwords do not match.')
  process.exit(1)
}

const passwordHash = await hashPassword(pw)
const user = await prisma.user.upsert({
  where: { email },
  create: { email, name, passwordHash, role, emailVerifiedAt: new Date() }, // made by the owner on the server: trusted
  update: { passwordHash, role, disabled: false },
})
// A password change must end every existing session.
await prisma.session.deleteMany({ where: { userId: user.id } })
console.log(`OK: ${user.email} (${user.role}) saved. Existing sessions were revoked.`)
await prisma.$disconnect()
