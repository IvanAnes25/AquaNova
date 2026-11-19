import { useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { money } from '../lib/format.js';

export function Button({ children, variant = 'primary', className = '', loading = false, disabled = false, onClick, ...props }) {
  const [clickLoading, setClickLoading] = useState(false);
  const clickLocked = useRef(false);
  const busy = loading || clickLoading;
  const handleClick = async (event) => {
    if (clickLocked.current || disabled || loading) {
      event.preventDefault();
      return;
    }
    if (!onClick) return;
    clickLocked.current = true;
    setClickLoading(true);
    try {
      await onClick(event);
    } finally {
      clickLocked.current = false;
      setClickLoading(false);
    }
  };
  return <button className={`button button-${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick ? handleClick : undefined} {...props}>
    {busy && <span className="button-spinner" aria-hidden="true" />}{children}
  </button>;
}

export function Status({ children }) {
  const value = String(children ?? '');
  const low = value === 'Low stock';
  const soldOut = value === 'Sold out' || value === '! Sold out';
  return <span className={`status-label ${low ? 'status-low' : ''} ${soldOut ? 'status-sold-out' : ''}`}>{low || soldOut ? '! ' : ''}{soldOut ? 'Sold out' : value}</span>;
}

export function Field({ label, children, className = '' }) {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}</label>;
}

export function SectionTitle({ eyebrow, title, action }) {
  return <div className="section-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>{action}</div>;
}

export function PanelHeader({ title, subtitle, action }) {
  return <div className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, note, icon, trend, accent = false }) {
  return <article className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
    <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={18} /></span></div>
    <div className="stat-value">{value}</div><div className="stat-note">{trend && <span className="trend">{trend}</span>}{note}</div>
  </article>;
}

export function EmptyState({ icon, title, text, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon || 'search'} size={23} /></span><h2>{title}</h2><p>{text}</p>{action}</div>;
}

export function Modal({ title, onClose, children, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
      {children}
    </section>
  </div>;
}

export function OrderSummary({ items, subtotal, fee, total, action, fulfillment = 'Delivery' }) {
  return <aside className="panel order-summary"><h2>Order summary</h2>
    {items?.map((item) => <div className="summary-item" key={item.productId}><span>{item.quantity} × {item.name}</span><b>{money(item.price * item.quantity)}</b></div>)}
    <div className="summary-divider" /><div className="summary-row"><span>Subtotal</span><b>{money(subtotal)}</b></div>
    {fulfillment === 'Delivery' && <div className="summary-row"><span>Delivery fee</span><b>{fee ? money(fee) : 'Free'}</b></div>}
    <div className="summary-total"><span>Total</span><b>{money(total)}</b></div>
    {action && <div className="summary-after">{action}</div>}
    <div className="summary-reassurance"><Icon name="check" size={15} /> No hidden fees. Just happy fish.</div>
  </aside>;
}

export function SkeletonGrid({ count = 6 }) {
  return <div className="skeleton-grid" aria-label="Loading items">
    {Array.from({ length: count }).map((_, i) => (
      <div className="skeleton-card" key={i}>
        <div className="skeleton-card-img skeleton-shimmer" />
        <div className="skeleton-line skeleton-shimmer" />
        <div className="skeleton-line-sm skeleton-shimmer" />
      </div>
    ))}
  </div>;
}

export function SkeletonList({ count = 4, className = '' }) {
  return <div className={`skeleton-list-container ${className}`} aria-label="Loading list">
    {Array.from({ length: count }).map((_, i) => (
      <div className="skeleton-row" key={i}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="skeleton-line skeleton-shimmer" style={{ width: '45%' }} />
          <div className="skeleton-line-sm skeleton-shimmer" style={{ width: '75%' }} />
        </div>
        <div className="skeleton-shimmer" style={{ width: '60px', height: '24px', borderRadius: '4px' }} />
      </div>
    ))}
  </div>;
}

export function SkeletonRoute() {
  return <div className="route-skeleton" role="status" aria-label="Loading page">
    <div className="route-skeleton-title skeleton-shimmer" />
    <div className="panel route-skeleton-panel"><SkeletonList count={5} /></div>
  </div>;
}
