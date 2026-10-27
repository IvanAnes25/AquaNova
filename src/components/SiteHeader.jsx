import Icon from './Icon.jsx';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#dce6eb] bg-[#f9fbfc]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4 sm:px-8 lg:flex-nowrap lg:px-12">
        <a href="#top" className="flex shrink-0 items-center gap-2 text-[18px] font-medium tracking-[-0.04em] text-[#30475c]" aria-label="Aquatica home">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e1eef2] text-[#30475c]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M3 12c3.2-4.8 9.7-5.8 14.4-2.2L21 12l-3.6 2.2C12.7 17.8 6.2 16.8 3 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="15.3" cy="11.1" r=".8" fill="currentColor" />
              <path d="M3 12H1m5-3L4.5 7m1.5 8-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Aquatica
        </a>

        <nav className="order-3 flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[#455b6e] lg:order-2 lg:w-auto lg:flex-1" aria-label="Main navigation">
          <a className="transition hover:text-[#172f45]" href="#top">Home</a>
          <a className="transition hover:text-[#172f45]" href="#categories">Shop</a>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 transition hover:text-[#172f45] [&::-webkit-details-marker]:hidden">
              About us
              <Icon name="chevron" className="h-3 w-3 transition group-open:rotate-180" />
            </summary>
            <div className="absolute left-1/2 top-full z-40 mt-3 min-w-40 -translate-x-1/2 rounded-xl border border-[#dce6eb] bg-white p-2 text-sm shadow-[0_12px_30px_-18px_rgba(29,55,72,0.35)]">
              <a className="block rounded-lg px-3 py-2 transition hover:bg-[#eff6f8]" href="#our-story">Our Story</a>
              <a className="block rounded-lg px-3 py-2 transition hover:bg-[#eff6f8]" href="#visit-us">Visit us</a>
              <a className="block rounded-lg px-3 py-2 transition hover:bg-[#eff6f8]" href="#faq">FAQ</a>
            </div>
          </details>
          <a className="transition hover:text-[#172f45]" href="#contact">Contact</a>
        </nav>

        <div className="order-2 flex min-w-0 items-center gap-4 lg:order-3">
          <label className="flex min-w-0 items-center gap-2 rounded-full border border-[#dce6eb] bg-white px-3 py-2 text-[#758795] focus-within:border-[#829ba9]">
            <Icon name="search" className="h-4 w-4 shrink-0" />
            <input
              aria-label="Search the shop"
              className="w-full min-w-0 bg-transparent text-xs text-[#30475c] outline-none placeholder:text-[#94a2ab] sm:w-28"
              placeholder="Search"
              type="search"
            />
          </label>
          <a className="inline-flex shrink-0 items-center gap-1.5 text-[13px] transition hover:text-[#172f45]" href="#login">
            <Icon name="user" className="h-4 w-4" />
            <span>Log in</span>
          </a>
        </div>
      </div>
    </header>
  );
}
