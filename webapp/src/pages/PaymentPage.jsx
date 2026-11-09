import Icon from '../Icon.jsx';
import { Button, EmptyState, Field } from '../components/UI.jsx';
import { money } from '../lib/format.js';

function QRCode() {
  const bits = '1111111010011011111111000001001110000010111010110111010101110110101101010010110101101011100010011011010001010101110001011110011010010000110101101011001010101101010010101100010010011011111111010101011011111110000000101100101000000011111011011100110100101001100111010001010010111010111100111010001001101101011011001000101110110011111110100010010001111011011011101000101010001101001111101010101011100010111010110010101001011000010111010010101110011101010101011101110010000101001010110010100110111001000000100111011101101001000100010010111011010010100111100010101010000011101111101101011101001111000010001101000101011001001000101110111010110111000010011001010110001011110100111000010111101101001000010011111011110111101010010101101011000011010111010111001011000100010000001111111100110110110101111111';
  return <div className="qr-matrix">{Array.from(bits).map((bit, index) => <i key={index} className={bit === '1' ? 'qr-on' : ''} />)}</div>;
}

export default function PaymentPage({ order, proofRef, setProofRef, proofFile, onFile, proofError, onSubmit, onNavigate, onCopy }) {
  if (!order) return <EmptyState title="No payment to show" text="Your order will appear here after checkout." action={<Button onClick={() => onNavigate('shop')}>Browse the shop</Button>} />;
  return <>
    <button className="back-link" onClick={() => onNavigate('my-orders')}><Icon name="back" size={16} /> Back to my orders</button>
    <div className="payment-page"><div className="payment-main">
      <div className="payment-title"><span className="eyebrow">ORDER {order.id}</span><h1>Pay with GCash</h1><p>Send your payment, then share the reference number and a screenshot with us.</p></div>
      <section className="panel payment-amount"><div><span className="muted">Amount to pay</span><strong>{money(order.total)}</strong></div><Button variant="secondary" onClick={() => onCopy(String(order.total))}><Icon name="copy" size={16} /> Copy amount</Button></section>
      <section className="panel gcash-details"><div className="gcash-brand"><span className="gcash-logo">G</span><div><b>Send to Aquatica Nasugbu</b><span>GCash account</span></div><Button variant="ghost" onClick={() => onCopy('0917 555 0142')}><Icon name="copy" size={15} /> Copy</Button></div>
        <div className="gcash-number">0917 555 0142</div><div className="qr-card" aria-label="Sample GCash QR code"><QRCode /><span>Scan to pay</span></div><p className="qr-disclaimer">Sample QR for design preview. Confirm the recipient name before paying.</p>
      </section>
      <section className="panel form-panel proof-form"><div className="panel-heading"><span className="step-number">03</span><div><h2>Share your payment</h2><p>Enter the reference number from your GCash receipt.</p></div></div>
        {order.paymentStatus === 'Rejected' && <div className="error-callout"><b>Payment proof needs an update</b><span>{order.proofReason}</span></div>}
        <Field label="GCash reference number"><input className="input" placeholder="e.g. 123456789012" value={proofRef} onChange={(event) => setProofRef(event.target.value)} /><span className="field-hint">Usually 10–13 digits. You can find it in your GCash receipt.</span></Field>
        <Field label="Payment screenshot"><label className="upload-box"><input type="file" accept="image/jpeg,image/png" onChange={(event) => onFile(event.target.files?.[0])} /><span className="upload-icon"><Icon name="upload" size={20} /></span><b>{proofFile?.name || 'Choose a screenshot to upload'}</b><small>JPG or PNG · Max 2 MB</small></label></Field>
        {proofError && <p className="inline-error">{proofError}</p>}
        <Button className="button-full" onClick={() => onSubmit(order.id)}>Submit payment proof <Icon name="arrow" size={16} /></Button>
      </section>
    </div><aside className="payment-side"><div className="panel order-mini"><h3>Order summary</h3>
      {order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}
      <div className="summary-divider" /><div className="summary-row"><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div className="summary-row"><span>{order.delivery === 'Delivery' ? 'Delivery' : 'Pickup'}</span><b>{order.deliveryFee ? money(order.deliveryFee) : 'Free'}</b></div><div className="summary-total"><span>Total paid</span><b>{money(order.total)}</b></div>
    </div><div className="secure-note"><Icon name="clock" size={16} /> Your payment is checked by our team before your order is prepared.</div></aside></div>
  </>;
}
