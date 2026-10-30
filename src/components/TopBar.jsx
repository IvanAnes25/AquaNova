import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

function isShopOpen() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const time = Number(values.hour) * 60 + Number(values.minute);
  return values.weekday !== 'Sun' && time >= 7 * 60 && time < 17 * 60;
}

export default function TopBar() {
  const [open, setOpen] = useState(isShopOpen);

  useEffect(() => {
    const timer = window.setInterval(() => setOpen(isShopOpen()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="site-topbar border-b border-white/15 bg-slate-950/25 text-white backdrop-blur-md"
      style={{ fontFamily: '"Manrope", "DM Sans", sans-serif' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-3 py-1.5 text-[9px] leading-[1.15] text-white/90 sm:flex-row sm:gap-2 sm:px-8 sm:py-2 sm:text-xs sm:leading-4 lg:px-12">
        <div className="site-topbar-content flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 sm:justify-start sm:gap-x-3 sm:gap-y-1">
          <a className="inline-flex items-center gap-1 transition hover:text-[#203b52] sm:gap-1.5" href="#visit-us">
            <Icon name="location" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Nasugbu, Batangas
          </a>
          <span className="hidden text-[#b1c0c8] sm:inline" aria-hidden="true">|</span>
          <span>Opening hours: Mon–Sat 7:00 AM–5:00 PM, Sun closed</span>
          <span
            className={`inline-flex items-center gap-1 font-medium sm:gap-1.5 ${open ? 'text-emerald-200' : 'text-white/70'}`}
            role="status"
            aria-live="polite"
            style={{ fontFamily: '"Outfit", "DM Sans", sans-serif', letterSpacing: '0.04em' }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-300' : 'bg-white/60'}`} />
            {open ? 'Open now' : 'Closed now'}
          </span>
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
