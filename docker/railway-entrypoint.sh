#!/bin/sh
set -eu

port="${PORT:-8080}"
case "$port" in
    ''|*[!0-9]*)
        echo "PORT must be a number between 1 and 65535." >&2
        exit 1
        ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "PORT must be a number between 1 and 65535." >&2
    exit 1
fi

sed -i "s/^Listen .*/Listen ${port}/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \\*:80>/<VirtualHost *:${port}>/" /etc/apache2/sites-available/000-default.conf
mkdir -p /var/www/html/private/uploads/payment-proofs /var/www/html/private/uploads/shop
chown -R www-data:www-data /var/www/html/private/uploads

exec apache2-foreground
