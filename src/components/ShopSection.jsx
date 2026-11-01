import { useEffect, useMemo, useState } from 'react';

const categories = ['All', 'Bettas', 'Goldfish', 'Guppies', 'Tetras', 'Tanks', 'Equipment'];

const products = [
  {
    name: 'Halfmoon Betta',
    scientificName: 'Betta splendens',
    category: 'Bettas',
    price: 350,
    image: 'photo-1522069169874-c58ec4b76be5',
    description: 'A vivid, curious fish with flowing fins. Bettas thrive in warm, filtered water with calm surroundings.',
    facts: [['Adult size', '5–7 cm'], ['Temperament', 'Territorial'], ['Diet', 'Betta pellets, frozen foods'], ['Water temperature', '25–28°C'], ['Tank size', '20 L+'], ['Lifespan', '2–4 years']],
  },
  {
    name: 'Fancy Goldfish',
    scientificName: 'Carassius auratus',
    category: 'Goldfish',
    price: 480,
    image: 'photo-1524704654690-b56c05c78a00',
    description: 'A sociable, graceful goldfish that does best with excellent filtration and plenty of swimming space.',
    facts: [['Adult size', '15–20 cm'], ['Temperament', 'Peaceful'], ['Diet', 'Goldfish pellets, greens'], ['Water temperature', '18–23°C'], ['Tank size', '75 L+'], ['Lifespan', '10+ years']],
  },
  {
    name: 'Fancy Guppy',
    scientificName: 'Poecilia reticulata',
    category: 'Guppies',
    price: 90,
    image: 'photo-1535591273668-578e31182c4f',
    description: 'A lively community fish with flowing fins and a bright, ever-changing palette.',
    facts: [['Adult size', '3–6 cm'], ['Temperament', 'Peaceful'], ['Diet', 'Tropical flakes, micro foods'], ['Water temperature', '22–28°C'], ['Tank size', '40 L+'], ['Lifespan', '2–3 years']],
  },
  {
    name: 'Neon Tetra',
    scientificName: 'Paracheirodon innesi',
    category: 'Tetras',
    price: 65,
    image: 'photo-1546026423-cc4642628d2b',
    description: 'A small, shimmering schooling fish that brings movement to a planted aquarium.',
    facts: [['Adult size', '3–4 cm'], ['Temperament', 'Peaceful; keep in a group'], ['Diet', 'Small flakes, micro foods'], ['Water temperature', '20–26°C'], ['Tank size', '60 L+'], ['Lifespan', '5–8 years']],
  },
  {
    name: 'Planted Aquarium',
    scientificName: 'Aquascape setup',
    category: 'Tanks',
    price: 3250,
    image: 'photo-1520302519878-31fadcac4821',
    description: 'A clean-lined glass aquarium and a considered starting point for a planted freshwater world.',
    facts: [['Size', '60 cm'], ['Style', 'Planted setup'], ['Includes', 'Ask in store'], ['Water temperature', 'Depends on livestock'], ['Capacity', '60 L'], ['Care', 'Regular maintenance']],
  },
  {
    name: 'Quiet Flow Filter',
    scientificName: 'Aquarium equipment',
    category: 'Equipment',
    price: 890,
    image: 'photo-1581092160562-40aa08e78837',
    description: 'A practical filtration option to keep aquarium water clear and moving.',
    facts: [['Type', 'Aquarium filter'], ['Use', 'Freshwater tanks'], ['Flow', 'Adjustable'], ['Maintenance', 'Rinse filter media'], ['Fit', 'Check tank compatibility'], ['Care', 'Follow product instructions']],
  },
  {
    name: 'Koi Betta',
    scientificName: 'Betta splendens',
    category: 'Bettas',
    price: 520,
    image: 'photo-1522069169874-c58ec4b76be5',
    description: 'A striking marbled betta with an individual pattern and plenty of personality.',
    facts: [['Adult size', '5–7 cm'], ['Temperament', 'Territorial'], ['Diet', 'Betta pellets, frozen foods'], ['Water temperature', '25–28°C'], ['Tank size', '20 L+'], ['Lifespan', '2–4 years']],
  },
  {
    name: 'Ember Tetra',
    scientificName: 'Hyphessobrycon amandae',
    category: 'Tetras',
    price: 75,
    image: 'photo-1546026423-cc4642628d2b',
    description: 'A peaceful, small schooling fish that glows beautifully among green plants.',
    facts: [['Adult size', '2 cm'], ['Temperament', 'Peaceful; keep in a group'], ['Diet', 'Small flakes, micro foods'], ['Water temperature', '22–28°C'], ['Tank size', '40 L+'], ['Lifespan', '2–4 years']],
  },
];

function getPhotoUrl(image, width = 720) {
  return `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=80`;
}

function ProductDialog({ product, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="store-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-label={product.name} aria-modal="true" className="store-dialog" role="dialog">
        <button aria-label="Close product details" className="store-dialog-close" onClick={onClose} type="button">×</button>
        <img alt={product.name} className="store-dialog-image" src={getPhotoUrl(product.image, 1000)} />
        <div className="store-dialog-copy">
          <p className="store-eyebrow">{product.category} · Sample listing</p>
          <h2>{product.name}</h2>
          <p className="store-scientific">{product.scientificName}</p>
          <p className="store-dialog-price">₱{product.price.toLocaleString('en-PH')}</p>
          <p className="store-description">{product.description}</p>
          <dl className="store-facts">
            {product.facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <button className="store-dialog-return" onClick={onClose} type="button">Back to the collection</button>
        </div>
      </section>
    </div>
  );
}

export default function ShopSection() {
  const [category, setCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => category === 'All' || product.category === category);
  }, [category]);

  return (
    <section aria-labelledby="store-title" className="store-section" id="shop">
      <div className="store-container">
        <header className="store-heading">
          <div>
            <h2 id="store-title">The shop</h2>
          </div>
          <p>Freshwater fish and aquarium essentials for the little world you’re building.</p>
        </header>

        <div className="store-layout">
          <aside aria-label="Shop filters" className="store-sidebar">
            <div className="store-filter-group">
              <h3>Categories</h3>
              <div className="store-category-list">
                {categories.map((item) => (
                  <button
                    aria-pressed={category === item}
                    className={category === item ? 'is-active' : ''}
                    key={item}
                    onClick={() => setCategory(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="store-results">
            <div className="store-result-count" aria-live="polite">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'sample product' : 'sample products'}
            </div>

            {filteredProducts.length > 0 ? (
              <div className="store-product-grid">
                {filteredProducts.map((product) => (
                  <button className="store-product" key={product.name} onClick={() => setSelectedProduct(product)} type="button">
                    <span className="store-product-image">
                      <img alt={product.name} loading="lazy" src={getPhotoUrl(product.image)} />
                      <span className="store-product-action" aria-hidden="true">View</span>
                    </span>
                    <span className="store-product-info">
                      <span className="store-product-name">{product.name}</span>
                      <span className="store-product-scientific">{product.scientificName}</span>
                      <span className="store-product-price">₱{product.price.toLocaleString('en-PH')}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="store-empty">
                <h3>No matching products</h3>
                <p>Try choosing a different category.</p>
              </div>
            )}

            <p className="store-note">Sample catalog for design preview. Confirm products and prices with the shop.</p>
          </div>
        </div>
      </div>
      {selectedProduct && <ProductDialog onClose={() => setSelectedProduct(null)} product={selectedProduct} />}
    </section>
  );
}
