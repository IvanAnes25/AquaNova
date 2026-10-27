import Icon from './Icon.jsx';

const heroImage = 'https://images.unsplash.com/photo-1524704654690-b56c05c78a00?auto=format&fit=crop&w=1400&q=85';

export default function HeroSection() {
  return (
    <section className="overflow-hidden bg-[radial-gradient(ellipse_at_85%_72%,#d1e5ed_0%,transparent_45%),linear-gradient(115deg,#f8fbfc_15%,#e8f2f6_100%)]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:px-12 lg:py-[4.5rem]">
        <div className="relative z-10">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#6d8290]">Fish, aquariums & a little good advice</p>
          <h1 className="text-[clamp(4.5rem,12vw,8.75rem)] font-medium leading-[0.82] tracking-[-0.075em] text-[#30475c]">Aquatica</h1>
          <p className="mt-6 max-w-md text-2xl leading-tight tracking-[-0.04em] text-[#40586e] sm:text-[2rem]">
            Healthy fish, with
            <br />
            advice you can trust.
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#687d8a]">
            From your first tank to your next favourite fish, find carefully kept freshwater fish, aquarium essentials, and friendly, practical advice.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="inline-flex items-center gap-2 rounded-full bg-[#30475c] px-5 py-3 text-xs font-medium text-white transition hover:bg-[#20394f]" href="#categories">
              Browse the fish
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </a>
            <a className="inline-flex items-center gap-2 rounded-full border border-[#cbd9df] bg-white/80 px-5 py-3 text-xs font-medium text-[#30475c] transition hover:bg-white" href="#categories">
              Our collection
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </a>
          </div>

          <a href="#categories" className="mt-8 flex max-w-sm items-center gap-4 rounded-2xl p-2 transition hover:bg-white/60">
            <img
              alt="A colourful betta fish"
              className="h-16 w-20 rounded-xl object-cover"
              loading="lazy"
              src="https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=320&h=240&q=80"
            />
            <span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-[#81929c]">Small tank, big personality</span>
              <span className="mt-1 block text-sm font-medium text-[#30475c]">Meet the halfmoon betta</span>
              <span className="mt-1 block text-[10px] text-[#71838f]">A little colour. A world of character.</span>
            </span>
          </a>
        </div>

        <div className="relative min-h-[300px] overflow-hidden rounded-[2rem] sm:min-h-[420px]">
          <img alt="A goldfish swimming through clear water" className="absolute inset-0 h-full w-full object-cover" src={heroImage} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#20394f]/30 via-transparent to-white/10" />
          <div className="absolute bottom-5 left-5 rounded-xl bg-white/85 px-4 py-3 text-[10px] leading-4 text-[#40586e] backdrop-blur-sm">
            <span className="block font-semibold">A little life. A little wonder.</span>
            <span>Find your freshwater favourite.</span>
          </div>
          <span className="absolute bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-[#40586e]" aria-hidden="true">
            <span className="text-lg leading-none">✳</span>
          </span>
        </div>
      </div>
    </section>
  );
}
