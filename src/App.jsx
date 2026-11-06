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

export default function App() {
  const route = currentAppRoute();
  if (route === '/login') return <LoginPage />;
  if (route === '/register') return <RegisterPage />;
  if (route === '/verify-email') return <VerifyEmailPage />;
  if (route === '/forgot-password') return <ForgotPasswordPage />;
  if (route === '/reset-password') return <ResetPasswordPage />;
  if (route === '/shop') return <ShopPage />;
  if (route === '/dashboard') return <DashboardPage />;

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
    </div>
  );
}
