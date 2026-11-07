# Adding a product to CXXS

1. **Page shell:** `node scripts/new-product.mjs <slug>` creates `products/<slug>/index.html`
   (the build finds it automatically).
2. **Store data:** add an entry to `PRODUCTS` in `src/catalog.js` (name, tagline, summary, category, platform,
   version, size, license, features, install steps, notes, FAQ). It then shows up in the catalog, on the
   home page, in the footer and at `/products/<slug>/`. Set `status: 'soon'` to list it without a download.
3. **Download file:** put the file in `api/private/downloads/` and register it in `api/src/downloads.ts`
   (`DOWNLOADS[<slug>]` with file name, version, content type and SHA-256). Without this the download,
   rating and download-count endpoints answer 404 for that slug.
4. **Optional rich page:** for a custom preview, add `src/productpages/<slug>.jsx` exporting any of
   `Visual`, `Overview`, `Features`, `Spotlight`, and register it in `src/productpages/index.js`.
5. **Deploy:** `sudo ./deploy.sh`, and restart the API (`sudo systemctl restart portfolio-api`) if you
   changed `downloads.ts`.
