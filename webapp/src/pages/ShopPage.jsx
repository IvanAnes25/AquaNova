import Icon from '../Icon.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import { Button, EmptyState, SectionTitle } from '../components/UI.jsx';

export default function ShopPage({ products, categories, category, setCategory, query, setQuery, onProduct, onAdd, onNavigate, cartCount }) {
  const visibleCategories = ['All items', ...new Set(categories)];
  return <>
    <SectionTitle eyebrow="THE AQUATICA COLLECTION" title="Shop" action={<Button variant="secondary" onClick={() => onNavigate('cart')}><Icon name="cart" size={17} /> Cart <span className="button-count">{cartCount}</span></Button>} />
    <div className="shop-tools">
      <div className="category-tabs">{visibleCategories.map((item) => <button key={item} aria-pressed={category === item} className={`category-tab ${category === item ? 'category-tab-active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="search-field"><Icon name="search" size={17} /><input placeholder="Search products..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    </div>
    {products.length
      ? <ProductGrid products={products} onSelect={onProduct} onAdd={onAdd} />
      : <EmptyState title="No fish in this spot" text="Try another search or category to explore more of the collection." action={<Button variant="secondary" onClick={() => { setCategory('All items'); setQuery(''); }}>Clear filters</Button>} />}
  </>;
}
