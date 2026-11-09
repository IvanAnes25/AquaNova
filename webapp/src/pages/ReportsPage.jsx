import { ProductImage } from '../components/ProductGrid.jsx';
import { Button, PanelHeader, SectionTitle, StatCard } from '../components/UI.jsx';
import { money } from '../lib/format.js';

function SalesChart() {
  const values = [28, 38, 34, 48, 42, 63, 53, 70, 56, 76, 61, 84, 74, 91, 67, 82, 71, 96, 78, 89, 72, 103, 84, 98, 80, 110, 93, 104];
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${115 - value}`).join(' ');
  return <div className="chart-wrap"><div className="chart-y-labels"><span>₱12k</span><span>₱9k</span><span>₱6k</span><span>₱3k</span><span>₱0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 100 115" preserveAspectRatio="none" aria-label="Sales over the month"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".32" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs><polygon points={`0,115 ${points} 100,115`} fill="url(#salesFill)" /><polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><div className="chart-x-labels"><span>Nov 1</span><span>Nov 7</span><span>Nov 14</span><span>Nov 21</span><span>Nov 30</span></div></div></div>;
}

export default function ReportsPage({ products, onToast }) {
  return <>
    <SectionTitle eyebrow="A CLOSER LOOK AT YOUR SHOP" title="Reports" action={<Button variant="secondary" onClick={() => onToast('Report downloaded (demo).')}>Download report</Button>} />
    <div className="report-controls"><div className="category-tabs"><button className="category-tab category-tab-active">This month</button><button className="category-tab" onClick={() => onToast('Showing last month sample data.')}>Last month</button><button className="category-tab" onClick={() => onToast('Showing last 7 days sample data.')}>Last 7 days</button></div><span className="muted">Nov 1 – Nov 30, 2026</span></div>
    <div className="report-stats"><StatCard label="Gross sales" value={money(148260)} note="vs. last month" trend="↑ 14.8%" icon="chart" accent /><StatCard label="Orders placed" value="186" note="vs. last month" trend="↑ 9.2%" icon="orders" /><StatCard label="Average order" value={money(797)} note="Average basket size" icon="bag" /><StatCard label="New customers" value="32" note="this month" trend="↑ 5" icon="users" /></div>
    <div className="report-grid"><section className="panel report-panel"><PanelHeader title="Sales over time" subtitle="Your daily sales for November" action={<span className="chart-legend"><i /> Sales</span>} /><SalesChart /></section>
      <section className="panel report-panel"><PanelHeader title="Popular products" subtitle="Top sellers by number of orders" /><div className="popular-list">{products.slice(0, 5).map((product, index) => <div className="popular-row" key={product.id}><span className="popular-rank">0{index + 1}</span><ProductImage product={product} /><span>{product.name}</span><div className="popular-bar"><i style={{ width: `${90 - index * 13}%` }} /></div><b>{[48, 36, 29, 22, 16][index]}</b></div>)}</div></section>
    </div>
    <section className="panel report-panel"><PanelHeader title="Order breakdown" subtitle="How customers are paying" /><div className="breakdown-row">{[['GCash', '58%', '108 orders', 'legend-blue', '58%'], ['Cash on delivery', '27%', '50 orders', 'legend-cyan', '27%'], ['Cash at the shop', '15%', '28 orders', 'legend-amber', '15%']].map(([label, percent, count, color, width]) => <div className="breakdown-block" key={label}><span><i className={color} /> {label}</span><b>{percent}</b><div className={`breakdown-bar ${color.replace('legend-', '')}`}><i style={{ width }} /></div><small>{count}</small></div>)}</div></section>
  </>;
}
