import { useMemo, useState } from 'react';
import Icon from '../Icon.jsx';
import { InventoryTable, MovementTable } from '../components/InventoryTable.jsx';
import { Button, PanelHeader, SectionTitle, SkeletonList, StatCard } from '../components/UI.jsx';

export default function InventoryPage({ products, movements, query, setQuery, onStock, loading = false }) {
  const [sort, setSort] = useState('stock-asc');
  const safeProducts = products || [];
  const safeMovements = movements || [];
  const units = safeProducts.reduce((sum, product) => sum + product.stock, 0);
  const visibleProducts = useMemo(() => safeProducts
    .filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => sort === 'stock-desc'
      ? right.stock - left.stock || left.name.localeCompare(right.name)
      : sort === 'name'
        ? left.name.localeCompare(right.name)
        : left.stock - right.stock || left.name.localeCompare(right.name)), [safeProducts, query, sort]);
  return <>
    <SectionTitle eyebrow="KNOW WHAT'S ON YOUR SHELVES" title="Inventory" action={<div className="button-row"><Button variant="secondary" aria-label="Adjust stock" onClick={() => onStock(null, 'Adjustment')}>Adjust stock</Button><Button aria-label="Restock" onClick={() => onStock(null, 'Restock')}><Icon name="plus" size={16} /> Restock</Button></div>} />
    <div className="inventory-stats"><StatCard label="Total products" value={safeProducts.length} note="Across all categories" icon="box" /><StatCard label="Units in stock" value={units} note="Available to sell" icon="grid" /><StatCard label="Low stock" value={safeProducts.filter((item) => item.stock > 0 && item.stock <= 5).length} note="5 units or less" icon="clock" /><StatCard label="Sold out" value={safeProducts.filter((item) => item.stock === 0).length} note="Need restocking" icon="close" /></div>
    <section className="panel table-panel inventory-table"><PanelHeader title="Stock levels" subtitle="Current quantities and product status" action={<div className="inventory-controls"><label>Sort by<select className="input" aria-label="Sort inventory" value={sort} onChange={(event) => setSort(event.target.value)}><option value="stock-asc">Stock: low to high</option><option value="stock-desc">Stock: high to low</option><option value="name">Name</option></select></label><div className="search-field search-compact"><Icon name="search" size={17} /><input placeholder="Search inventory..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>} />
      {loading || products == null
        ? <SkeletonList count={5} />
        : <InventoryTable products={visibleProducts} onStock={(product) => onStock(product, 'Restock')} />}
      <div className="movement-section"><PanelHeader title="Recent stock movements" subtitle="A clear record of every change" />{loading || movements == null ? <SkeletonList count={3} /> : <MovementTable movements={safeMovements.slice(0, 5)} />}</div>
    </section>
  </>;
}
