import { useEffect, useState } from 'react';
import ShopSection from '../components/ShopSection.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import SiteHeader from '../components/SiteHeader.jsx';
import TopBar from '../components/TopBar.jsx';
import { authGet } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function ShopPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authGet('/api/auth/customer-page.php')
      .then(() => setReady(true))
      .catch(() => window.location.replace(routePath('/login')));
  }, []);

  if (!ready) return <main className="grid min-h-screen place-items-center bg-slate-950 text-white">Checking your account…</main>;
  return (
    <div className="min-h-screen bg-[#f7fafb] text-[#30475c]">
      <TopBar />
      <SiteHeader />
      <main><ShopSection /></main>
      <SiteFooter />
    </div>
  );
}
