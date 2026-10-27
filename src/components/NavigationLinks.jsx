import Icon from './Icon.jsx';

export default function NavigationLinks({ mobile = false, onNavigate }) {
  const linkClass = mobile
    ? 'site-mobile-link block rounded-xl px-4 py-3 text-base font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
    : 'site-nav-link rounded-full px-3 py-2 text-sm transition';

  return (
    <>
      <a className={linkClass} href="#top" onClick={onNavigate}>Home</a>
      <a className={linkClass} href="#categories" onClick={onNavigate}>Shop</a>
      <a className={linkClass} href="#care-guides" onClick={onNavigate}>Care guides</a>
      <details className={`group ${mobile ? 'rounded-xl border border-[#e2eaee] px-4 py-3' : 'relative'}`}>
        <summary
          className={`site-nav-summary flex cursor-pointer list-none items-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden ${
            mobile ? 'py-1 text-base font-medium' : 'rounded-full px-3 py-2 text-sm'
          }`}
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
          <a className={mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition'} href="#our-story" onClick={onNavigate}>Our Story</a>
          <a className={mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition'} href="#visit-us" onClick={onNavigate}>Visit us</a>
          <a className={mobile ? 'site-mobile-sublink rounded-lg px-3 py-2.5 text-sm transition' : 'site-dropdown-link block rounded-lg px-3 py-2 transition'} href="#faq" onClick={onNavigate}>FAQ</a>
        </div>
      </details>
      <a className={linkClass} href="#contact" onClick={onNavigate}>Contact</a>
    </>
  );
}
