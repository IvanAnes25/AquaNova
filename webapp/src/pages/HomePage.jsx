import Icon from '../Icon.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import { Button } from '../components/UI.jsx';

export default function HomePage({ products, onNavigate, onProduct, onAdd }) {
  return <>
    <section className="customer-hero">
      <div className="hero-copy"><span className="hero-kicker">A LITTLE PIECE OF THE OCEAN</span><h1>Find your next<br /><span>favorite</span> fin.</h1><p>Thoughtful picks for happy fish and beautiful aquariums, right here in Nasugbu.</p><Button onClick={() => onNavigate('shop')}>Explore the shop <Icon name="arrow" size={16} /></Button></div>
      <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-fish">🐠</div>
      <div className="hero-note"><span className="note-dot" /> Curated with care <span>·</span> Nasugbu, Batangas</div>
    </section>
    <div className="home-section-head"><div><div className="eyebrow">A GOOD PLACE TO START</div><h2>Shop the collection</h2></div><button className="text-button" onClick={() => onNavigate('shop')}>View all <Icon name="arrow" size={15} /></button></div>
    <ProductGrid products={products.slice(0, 4)} onSelect={onProduct} onAdd={onAdd} />
    <div className="promise-row">
      <div className="promise-item"><span className="promise-icon">✳</span><div><b>Healthy fish, happy homes</b><span>Picked with care by our team</span></div></div>
      <div className="promise-item"><span className="promise-icon">⌖</span><div><b>Local to Nasugbu</b><span>Delivery and shop pickup available</span></div></div>
      <div className="promise-item"><span className="promise-icon">♡</span><div><b>Here for your aquarium</b><span>Friendly advice whenever you need</span></div></div>
    </div>
  </>;
}
