import { Button, EmptyState, SectionTitle, Status } from '../components/UI.jsx';
import { money } from '../lib/format.js';

export default function MyOrdersPage({ orders, customerName, onNavigate, onSelect }) {
  const customerOrders = orders.filter((order) => order.customer === 'Mika Reyes' || order.customer === customerName);
  return <>
    <SectionTitle eyebrow="YOUR AQUATICA ORDERS" title="My orders" />
    <div className="order-list">{customerOrders.length ? customerOrders.map((order) => <article className="panel customer-order-card" key={order.id}>
      <div className="customer-order-top"><div><span className="eyebrow">{order.id} <i>·</i> {order.date}</span><h3>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</h3></div><Status>{order.status}</Status></div>
      <div className="customer-order-bottom"><span>{order.delivery} <i>·</i> {order.method}</span><span>Payment: <Status>{order.paymentStatus}</Status></span><b>{money(order.total)}</b><Button variant="secondary" onClick={() => onSelect(order)}>{order.method === 'GCash' && order.paymentStatus !== 'Paid' ? 'Payment' : 'View order'}</Button></div>
      {order.proofReason && order.paymentStatus === 'Rejected' && <div className="reject-note">Payment update needed: {order.proofReason}</div>}
    </article>) : <EmptyState title="Your first order is waiting" text="Browse the collection and find a new favorite for your aquarium." action={<Button onClick={() => onNavigate('shop')}>Explore the shop</Button>} />}</div>
  </>;
}
