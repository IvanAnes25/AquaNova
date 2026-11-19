import Icon from '../Icon.jsx';
import { ProductImage } from '../components/ProductGrid.jsx';
import { Button, EmptyState, OrderSummary, SectionTitle } from '../components/UI.jsx';
import { money } from '../lib/format.js';

export default function CartPage({ cart, products, subtotal, fee, total, deliveryMethod, onChangeQty, onNavigate }) {
  return <>
    <SectionTitle eyebrow="YOUR PICKS" title="Your cart" action={<Button variant="secondary" onClick={() => onNavigate('shop')}><Icon name="back" size={16} /> Keep shopping</Button>} />
    {!cart.length
      ? <EmptyState icon="cart" title="Your cart is waiting" text="Find something lovely for your aquarium and it will show up here." action={<Button onClick={() => onNavigate('shop')}>Explore the shop <Icon name="arrow" size={16} /></Button>} />
      : <div className="cart-layout"><div className="panel cart-list">{cart.map((line) => <div className="cart-line" key={line.productId}>
        <ProductImage product={products.find((item) => item.id === line.productId)} />
        <div className="cart-line-info"><b>{line.name}</b><span>{money(line.price)} each</span>{products.find((item) => item.id === line.productId)?.stock === 0 && <span className="status-label status-sold-out">! Sold out</span>}<Button variant="danger-soft" className="remove-button" aria-label={`Delete ${line.name} from cart`} onClick={async () => { await onChangeQty(line.productId, -line.quantity); }}>Delete</Button></div>
        <div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => onChangeQty(line.productId, -1)}>−</button><span>{line.quantity}</span><button aria-label="Increase quantity" onClick={() => onChangeQty(line.productId, 1)}>+</button></div>
        <b className="cart-line-total">{money(line.price * line.quantity)}</b>
      </div>)}</div>
      <OrderSummary subtotal={subtotal} fee={fee} total={total} fulfillment={deliveryMethod} action={<Button className="button-full" onClick={() => onNavigate('checkout')}>Continue to checkout <Icon name="arrow" size={16} /></Button>} /></div>}
  </>;
}
