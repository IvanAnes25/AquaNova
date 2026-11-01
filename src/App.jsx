import { useEffect, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import SiteHeader from './components/SiteHeader.jsx';
import HeroSection from './components/HeroSection.jsx';
import ShopSection from './components/ShopSection.jsx';
import AboutUs from './components/AboutUs.jsx';
import AuthPage from './components/AuthPage.jsx';
import SiteFooter from './components/SiteFooter.jsx';

export default function App() {
  const [showAuth, setShowAuth] = useState(() => window.location.hash === '#login');

  useEffect(() => {
    function syncAuthRoute() {
      setShowAuth(window.location.hash === '#login');
    }

    window.addEventListener('hashchange', syncAuthRoute);
    return () => window.removeEventListener('hashchange', syncAuthRoute);
  }, []);

  return (
    <div id="top" className="min-h-screen bg-[#f7fafb] text-[#30475c]">
      <TopBar />
      <SiteHeader />
      <main>
        <HeroSection />
        <ShopSection />
        <AboutUs />
      </main>
      <SiteFooter />
      {showAuth && <AuthPage onClose={() => { window.location.hash = 'top'; }} />}
    </div>
  );
}
