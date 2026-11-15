# Aquatica Web App

This folder contains the signed-in customer shop and owner workspace. Authentication and registration remain on the main website; the app restores the PHP session, verifies the server-side role, and requests commerce data from `/api/v1`. There is no separate login, registration, or role selector here.

The workspace reads and updates its catalog, cart, orders, stock, customers, notifications, settings, and reports through the PHP/MySQL API. Collection endpoints use 1-based pagination; the app fetches all pages needed by its current client-side views. See the repository [API reference](../API.md) for the pagination contract.

## Development

From the repository root, run the website and webapp Vite servers in separate terminals:

```powershell
npm run dev
npm --prefix webapp run dev
```

The webapp Vite proxy forwards API requests to the local Apache project. For the integrated production build, run `npm run build`; output is written to `public/webapp/`. Apache serves the app and PHP API on the same origin so the session cookie and CSRF protections remain in effect.

## Hosting

The Vercel configuration builds static files only and does not host this PHP API. Deploy the app, PHP API, and MySQL-backed routes on a PHP-capable HTTPS host with the required rewrite rules and protected private storage. Follow the repository [deployment guide](../DEPLOY.md).
