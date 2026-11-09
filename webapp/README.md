# Aquatica Web App

This folder contains the Aquatica customer shop and owner workspace. Sign in and registration stay on the main website (`/login` and `/register`); after login, the website sends both account roles here. The app restores the existing PHP session and asks the customer- or owner-protected endpoint which workspace to show. It has no separate login, registration, or role selector.

The shop, orders, and inventory shown here are still frontend demo data stored in browser local storage. Owner screens request the existing protected owner endpoint before navigation and demo actions, but demo data changes are not persisted or authorized by server-side business endpoints. Do not treat this frontend demo as production protection for owner data or actions.

For development, run the website and webapp in separate terminals from the repository root:

```powershell
npm run dev
npm --prefix webapp run dev
```

The website's Vite server proxies `/webapp/` to the webapp server on port 5174. A production `npm run build` builds the website and places the webapp bundle in `public/webapp/`; Apache rewrites `/webapp/` to that built app.

Page views are in `src/pages/`, reusable interface pieces are in `src/components/`, and app-wide demo state and role-aware navigation are in `src/App.jsx`.

The existing developer-only `database/create_owner.php` creates one owner account with an Argon2id password hash, and the auth API applies the same failed-login lockout to all accounts. The current backend does not yet force an owner to change a temporary password on first login; that requires a server-side account flag and password-change flow before using temporary credentials in a live system.
