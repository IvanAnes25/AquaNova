import { useEffect, useState } from 'react';
import logoImage from '../assets/nasugbu-aquatica-logo.png';
import Icon from './Icon.jsx';
import NavigationLinks from './NavigationLinks.jsx';

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    function updateMobileHeader() {
      setIsScrolled(window.scrollY > 48);
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', updateMobileHeader, { passive: true });
    window.addEventListener('resize', updateMobileHeader);
    updateMobileHeader();

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', updateMobileHeader);
      window.removeEventListener('resize', updateMobileHeader);
    };
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={`site-header z-30 ${isScrolled ? 'site-header-scrolled' : ''}`}>
      <div className="site-header-panel mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8 lg:px-12">
        <a href="#top" onClick={closeMenu} className="site-brand flex shrink-0 items-center gap-2.5 text-xl font-semibold tracking-[-0.04em]" aria-label="Nasugbu Aquatica home">
          <img className="site-brand-logo" src={logoImage} alt="" />
          <span>Nasugbu Aquatica</span>
        </a>

        <nav className="site-desktop-navigation hidden items-center gap-1 xl:flex" aria-label="Main navigation">
          <NavigationLinks />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <label className="site-search hidden min-w-0 items-center gap-2 rounded-full px-3.5 py-2.5 transition sm:flex">
            <Icon name="search" className="h-4 w-4 shrink-0" />
            <input
              aria-label="Search the shop"
              className="site-search-input w-28 min-w-0 bg-transparent text-sm outline-none focus:w-36 transition-[width]"
              placeholder="Search"
              type="search"
            />
          </label>
          <a className="site-login inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium transition" href="#login">
            <Icon name="user" className="h-4 w-4" />
            <span>Log in</span>
          </a>
          <button
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="site-menu-toggle flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white xl:hidden"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        className={`mobile-menu-panel site-mobile-navigation border-t px-5 sm:px-8 xl:hidden ${
          menuOpen ? 'mobile-menu-panel-open' : 'mobile-menu-panel-closed'
        }`}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <div className="mx-auto max-w-7xl py-3">
          <div className="site-mobile-search mb-3 flex items-center gap-2 rounded-xl border px-4 py-3 sm:hidden">
            <Icon name="search" className="h-4 w-4 shrink-0" />
            <input aria-label="Search the shop" className="w-full bg-transparent text-base outline-none placeholder:text-white/60" placeholder="Search the shop" type="search" />
          </div>
          <div className="grid gap-1">
            <NavigationLinks mobile onNavigate={closeMenu} />
          </div>
        </div>
      </nav>
    </header>
  );
}
