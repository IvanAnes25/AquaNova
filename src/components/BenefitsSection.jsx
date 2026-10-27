import Icon from './Icon.jsx';

const benefits = [
  {
    title: 'Quarantined before sale',
    description: 'Time to settle in, time to observe. We put the health of our fish first, before they go home with you.',
    icon: 'shield',
  },
  {
    title: 'Advice from the person who keeps the fish',
    description: 'Real, everyday experience with the fish we sell. Ask us about tank mates, feeding, and getting the water right.',
    icon: 'user',
  },
  {
    title: 'Order through your account, pick up at the shop',
    description: 'Choose your favourites through your account, then collect them from us here in Nasugbu. Simple and personal.',
    icon: 'bag',
  },
];

export default function BenefitsSection() {
  return (
    <section id="our-story" className="scroll-mt-24 bg-[linear-gradient(110deg,#eaf3f6_0%,#dcebf1_100%)]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-[#30475c] sm:text-3xl">Why people come back</h2>
          <span className="pb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[#637b89]">Good fish. Honest advice.</span>
        </div>
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-6 lg:gap-10">
          {benefits.map((benefit) => (
            <article key={benefit.title}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-[#496377]">
                <Icon name={benefit.icon} className="h-4 w-4" />
              </span>
              <h3 className="mt-4 text-sm font-medium text-[#30475c]">{benefit.title}</h3>
              <p className="mt-2 max-w-sm text-xs leading-5 text-[#657b89]">{benefit.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
