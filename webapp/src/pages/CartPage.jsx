import Icon from '../Icon.jsx';
import { ProductImage } from '../components/ProductGrid.jsx';
import { Button, EmptyState, OrderSummary, SectionTitle } from '../components/UI.jsx';
import { money } from '../lib/format.js';

export default function CartPage({ cart, products, subtotal, fee, total, onChangeQty, onNavigate }) {
  return <>
    <SectionTitle eyebrow="YOUR PICKS" title="Your cart" action={<Button variant="secondary" onClick={() => onNavigate('shop')}><Icon name="back" size={16} /> Keep shopping</Button>} />
    {!cart.length
      ? <EmptyState icon="cart" title="Your cart is waiting" text="Find something lovely for your aquarium and it will show up here." action={<Button onClick={() => onNavigate('shop')}>Explore the shop <Icon name="arrow" size={16} /></Button>} />
      : <div className="cart-layout"><div className="panel cart-list">{cart.map((line) => <div className="cart-line" key={line.productId}>
        <ProductImage product={products.find((item) => item.id === line.productId)} />
        <div className="cart-line-info"><b>{line.name}</b><span>{money(line.price)} each</span><button className="remove-button" onClick={() => onChangeQty(line.productId, -line.quantity)}>Remove</button></div>
        <div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => onChangeQty(line.productId, -1)}>−</button><span>{line.quantity}</span><button aria-label="Increase quantity" onClick={() => onChangeQty(line.productId, 1)}>+</button></div>
        <b className="cart-line-total">{money(line.price * line.quantity)}</b>
      </div>)}</div>
      <OrderSummary subtotal={subtotal} fee={fee} total={total} action={<Button className="button-full" onClick={() => onNavigate('checkout')}>Continue to checkout <Icon name="arrow" size={16} /></Button>} /></div>}
  </>;
}
