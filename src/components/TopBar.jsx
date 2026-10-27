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
    <div className="border-b border-[#dce6eb] bg-[#eef5f7]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-2 text-[11px] sm:flex-row sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[#53697b] sm:justify-start">
          <a className="inline-flex items-center gap-1.5 transition hover:text-[#203b52]" href="#visit-us">
            <Icon name="location" className="h-3.5 w-3.5" />
            Nasugbu, Batangas
          </a>
          <span className="hidden text-[#b1c0c8] sm:inline" aria-hidden="true">|</span>
          <span>Opening hours: Mon–Sat 7:00 AM–5:00 PM, Sun closed</span>
          <span
            className={`inline-flex items-center gap-1.5 font-medium ${open ? 'text-[#26794e]' : 'text-[#71808a]'}`}
            role="status"
            aria-live="polite"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-[#36a86d]' : 'bg-[#9aa8b0]'}`} />
            {open ? 'Open now' : 'Closed now'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[#53697b]">
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
