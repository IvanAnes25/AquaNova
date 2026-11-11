import Icon from '../Icon.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import { Button, EmptyState, SectionTitle } from '../components/UI.jsx';

export default function ShopPage({ products, category, setCategory, query, setQuery, onProduct, onAdd, onNavigate, cartCount }) {
  const categories = ['All items', ...new Set(products.map((product) => product.category))];
  return <>
    <SectionTitle eyebrow="THE AQUATICA COLLECTION" title="Shop" action={<Button variant="secondary" onClick={() => onNavigate('cart')}><Icon name="cart" size={17} /> Cart <span className="button-count">{cartCount}</span></Button>} />
    <div className="shop-tools">
      <div className="category-tabs">{categories.map((item) => <button key={item} className={`category-tab ${category === item ? 'category-tab-active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="search-field"><Icon name="search" size={17} /><input placeholder="Search products..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    </div>
    {products.length
      ? <ProductGrid products={products} onSelect={onProduct} onAdd={onAdd} />
      : <EmptyState title="No fish in this spot" text="Try another search or category to explore more of the collection." action={<Button variant="secondary" onClick={() => { setCategory('All items'); setQuery(''); }}>Clear filters</Button>} />}
  </>;
}
