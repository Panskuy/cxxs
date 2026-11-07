import { defineConfig } from 'prisma/config'

// `prisma generate` does not need a live database, so fall back to a placeholder URL.
const url = process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url },
})
