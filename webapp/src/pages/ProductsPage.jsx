import Icon from '../Icon.jsx';
import { ProductImage } from '../components/ProductGrid.jsx';
import { Button, SectionTitle, Status } from '../components/UI.jsx';
import { money, stockLabel } from '../lib/format.js';

export default function ProductsPage({ products, category, setCategory, query, setQuery, onAddProduct, onStock, onImage }) {
  const categories = ['All items', ...new Set(products.map((product) => product.category))];
  const filtered = products.filter((product) => (category === 'All items' || product.category === category) && `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <SectionTitle eyebrow="YOUR AQUATICA CATALOG" title="Products" action={<Button onClick={onAddProduct}><Icon name="plus" size={16} /> Add product</Button>} />
    <div className="products-toolbar"><div className="category-tabs">{categories.map((item) => <button key={item} className={`category-tab ${category === item ? 'category-tab-active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="search-field"><Icon name="search" size={17} /><input placeholder="Find a product..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
    <div className="owner-products-grid">{filtered.map((product) => <article className="panel owner-product-card" key={product.id}>
      <div className="owner-product-image"><ProductImage product={product} /><span className="category-pill">{product.category}</span><button className="product-menu" aria-label={`Update ${product.name}`} onClick={() => onStock(product)}>•••</button></div>
      <div className="owner-product-image-actions"><Button variant="secondary" onClick={() => onImage(product)}>{product.image ? 'Replace image' : 'Upload image'}</Button>{product.image && <Button variant="danger-soft" onClick={() => onImage(product, true)}>Remove image</Button>}</div>
      <div className="owner-product-body"><div><h3>{product.name}</h3><span>{product.stock} in stock · {product.size || 'Standard'}</span></div><div className="owner-product-meta"><b>{money(product.price)}</b><Status>{stockLabel(product.stock)}</Status></div></div>
    </article>)}</div>
  </>;
}
