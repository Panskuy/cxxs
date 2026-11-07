import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const root = import.meta.dirname
const page = (f) => resolve(root, f)

// Every product has its own page at products/<slug>/index.html. They are found automatically, so a new
// product only needs `node scripts/new-product.mjs <slug>` (see ADD-PRODUCT.md).
const productPages = Object.fromEntries(
  readdirSync(resolve(root, 'products'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, 'products', d.name, 'index.html')))
    .map((d) => [`product-${d.name}`, page(`products/${d.name}/index.html`)]),
)

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        login: page('login/index.html'),
        products: page('products/index.html'),
        ...productPages,
        developers: page('developers/index.html'),
        developerApps: page('developers/apps/index.html'),
        apps: page('apps/index.html'),
        account: page('account/index.html'),
        verify: page('verify/index.html'),
        reset: page('reset/index.html'),
        admin: page('admin/index.html'),
        adminUsers: page('admin/users/index.html'),
        adminDownloads: page('admin/downloads/index.html'),
        adminActivity: page('admin/activity/index.html'),
        adminCollaborators: page('admin/collaborators/index.html'),
        adminSubmissions: page('admin/submissions/index.html'),
        adminRatings: page('admin/ratings/index.html'),
        notfound: page('404.html'),
      },
    },
  },
})
