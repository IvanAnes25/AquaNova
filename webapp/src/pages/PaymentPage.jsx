import Icon from '../Icon.jsx';
import { Button, EmptyState, Field } from '../components/UI.jsx';
import { money } from '../lib/format.js';
import { commercePath } from '../lib/commerceApi.js';

export default function PaymentPage({ order, settings, proofRef, setProofRef, proofFile, onFile, proofError, onSubmit, onNavigate, onCopy }) {
  if (!order) return <EmptyState title="No payment to show" text="Your order will appear here after checkout." action={<Button onClick={() => onNavigate('shop')}>Browse the shop</Button>} />;
  return <>
    <button className="back-link" onClick={() => onNavigate('my-orders')}><Icon name="back" size={16} /> Back to my orders</button>
    <div className="payment-page"><div className="payment-main">
      <div className="payment-title"><span className="eyebrow">ORDER {order.id}</span><h1>Pay with GCash</h1><p>Send your payment, then share the reference number and a screenshot with us.</p></div>
      <section className="panel payment-amount"><div><span className="muted">Exact amount to pay</span><strong>{money(order.total)}</strong></div><Button variant="secondary" onClick={() => onCopy(String(order.total))}><Icon name="copy" size={16} /> Copy amount</Button></section>
      <section className="panel gcash-details"><div className="gcash-brand"><span className="gcash-logo">G</span><div><b>Send to {settings.gcashName}</b><span>GCash account</span></div><Button variant="ghost" onClick={() => onCopy(settings.gcashNumber)}><Icon name="copy" size={15} /> Copy</Button></div>
        <div className="gcash-number">{settings.gcashNumber}</div><div className="qr-card" aria-label="Shop GCash QR code"><img src={commercePath(settings.gcashQrUrl)} alt="Aquatica shop GCash QR" /><span>Scan to pay</span></div>
      </section>
      {order.paymentStatus === 'Under review' ? <section className="panel payment-state"><b>Payment proof submitted</b><span>Your GCash payment is being checked. You can upload another proof if this one is rejected.</span></section>
        : order.paymentStatus === 'Paid' ? <section className="panel payment-state"><b>Payment complete</b><span>This order has already been paid.</span></section>
          : <section className="panel form-panel proof-form"><div className="panel-heading"><span className="step-number">03</span><div><h2>Share your payment</h2><p>Enter the reference number from your GCash receipt.</p></div></div>
            {order.paymentStatus === 'Rejected' && <div className="error-callout"><b>Payment proof needs an update</b><span>{order.proofReason}</span></div>}
            <Field label="GCash reference number"><input className="input" placeholder="e.g. 123456789012" value={proofRef} onChange={(event) => setProofRef(event.target.value)} /><span className="field-hint">Usually 10–13 digits. You can find it in your GCash receipt.</span></Field>
            <Field label="Payment screenshot"><label className="upload-box"><input type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} /><span className="upload-icon"><Icon name="upload" size={20} /></span><b>{proofFile?.name || 'Choose a screenshot to upload'}</b><small>Raster images · Max 2 MB</small></label></Field>
            {proofError && <p className="inline-error">{proofError}</p>}
            <Button className="button-full" onClick={() => onSubmit(order.id)}>Submit payment proof <Icon name="arrow" size={16} /></Button>
          </section>}
    </div><aside className="payment-side"><div className="panel order-mini"><h3>Order summary</h3>
      {order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}
      <div className="summary-divider" /><div className="summary-row"><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div className="summary-row"><span>{order.delivery === 'Delivery' ? 'Delivery' : 'Pickup'}</span><b>{order.deliveryFee ? money(order.deliveryFee) : 'Free'}</b></div><div className="summary-total"><span>Exact amount</span><b>{money(order.total)}</b></div>
    </div><div className="secure-note"><Icon name="clock" size={16} /> Your payment is checked by our team before your order is prepared.</div></aside></div>
  </>;
}
