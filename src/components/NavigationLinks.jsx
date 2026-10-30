import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export default function NavigationLinks({ mobile = false, onNavigate }) {
  const [currentHash, setCurrentHash] = useState(() => window.location.hash || '#top');
  const baseLinkClass = mobile
    ? 'site-mobile-link block rounded-xl px-4 py-3 text-base font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
    : 'site-nav-link rounded-full px-3 py-2 text-sm transition';
  const aboutHashes = ['#our-story', '#visit-us', '#faq'];

  useEffect(() => {
    function updateCurrentHash() {
      setCurrentHash(window.location.hash || '#top');
    }

    window.addEventListener('hashchange', updateCurrentHash);
    return () => window.removeEventListener('hashchange', updateCurrentHash);
  }, []);

  function getLinkClass(href, baseClass) {
    return `${baseClass}${currentHash === href ? ' is-current-nav-link' : ''}`;
  }

  return (
    <>
      <a className={getLinkClass('#top', baseLinkClass)} href="#top" onClick={onNavigate} aria-current={currentHash === '#top' ? 'page' : undefined}>Home</a>
      <a className={getLinkClass('#shop', baseLinkClass)} href="#shop" onClick={onNavigate} aria-current={currentHash === '#shop' ? 'page' : undefined}>Shop</a>
      <a className={getLinkClass('#care-guides', baseLinkClass)} href="#care-guides" onClick={onNavigate} aria-current={currentHash === '#care-guides' ? 'page' : undefined}>Care guides</a>
      <details className={`group ${mobile ? 'rounded-xl border border-[#e2eaee] px-4 py-3' : 'relative'}`}>
        <summary
          className={`site-nav-summary flex cursor-pointer list-none items-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden ${
            mobile ? 'py-1 text-base font-medium' : 'rounded-full px-3 py-2 text-sm'
          }${aboutHashes.includes(currentHash) ? ' is-current-nav-link' : ''}`}
          aria-current={aboutHashes.includes(currentHash) ? 'page' : undefined}
        >
          About us
          <Icon name="chevron" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div
          className={
            mobile
              ? 'grid gap-1 overflow-hidden pl-3 pt-2'
              : 'site-about-dropdown absolute left-1/2 top-full z-40 mt-2 min-w-44 -translate-x-1/2 rounded-2xl border p-2 text-sm shadow-[0_12px_30px_-18px_rgba(29,55,72,0.35)]'
          }
        >
          <a className={getLinkClass('#our-story', mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition')} href="#our-story" onClick={onNavigate} aria-current={currentHash === '#our-story' ? 'page' : undefined}>Our Story</a>
          <a className={getLinkClass('#visit-us', mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition')} href="#visit-us" onClick={onNavigate} aria-current={currentHash === '#visit-us' ? 'page' : undefined}>Visit us</a>
          <a className={getLinkClass('#faq', mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition')} href="#faq" onClick={onNavigate} aria-current={currentHash === '#faq' ? 'page' : undefined}>FAQ</a>
        </div>
      </details>
      <a className={getLinkClass('#contact', baseLinkClass)} href="#contact" onClick={onNavigate} aria-current={currentHash === '#contact' ? 'page' : undefined}>Contact</a>
    </>
  );
}
