import Icon from '../Icon.jsx';
import { Button, Field, OrderSummary, SectionTitle } from '../components/UI.jsx';

function PayOption({ selected, onClick, title, subtitle, mark, disabled, disabledReason }) {
  return <button disabled={disabled} className={`pay-option ${selected ? 'pay-option-selected' : ''} ${disabled ? 'pay-option-disabled' : ''}`} onClick={onClick}>
    <span className={`pay-mark ${mark === 'G' ? 'gcash-mini' : ''}`}>{mark}</span><span><b>{title}</b><small>{disabled ? (disabledReason || (title === 'Cash at the shop' ? 'Available for pickup only' : 'Available for delivery only')) : subtitle}</small></span><i />
  </button>;
}

export default function CheckoutPage({ cart, subtotal, fee, total, deliveryMethod, setDeliveryMethod, paymentMethod, setPaymentMethod, checkoutInfo, setCheckoutInfo, onPlaceOrder, onNavigate, settings }) {
  const gcashEnabled = settings.gcashEnabled !== false && Boolean(settings.gcashReady);
  const codEnabled = settings.codEnabled !== false;
  const cashPickupEnabled = settings.cashPickupEnabled !== false;
  const selectDefaultPayment = (fulfillment) => {
    if (gcashEnabled) return 'GCash';
    if (fulfillment === 'Delivery' && codEnabled) return 'Cash on delivery';
    if (fulfillment === 'Pickup' && cashPickupEnabled) return 'Cash at the shop';
    return '';
  };
  const selectedPaymentEnabled = paymentMethod === 'GCash' ? gcashEnabled
    : paymentMethod === 'Cash on delivery' ? codEnabled
      : paymentMethod === 'Cash at the shop' ? cashPickupEnabled : false;
  return <>
    <SectionTitle eyebrow="ONE MORE STEP" title="Checkout" action={<Button variant="secondary" onClick={() => onNavigate('cart')}><Icon name="back" size={16} /> Back to cart</Button>} />
    <div className="checkout-layout"><div className="checkout-main">
      <section className="panel form-panel">
        <div className="panel-heading"><span className="step-number">01</span><div><h2>How would you like your order?</h2><p>Choose delivery or collect from our shop.</p></div></div>
        <div className="choice-grid">
          <button className={`choice-card ${deliveryMethod === 'Delivery' ? 'choice-selected' : ''}`} onClick={() => { setDeliveryMethod('Delivery'); setPaymentMethod(selectDefaultPayment('Delivery')); }}><Icon name="pin" /><div><b>Delivery</b><span>To your door in Nasugbu</span></div><i /></button>
          <button className={`choice-card ${deliveryMethod === 'Pickup' ? 'choice-selected' : ''}`} onClick={() => { setDeliveryMethod('Pickup'); setPaymentMethod(selectDefaultPayment('Pickup')); }}><Icon name="bag" /><div><b>Pick up at shop</b><span>Collect from Aquatica Nasugbu</span></div><i /></button>
        </div>
        {deliveryMethod === 'Delivery' ? <div className="form-grid">
          <Field label="Full name"><input className="input" value={checkoutInfo.name} onChange={(event) => setCheckoutInfo({ ...checkoutInfo, name: event.target.value })} /></Field>
          <Field label="Phone number"><input className="input" value={checkoutInfo.phone} onChange={(event) => setCheckoutInfo({ ...checkoutInfo, phone: event.target.value })} /></Field>
          <Field label="Delivery address" className="field-full"><input className="input" value={checkoutInfo.address} onChange={(event) => setCheckoutInfo({ ...checkoutInfo, address: event.target.value })} /></Field>
          <Field label="Order note (optional)" className="field-full"><textarea className="input textarea" placeholder="Anything we should know?" value={checkoutInfo.notes} onChange={(event) => setCheckoutInfo({ ...checkoutInfo, notes: event.target.value })} /></Field>
        </div> : <div className="pickup-address"><Icon name="pin" size={18} /><span><b>{settings.shopName || 'Aquatica Nasugbu'}</b><small>{settings.shopAddress || 'Nasugbu, Batangas'} · We’ll let you know when your order is ready.</small></span></div>}
      </section>
      <section className="panel form-panel">
        <div className="panel-heading"><span className="step-number">02</span><div><h2>Payment method</h2><p>Choose how you’d like to pay for this order.</p></div></div>
        <div className="payment-options">
          <PayOption selected={paymentMethod === 'GCash'} onClick={() => setPaymentMethod('GCash')} title="GCash" subtitle="Pay now with GCash" mark="G" disabled={!gcashEnabled} disabledReason={settings.gcashEnabled === false ? 'Disabled in shop settings' : 'Unavailable until shop payment details are configured'} />
          <PayOption selected={paymentMethod === 'Cash on delivery'} onClick={() => setPaymentMethod('Cash on delivery')} title="Cash on delivery" subtitle="Pay when your order arrives" mark="₱" disabled={deliveryMethod === 'Pickup' || !codEnabled} disabledReason={!codEnabled ? 'Disabled in shop settings' : undefined} />
          <PayOption selected={paymentMethod === 'Cash at the shop'} onClick={() => setPaymentMethod('Cash at the shop')} title="Cash at the shop" subtitle="Pay when you collect your order" mark="₱" disabled={deliveryMethod === 'Delivery' || !cashPickupEnabled} disabledReason={!cashPickupEnabled ? 'Disabled in shop settings' : undefined} />
        </div>
        {paymentMethod === 'GCash' && <div className="inline-info"><span className="info-mark">i</span><span>You’ll see the exact amount, GCash details and upload a payment screenshot after placing your order.</span></div>}
      </section>
    </div>
    <OrderSummary items={cart} subtotal={subtotal} fee={fee} total={total} fulfillment={deliveryMethod} action={<Button className="button-full" disabled={!cart.length || !selectedPaymentEnabled || (deliveryMethod === 'Delivery' && (!checkoutInfo.address.trim() || !checkoutInfo.phone.trim()))} onClick={() => onPlaceOrder(paymentMethod)}>Place order <Icon name="arrow" size={16} /></Button>} />
    </div>
  </>;
}
