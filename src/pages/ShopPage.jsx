import { useEffect } from 'react';
import { authGet } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function ShopPage() {
  useEffect(() => {
    authGet('/api/auth/customer-page.php')
      .then(() => window.location.replace(routePath('/webapp/')))
      .catch(() => window.location.replace(routePath('/login')));
  }, []);

  return <main className="grid min-h-screen place-items-center bg-slate-950 text-white">Opening your shop…</main>;
}
