import Icon from '../Icon.jsx';
import OrderTable from '../components/OrderTable.jsx';
import { Button, EmptyState, SectionTitle } from '../components/UI.jsx';

export default function OrdersPage({ orders, filter, setFilter, query, setQuery, onOpen, onToast }) {
  const filters = ['All orders', 'Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
  return <>
    <SectionTitle eyebrow="KEEP THINGS MOVING" title="Orders" action={<Button variant="secondary" onClick={() => onToast('Order list exported (demo).')}><Icon name="download" size={16} /> Download orders</Button>} />
    <div className="orders-toolbar"><div className="category-tabs">{filters.map((item) => <button key={item} className={`category-tab ${filter === item ? 'category-tab-active' : ''}`} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="search-field"><Icon name="search" size={17} /><input placeholder="Search orders..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
    <section className="panel table-panel"><OrderTable orders={orders} onOpen={onOpen} owner /></section>
    {!orders.length && <EmptyState title="No orders found" text="Try a different status or search for a customer or order number." action={<Button variant="secondary" onClick={() => { setFilter('All orders'); setQuery(''); }}>Clear filters</Button>} />}
  </>;
}
