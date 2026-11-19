import Icon from './Icon.jsx';

export default function TopBar({ shopStatus, statusError }) {
  const isOpen = shopStatus?.isOpen;
  const statusText = statusError
    ? 'Shop status unavailable'
    : shopStatus?.statusLine || 'Checking shop status…';
  return (
    <div
      className="site-topbar border-b border-white/15 bg-slate-950/25 text-white backdrop-blur-md"
      style={{ fontFamily: '"Manrope", "DM Sans", sans-serif' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-3 py-1.5 text-[9px] leading-[1.15] text-white/90 sm:flex-row sm:gap-2 sm:px-8 sm:py-2 sm:text-xs sm:leading-4 lg:px-12">
        <div className="site-topbar-content flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 sm:justify-start sm:gap-x-3 sm:gap-y-1">
          <span>Shop status:</span>
          <span
            className={`inline-flex items-center gap-1 font-medium sm:gap-1.5 ${isOpen ? 'text-emerald-200' : 'text-white/70'}`}
            role="status"
            aria-live="polite"
            style={{ fontFamily: '"Outfit", "DM Sans", sans-serif', letterSpacing: '0.04em' }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-300' : 'bg-white/60'}`} />
            {statusText}
          </span>
          {statusError && <span title={statusError}>Please try again later.</span>}
        </div>

        <div className="site-topbar-social flex items-center gap-3 text-white/90">
          <span className="hidden sm:inline">Follow along</span>
          <a className="rounded-full transition hover:text-[#203b52]" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Visit us on Instagram">
            <Icon name="instagram" className="h-4 w-4" />
          </a>
          <a className="rounded-full transition hover:text-[#203b52]" href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Visit us on Facebook">
            <Icon name="facebook" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
