import { useState } from 'react';
import { money } from '../lib/format.js';
import Icon from '../Icon.jsx';

export function ProductImage({ product, className = '' }) {
  const [failed, setFailed] = useState(false);
  return failed || !product.image
    ? <div className={`product-fallback ${className}`} aria-label={product.name}>{product.emoji || '🐟'}</div>
    : <img className={`product-photo ${className}`} src={product.image} alt={product.name} onError={() => setFailed(true)} />;
}

export default function ProductGrid({ products, onSelect, onAdd }) {
  return <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}>
    <button className="product-image-button" onClick={() => onSelect(product)}>
      <ProductImage product={product} /><span className="category-pill">{product.category}</span>
      {product.stock > 0 && product.stock <= 2 && <span className="low-stock-pill">! {product.stock} left</span>}
      {product.stock === 0 && <span className="sold-out-pill">! Sold out</span>}
    </button>
    <div className="product-card-body">
      <button className="product-name" onClick={() => onSelect(product)}>{product.name}</button>
      <span className="product-size">{product.size}</span>
      <div className="product-card-bottom"><b>{money(product.price)}</b><button className="add-button" aria-label={`Add ${product.name} to cart`} disabled={!product.stock} onClick={() => onAdd(product)}><Icon name="plus" size={17} /></button></div>
    </div>
  </article>)}</div>;
}
