#!/usr/bin/env bash
# Build lalu salin hasilnya ke Apache. Jalankan: sudo ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/home/admin/.local/node/bin:$PATH"
sudo -u admin env PATH="$PATH" npx vite build
[ -f /var/www/html/index.html ] && [ ! -f /var/www/html/index.apache-default.html.bak ] && mv /var/www/html/index.html /var/www/html/index.apache-default.html.bak
rm -rf /var/www/html/assets
cp -r dist/. /var/www/html/
chown -R root:root /var/www/html
find /var/www/html -type d -exec chmod 755 {} + ; find /var/www/html -type f -exec chmod 644 {} +
echo "OK: situs ter-deploy di /var/www/html"
