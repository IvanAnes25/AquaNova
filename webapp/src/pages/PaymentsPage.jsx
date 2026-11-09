import Icon from '../Icon.jsx';
import { Button, EmptyState, SectionTitle, Status } from '../components/UI.jsx';
import { money } from '../lib/format.js';

export default function PaymentsPage({ orders, onReview, onNavigate }) {
  const reviewOrders = orders.filter((order) => order.method === 'GCash' && ['Under review', 'Rejected'].includes(order.paymentStatus));
  const count = orders.filter((order) => order.paymentStatus === 'Under review').length;
  return <>
    <SectionTitle eyebrow="MANUAL GCASH PAYMENTS" title="Payment verification" action={<div className="review-count"><span /> {count} awaiting review</div>} />
    <div className="payment-review-list">{reviewOrders.length ? reviewOrders.map((order) => <article className="panel verification-card" key={order.id}>
      <div className="verification-main"><div className="verification-head"><div><span className="eyebrow">{order.id} <i>·</i> {order.date}</span><h3>{order.customer}</h3><span>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</span></div><Status>{order.paymentStatus}</Status></div>
        <div className="verification-meta"><span><small>AMOUNT PAID</small><b>{money(order.total)}</b></span><span><small>GCASH REFERENCE</small><b>{order.reference || 'Not submitted'}</b></span><span><small>PROOF FILE</small><b>{order.proofName || 'No screenshot'}</b></span></div>
        <div className="verification-actions"><Button variant="secondary" onClick={() => onReview(order, 'preview')}><Icon name="eye" size={16} /> View proof</Button>{order.paymentStatus === 'Under review' && <Button onClick={() => onReview(order, 'approve')}><Icon name="check" size={16} /> Approve payment</Button>}{order.paymentStatus === 'Under review' && <Button variant="danger-soft" onClick={() => onReview(order, 'reject')}>Reject</Button>}</div>
      </div>
      <button className="proof-preview" onClick={() => onReview(order, 'preview')}><div className="receipt-art"><span>G</span><div className="receipt-line" /><div className="receipt-line short" /><div className="receipt-amount">{money(order.total)}</div><div className="receipt-line" /><div className="receipt-line short" /><div className="receipt-check"><Icon name="check" size={16} /></div></div><span>{order.proofName || 'Payment receipt'}</span></button>
    </article>) : <EmptyState title="All caught up" text="New GCash submissions will appear here for you to verify." action={<Button variant="secondary" onClick={() => onNavigate('orders')}>View orders</Button>} />}</div>
  </>;
}
