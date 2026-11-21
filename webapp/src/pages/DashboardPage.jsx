import Icon from '../Icon.jsx';
import { ProductImage } from '../components/ProductGrid.jsx';
import OrderTable from '../components/OrderTable.jsx';
import { Button, PanelHeader, SectionTitle, StatCard, Status } from '../components/UI.jsx';
import { money } from '../lib/format.js';

export default function DashboardPage({ orders, products, onNavigate, onOpenOrder }) {
  const pending = orders.filter((order) => order.status === 'Pending').length;
  const reviews = orders.filter((order) => order.paymentStatus === 'Under review').length;
  const needsAttention = products
    .filter((product) => product.stock <= 5)
    .sort((left, right) => left.stock - right.stock || left.name.localeCompare(right.name));
  return <>
    <SectionTitle eyebrow="MONDAY, NOVEMBER 9, 2026" title="Good morning, Aquatica" action={<Button variant="secondary" onClick={() => onNavigate('orders')}>View all orders <Icon name="arrow" size={16} /></Button>} />
    <section className="welcome-banner"><div><span>YOUR SHOP AT A GLANCE</span><h2>A good day to make a splash.</h2><p>Here’s what’s happening with your Aquatica shop today.</p></div><div className="banner-art"><div className="banner-bubble bubble-a" /><div className="banner-bubble bubble-b" /><span>🐠</span><i>〰</i></div></section>
    <div className="stats-grid">
      <StatCard label="Today's orders" value={orders.length + 12} note="vs. last week" trend="↑ 12%" icon="bag" accent />
      <StatCard label="Today's revenue" value={money(18420)} note="vs. last week" trend="↑ 8.4%" icon="chart" />
      <StatCard label="Pending orders" value={pending} note="Need your attention" icon="clock" />
      <StatCard label="Payment review" value={reviews} note="Waiting for verification" icon="check" />
    </div>
    <div className="dashboard-grid">
      <section className="panel dashboard-panel"><PanelHeader title="Recent orders" subtitle="The latest activity from your customers" action={<button className="text-button" onClick={() => onNavigate('orders')}>See all <Icon name="arrow" size={14} /></button>} />
        <OrderTable orders={orders.slice(0, 4)} onOpen={onOpenOrder} /><div className="recent-footer"><span>{orders.length + 18} orders this month</span><span>Updated just now</span></div>
      </section>
      <section className="panel dashboard-panel stock-panel"><PanelHeader title="Stock health" subtitle={`${needsAttention.length} items need a closer look`} action={<button className="text-button" onClick={() => onNavigate('inventory')}>Inventory <Icon name="arrow" size={14} /></button>} />
        <div className="stock-health">{needsAttention.map((product) => <div className="stock-health-row" key={product.id}><ProductImage product={product} /><div><b>{product.name}</b><span>{product.category}</span></div><div className="stock-right"><strong>{product.stock}</strong><Status>{product.stock === 0 ? 'Sold out' : 'Low stock'}</Status></div></div>)}</div>
        <Button variant="secondary" className="button-full" onClick={() => onNavigate('inventory')}>Review stock <Icon name="arrow" size={15} /></Button>
      </section>
    </div>
  </>;
}
