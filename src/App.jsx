import { useEffect, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import SiteHeader from './components/SiteHeader.jsx';
import HeroSection from './components/HeroSection.jsx';
import ShopSection from './components/ShopSection.jsx';
import AboutUs from './components/AboutUs.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';
import { currentAppRoute } from './lib/paths.js';
import { authGet } from './lib/authApi.js';

export default function App() {
  const route = currentAppRoute();
  const [shopSettings, setShopSettings] = useState(null);
  const [shopSettingsError, setShopSettingsError] = useState('');
  useEffect(() => {
    if (route !== '/') return undefined;
    let active = true;
    const refreshSettings = () => {
      authGet('/api/v1/settings/public')
        .then((settings) => {
          if (active) {
            setShopSettings(settings);
            setShopSettingsError('');
          }
        })
        .catch((error) => {
          if (active) setShopSettingsError(error.message);
        });
    };
    refreshSettings();
    const timer = window.setInterval(refreshSettings, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [route]);

  if (route === '/login') return <LoginPage />;
  if (route === '/register') return <RegisterPage />;
  if (route === '/verify-email') return <VerifyEmailPage />;
  if (route === '/forgot-password') return <ForgotPasswordPage />;
  if (route === '/reset-password') return <ResetPasswordPage />;
  if (route === '/shop') return <ShopPage />;
  if (route === '/dashboard') return <DashboardPage />;

  return (
    <div id="top" className="min-h-screen bg-white text-[#30475c]">
      <TopBar shopStatus={shopSettings?.shopStatus} statusError={shopSettingsError} />
      <SiteHeader />
      <main>
        <HeroSection shopStatus={shopSettings?.shopStatus} statusError={shopSettingsError} />
        <ShopSection />
        <AboutUs settings={shopSettings} />
      </main>
      <SiteFooter settings={shopSettings} />
    </div>
  );
}
