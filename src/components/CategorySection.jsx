import Icon from './Icon.jsx';

const categories = [
  {
    name: 'Bettas',
    detail: 'show-quality fins',
    image: 'photo-1522069169874-c58ec4b76be5',
    alt: 'A vibrant betta fish in an aquarium',
  },
  {
    name: 'Goldfish',
    detail: 'hardy and charming',
    image: 'photo-1524704654690-b56c05c78a00',
    alt: 'Goldfish swimming in clear water',
  },
  {
    name: 'Guppies',
    detail: 'bright beginner fish',
    image: 'photo-1535591273668-578e31182c4f',
    alt: 'Colourful tropical fish',
  },
  {
    name: 'Tetras',
    detail: 'schooling fish',
    image: 'photo-1546026423-cc4642628d2b',
    alt: 'A colourful underwater fish habitat',
  },
  {
    name: 'Tanks',
    detail: 'glass and stands',
    image: 'photo-1520302519878-31fadcac4821',
    alt: 'A planted home aquarium',
  },
  {
    name: 'Equipment',
    detail: 'filters and lights',
    image: 'photo-1581092160562-40aa08e78837',
    alt: 'Aquarium equipment and supplies',
  },
];

export default function CategorySection() {
  return (
    <section id="categories" className="scroll-mt-24 bg-[#f8fafb]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#688395]">Find your freshwater favourites</p>
            <h2 className="font-display text-3xl font-medium tracking-[-0.035em] text-[#30475c] sm:text-4xl">Start with what you’re building</h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-[#687d8a]">A first fish, a planted tank, or a fresh start. There’s a good place to begin.</p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8">
          {categories.map((category) => (
            <a className="category-card group min-w-0" href="#contact" key={category.name}>
              <div className="relative aspect-[1.55] overflow-hidden rounded-2xl bg-[#e2edf0]">
                <img
                  alt={category.alt}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                  src={`https://images.unsplash.com/${category.image}?auto=format&fit=crop&w=720&h=460&q=80`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span>
                  <span className="block text-base font-semibold text-[#30475c]">{category.name}</span>
                  <span className="mt-0.5 block text-xs text-[#6c808d]">{category.detail}</span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8e2e7] text-[#536b7d] transition group-hover:border-[#30475c] group-hover:bg-[#30475c] group-hover:text-white">
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
