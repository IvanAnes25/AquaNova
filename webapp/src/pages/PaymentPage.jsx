import Icon from '../Icon.jsx';
import { Button, EmptyState, Field } from '../components/UI.jsx';
import { money } from '../lib/format.js';
import { commercePath } from '../lib/commerceApi.js';

const GCASH_NUMBER = '0930 438 4124';

export default function PaymentPage({ order, settings, proofRef, setProofRef, proofFile, onFile, proofError, onSubmit, onNavigate, onCopy }) {
  if (!order) return <EmptyState title="No payment to show" text="Your order will appear here after checkout." action={<Button onClick={() => onNavigate('shop')}>Browse the shop</Button>} />;
  return <>
    <button className="back-link" onClick={() => onNavigate('my-orders')}><Icon name="back" size={16} /> Back to my orders</button>
    <div className="payment-page">
      <header className="payment-title">
        <div><h1>Pay with GCash</h1><p>Order {order.id} · {order.delivery} · total {money(order.total)}</p></div>
        <div className="payment-status"><span>Payment status</span><b>{order.paymentStatus}</b></div>
      </header>
      <ol className="payment-steps" aria-label="Payment steps">
        <li><span>1</span><div><b>Scan the QR or use the card details</b><small>Open GCash and pay the shop</small></div></li>
        <li><span>2</span><div><b>Send the exact amount</b><small>{money(order.total)}, no more, no less</small></div></li>
        <li><span>3</span><div><b>Upload your proof</b><small>Reference number and screenshot</small></div></li>
      </ol>
      <div className="payment-layout">
        <div className="payment-left">
          <section className="panel payment-instructions">
            <div className="payment-section-heading"><b>1 · Send the payment</b><span>Use the shop card details or scan the QR code</span></div>
            <div className="payment-amount"><div><span>Exact amount to send</span><strong>{money(order.total)}</strong></div><Button variant="secondary" onClick={() => onCopy(String(order.total))}><Icon name="copy" size={16} /> Copy amount</Button></div>
            <div className="payment-methods">
              <section className="gcash-card" aria-label={`GCash payment card for ${settings.gcashName}`}>
                <div className="gcash-card-top"><span className="gcash-logo">G</span><div><b>GCash</b><small>Shop payment account</small></div><span className="gcash-recipient">{settings.gcashName}</span></div>
                <span className="gcash-chip" aria-hidden="true" />
                <div className="gcash-card-number-label">Number</div>
                <div className="gcash-card-number">{GCASH_NUMBER}</div>
              </section>
              <div className="qr-card" aria-label="Shop GCash QR code"><img src={commercePath(settings.gcashQrUrl)} alt="Aquatica shop GCash QR" /><span><Icon name="scan" size={15} /> Scan to pay in GCash</span></div>
            </div>
            <div className="payment-account-details">
              <div><span>Account name</span><b>{settings.gcashName}</b></div>
              <div><span>GCash number</span><b>{GCASH_NUMBER}</b><button aria-label="Copy GCash number" onClick={() => onCopy(GCASH_NUMBER)}><Icon name="copy" size={14} /></button></div>
              <div><span>Order number</span><b>{order.id}</b></div>
            </div>
          </section>
          <div className="panel order-mini payment-order-summary"><h3>Order summary</h3>
            {order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}
            <div className="summary-divider" /><div className="summary-row"><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div className="summary-row"><span>{order.delivery === 'Delivery' ? 'Delivery' : 'Pickup'}</span><b>{order.deliveryFee ? money(order.deliveryFee) : 'Free'}</b></div><div className="summary-total"><span>Exact amount</span><b>{money(order.total)}</b></div>
          </div>
        </div>
        <aside className="panel payment-proof-panel">
          <div className="payment-section-heading"><b>2 · Submit your proof</b><span>The shop checks it against its GCash records</span></div>
          {order.paymentStatus === 'Under review' ? <section className="payment-state"><b>Payment proof submitted</b><span>Your GCash payment is being checked. You can upload another proof if this one is rejected.</span></section>
            : order.paymentStatus === 'Paid' ? <section className="payment-state"><b>Payment complete</b><span>This order has already been paid.</span></section>
              : <div className="proof-form">
                {order.paymentStatus === 'Rejected' && <div className="error-callout"><b>Payment proof needs an update</b><span>{order.proofReason}</span></div>}
                <Field label="GCash reference number"><input className="input" placeholder="e.g. 123456789012" value={proofRef} onChange={(event) => setProofRef(event.target.value)} /><span className="field-hint">Usually 10–13 digits. You can find it in your GCash receipt.</span></Field>
                <Field label="Payment screenshot"><label className="upload-box"><input type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} /><span className="upload-icon"><Icon name="upload" size={20} /></span><b>{proofFile?.name || 'Upload payment screenshot'}</b><small>JPG or PNG · up to 2 MB</small></label></Field>
                {proofError && <p className="inline-error">{proofError}</p>}
                <Button className="button-full" onClick={() => onSubmit(order.id)}>Submit payment proof <Icon name="arrow" size={16} /></Button>
              </div>}
          <div className="secure-note"><Icon name="clock" size={16} /> Your payment is checked by our team before your order is prepared.</div>
        </aside>
      </div>
    </div>
  </>;
}
