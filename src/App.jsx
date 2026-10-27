import TopBar from './components/TopBar.jsx';
import SiteHeader from './components/SiteHeader.jsx';
import HeroSection from './components/HeroSection.jsx';
import CategorySection from './components/CategorySection.jsx';
import CareGuidesSection from './components/CareGuidesSection.jsx';
import BenefitsSection from './components/BenefitsSection.jsx';
import SiteFooter from './components/SiteFooter.jsx';

export default function App() {
  return (
    <div id="top" className="min-h-screen bg-[#f7fafb] text-[#30475c]">
      <TopBar />
      <SiteHeader />
      <main>
        <HeroSection />
        <CategorySection />
        <CareGuidesSection />
        <BenefitsSection />
      </main>
      <SiteFooter />
    </div>
  );
}
