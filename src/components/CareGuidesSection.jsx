const guides = [
  {
    number: '01',
    title: 'Get your tank ready',
    description: 'Set up your aquarium and let the water settle before bringing fish home.',
  },
  {
    number: '02',
    title: 'Choose compatible fish',
    description: 'Think about tank size, temperament, and the kind of water your fish prefer.',
  },
  {
    number: '03',
    title: 'Keep a steady routine',
    description: 'Regular feeding, water checks, and small water changes help fish thrive.',
  },
];

export default function CareGuidesSection() {
  return (
    <section id="care-guides" className="scroll-mt-24 bg-[#f7fafb]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#557d70]">A little help for happy fish</p>
          <h2 className="font-display text-3xl font-semibold tracking-[-0.035em] text-[#30475c] sm:text-4xl">Care guides for a thriving tank</h2>
          <p className="mt-3 text-base leading-7 text-[#506b7b]">A few good habits make a big difference. Start with the basics, and ask us in store if you need a hand.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {guides.map((guide) => (
            <article className="rounded-2xl border border-[#dce6eb] bg-white p-5 shadow-[0_12px_36px_-30px_rgba(29,55,72,0.35)] sm:p-6" key={guide.number}>
              <span className="font-display text-3xl font-semibold text-[#6b9581]">{guide.number}</span>
              <h3 className="mt-4 text-lg font-bold text-[#30475c]">{guide.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#506b7b]">{guide.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
