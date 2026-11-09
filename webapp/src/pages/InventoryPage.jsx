import Icon from '../Icon.jsx';
import { InventoryTable, MovementTable } from '../components/InventoryTable.jsx';
import { Button, PanelHeader, SectionTitle, StatCard } from '../components/UI.jsx';

export default function InventoryPage({ products, movements, query, setQuery, onStock }) {
  const units = products.reduce((sum, product) => sum + product.stock, 0);
  return <>
    <SectionTitle eyebrow="KNOW WHAT'S ON YOUR SHELVES" title="Inventory" action={<div className="button-row"><Button variant="secondary" onClick={() => onStock(null, 'Adjustment')}>Adjust stock</Button><Button onClick={() => onStock(null, 'Restock')}><Icon name="plus" size={16} /> Restock</Button></div>} />
    <div className="inventory-stats"><StatCard label="Total products" value={products.length} note="Across all categories" icon="box" /><StatCard label="Units in stock" value={units} note="Available to sell" icon="grid" /><StatCard label="Low stock" value={products.filter((item) => item.stock > 0 && item.stock <= 5).length} note="5 units or less" icon="clock" /><StatCard label="Sold out" value={products.filter((item) => item.stock === 0).length} note="Need restocking" icon="close" /></div>
    <section className="panel table-panel inventory-table"><PanelHeader title="Stock levels" subtitle="Current quantities and product status" action={<div className="search-field search-compact"><Icon name="search" size={17} /><input placeholder="Search inventory..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>} />
      <InventoryTable products={products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()))} onStock={(product) => onStock(product, 'Restock')} />
      <div className="movement-section"><PanelHeader title="Recent stock movements" subtitle="A clear record of every change" /><MovementTable movements={movements.slice(0, 5)} /></div>
    </section>
  </>;
}
