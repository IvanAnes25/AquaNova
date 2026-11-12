# Aquatica deployment

## cPanel

1. Use PHP 8.1+ with PDO MySQL, mbstring, OpenSSL, Argon2id, and Apache `mod_rewrite`/`mod_headers`.
2. Upload the repository root as the document root. Keep `private/` outside the public directory if the host supports it; otherwise retain its deny rule and verify direct requests are forbidden.
3. Configure MySQL, import `database/auth_schema.sql`, then run `php scripts/migrate.php up` from the project root. Create `private/auth.php` from `private/auth.example.php`; use production database, SMTP, app key, HTTPS URL, and `environment => production`.
4. Install Composer dependencies and run `npm ci` followed by `npm run build`. Vite outputs to `public/`; Apache rewrites are required for PHP endpoints and application routes.
5. Set the PHP upload limits described below, enable HTTPS, verify all headers and blocked paths, and create the initial owner using `database/create_owner.php` over CLI.
6. Configure a scheduled task to run `php /home/ACCOUNT/path/to/AquaNova/scripts/cancel_expired_orders.php` every 15 minutes.
7. Before launch, complete every unchecked item in `TEST_REPORT.md` and the go-live checklist.

## Short VPS outline

Install Apache or Nginx with PHP-FPM 8.1+, MySQL/MariaDB, Composer, and Node.js. Point the virtual host at the project root, translate `.htaccess` protections and rewrites to the server config if using Nginx, keep `private/` and uploads outside the document root, configure TLS and PHP limits, then follow cPanel steps 3–7.

## Go-live checklist

- [ ] Database backup exists and a restore has been tested.
- [ ] Production secrets are configured outside Git; no sample credentials are in use.
- [ ] Schema, migrations, backend workflow tests, and browser tests pass on the production-equivalent stack.
- [ ] Login, email verification, password reset, all customer flows, and all owner flows are tested over HTTPS.
- [ ] GCash name, number, and QR are verified; SMTP delivery is tested.
- [ ] HTTPS redirect, HSTS, security headers, session cookie flags, upload limits, and private-path denials are verified.
- [ ] Auto-cancel schedule, monitoring, and backup retention are configured.

## Backup and rollback

Take a database dump before deployment or migration:

```sh
mysqldump --single-transaction --routines --triggers -u DB_USER -p DB_NAME > aquatica-$(date +%F-%H%M).sql
```

Keep at least seven daily copies in a directory outside the web root. Restore only after taking a separate backup of the current database:

```sh
mysql -u DB_USER -p DB_NAME < aquatica-backup.sql
```

These backup/restore commands are documentation only; a restore has **not** been tested for this closeout. Roll back application files to the previous release. Do not run a destructive migration rollback on production; restore the pre-deployment database backup only with an approved recovery plan.

## PHP upload/session settings

The repository `.user.ini` sets `upload_max_filesize=2M`, `post_max_size=3M` (multipart overhead), `max_file_uploads=1`, strict cookie-only sessions, HttpOnly, SameSite=Strict, and a 30-minute session lifetime. PHP app code additionally sets Secure over HTTPS and a 30-minute idle timeout. Confirm the host honors `.user.ini` overrides; if it uses Apache `mod_php`, copy these directives to the virtual-host `php.ini` configuration instead.
