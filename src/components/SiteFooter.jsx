import Icon from './Icon.jsx';

export default function SiteFooter() {
  return (
    <footer id="contact" className="scroll-mt-24 bg-[#f8fafb]">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-12">
        <div className="grid gap-8 border-b border-[#dce6eb] pb-8 sm:grid-cols-[1.6fr_1fr_1fr_1.25fr]">
          <div>
            <a href="#top" className="inline-flex items-center gap-2 text-lg font-medium tracking-[-0.04em] text-[#30475c]">
              <Icon name="location" className="h-4 w-4" />
              Aquatica
            </a>
            <p className="mt-2 max-w-xs text-xs leading-5 text-[#71838f]">Your neighbourhood fish & aquarium shop. A little care goes a long way.</p>
          </div>

          <div>
            <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#81909a]">Explore</h2>
            <a className="mt-2 block text-xs text-[#53697b] transition hover:text-[#203b52]" href="#categories">Shop the fish</a>
            <a className="mt-1.5 block text-xs text-[#53697b] transition hover:text-[#203b52]" href="#categories">Tanks & equipment</a>
          </div>

          <div>
            <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#81909a]">Your Aquatica</h2>
            <a className="mt-2 block text-xs text-[#53697b] transition hover:text-[#203b52]" href="#login">Log in</a>
            <a className="mt-1.5 block text-xs text-[#53697b] transition hover:text-[#203b52]" href="#login">My orders</a>
          </div>

          <div id="visit-us" className="scroll-mt-24">
            <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#81909a]">Come say hello</h2>
            <p className="mt-2 text-xs text-[#53697b]">Nasugbu, Batangas</p>
            <p className="mt-1.5 text-xs leading-5 text-[#71838f]">Open through your account. Pick up at the shop.</p>
            <p className="mt-1.5 text-xs leading-5 text-[#71838f]">Mon–Sat, 7:00 AM–5:00 PM · Sunday closed</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4 text-[10px] text-[#82919b] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Aquatica. All rights reserved.</span>
          <span>For the love of life underwater.</span>
        </div>
      </div>
    </footer>
  );
}
