import TopBar from './components/TopBar.jsx';
import SiteHeader from './components/SiteHeader.jsx';
import HeroSection from './components/HeroSection.jsx';
import ShopSection from './components/ShopSection.jsx';

export default function App() {
  return (
    <div id="top" className="min-h-screen bg-[#f7fafb] text-[#30475c]">
      <TopBar />
      <SiteHeader />
      <main>
        <HeroSection />
        <ShopSection />
      </main>
    </div>
  );
}
