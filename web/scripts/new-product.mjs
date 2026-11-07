// Usage: node scripts/new-product.mjs <slug>
// Creates products/<slug>/index.html (the page shell). Then add the product's data to src/catalog.js.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const slug = process.argv[2]
if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
  console.error('Usage: node scripts/new-product.mjs <slug>   (lowercase letters, digits and dashes)')
  process.exit(1)
}
const root = new URL('..', import.meta.url).pathname
const dir = join(root, 'products', slug)
if (existsSync(join(dir, 'index.html'))) { console.error(`products/${slug}/index.html already exists`); process.exit(1) }
mkdirSync(dir, { recursive: true })
// Reuse the shell of an existing product page (the same script serves every product).
const shell = readFileSync(join(root, 'products', 'notch', 'index.html'), 'utf8').replace(/<title>.*?<\/title>/, `<title>${slug} | CXXS</title>`)
writeFileSync(join(dir, 'index.html'), shell)
console.log(`Created products/${slug}/index.html. Next: add the product to src/catalog.js and, to allow downloads, to api/src/downloads.ts.`)
