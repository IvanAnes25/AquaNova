# AquaNova

Starter environment for a group school project using plain PHP, React, Tailwind CSS, HTML, and JavaScript.

## Requirements

- XAMPP with Apache enabled
- Node.js and npm

## Start developing

1. Keep this project at `C:\xampp\htdocs\AquaNova` and start Apache in the XAMPP Control Panel.
2. In the project folder, install the JavaScript dependencies once with `npm install`.
3. Run `npm run dev` and open the Vite URL shown in the terminal (usually `http://localhost:5173`).

The Vite development server proxies `/api` requests to `http://localhost/AquaNova/api`. If you rename or move the folder, update the proxy path in `vite.config.js`.

## Open through XAMPP

Run `npm run build` whenever you want to test the production version, then open `http://localhost/AquaNova/`. Apache serves the PHP entry point and the built frontend from `public/`.

The sample endpoint is `http://localhost/AquaNova/api/health.php`. Add backend endpoints as plain `.php` files in `api/`; no PHP framework or Composer dependency is used.

## Team workflow

Share the source files and `package-lock.json` in Git. Each teammate runs `npm install` after cloning. Do not commit `node_modules/` or the generated `public/` build. Agree on endpoint paths and JSON request/response shapes before splitting frontend and PHP tasks.