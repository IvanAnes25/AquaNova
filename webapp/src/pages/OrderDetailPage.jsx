import { Button, SectionTitle, Status } from '../components/UI.jsx';
import { money } from '../lib/format.js';
import Icon from '../Icon.jsx';

export default function OrderDetailPage({ order, onNavigate, onCancel, onNewProof }) {
  if (!order) return null;
  return <>
    <button className="back-link" onClick={() => onNavigate('my-orders')}><Icon name="back" size={16} /> Back to my orders</button>
    <SectionTitle eyebrow={`ORDER ${order.id}`} title="Order details" />
    <div className="detail-layout"><div className="detail-main">
      <div className="detail-status"><span>Order status</span><Status>{order.status}</Status><div className="step-track"><span className="step-done">Placed</span><i /><span className={['Preparing', 'Ready', 'Completed'].includes(order.status) ? 'step-done' : ''}>{order.status === 'Ready' ? 'Ready' : 'Preparing'}</span><i /><span className={order.status === 'Completed' ? 'step-done' : ''}>Completed</span></div></div>
      <div className="detail-block"><h3>Items</h3>{order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}</div>
      <div className="detail-block"><h3>Delivery & payment</h3><div className="detail-info-row"><span>{order.delivery === 'Delivery' ? 'Delivering to' : 'Pickup location'}</span><b>{order.address}</b></div><div className="detail-info-row"><span>Payment method</span><b>{order.method}</b></div><div className="detail-info-row"><span>Payment status</span><Status>{order.paymentStatus}</Status></div></div>
      {order.paymentStatus === 'Rejected' && <div className="error-callout"><b>Payment proof needs an update</b><span>{order.proofReason}</span><Button variant="secondary" onClick={onNewProof}>Upload new proof</Button></div>}
      {order.status === 'Pending' && <Button variant="danger-soft" onClick={() => onCancel(order)}>Cancel order</Button>}
    </div><aside className="panel order-summary"><h2>Order total</h2><div className="summary-row"><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div className="summary-row"><span>Delivery</span><b>{order.deliveryFee ? money(order.deliveryFee) : 'Free'}</b></div><div className="summary-total"><span>Total</span><b>{money(order.total)}</b></div></aside></div>
  </>;
}
