import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon.jsx';
import { Button, EmptyState, SectionTitle, SkeletonList, Status } from '../components/UI.jsx';
import { orderNeedsAction } from '../data.js';
import { money } from '../lib/format.js';

const orderTabs = [
  { label: 'Needs action', matches: orderNeedsAction },
  { label: 'Preparing', matches: (order) => order.status === 'Preparing' },
  { label: 'Ready', matches: (order) => order.status === 'Ready' },
  { label: 'Completed', matches: (order) => order.status === 'Completed' },
  { label: 'Cancelled', matches: (order) => order.status === 'Cancelled' },
];

function createdAt(order) {
  return Number(order.createdAt) || Number(order.id.match(/\d+$/)?.[0]) || 0;
}

function nextAction(order) {
  if (order.status === 'Pending') {
    if (order.method !== 'GCash') return { label: 'Confirm order', action: 'confirm' };
    if (order.paymentStatus === 'Under review') return { label: 'Check proof', action: 'proof' };
    return { label: order.paymentStatus === 'Rejected' ? 'Waiting for new proof' : 'Waiting for payment', disabled: true };
  }
  if (order.status === 'Preparing') return { label: 'Mark as ready', action: 'ready' };
  if (order.status === 'Ready') {
    return order.method === 'GCash'
      ? { label: 'Complete order', action: 'complete' }
      : { label: order.delivery === 'Pickup' ? 'Handed over and paid' : 'Delivered and paid', action: 'complete' };
  }
  return null;
}

function hasNextAction(order) {
  return Boolean(nextAction(order)?.action);
}

export default function OrdersPage({
  orders, filter, setFilter, query, setQuery, selectedOrderId, setSelectedOrderId,
  onCheckProof, onConfirm, onMarkReady, onComplete, onCancel, loading = false,
}) {
  const [deliveryBy, setDeliveryBy] = useState('owner');
  const sortedOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return orders
      .filter((order) => !search || `${order.id} ${order.customer} ${order.items.map((item) => item.name).join(' ')}`.toLowerCase().includes(search))
      .sort((left, right) => createdAt(right) - createdAt(left));
  }, [orders, query]);
  const activeTab = orderTabs.find((tab) => tab.label === filter) || orderTabs[0];
  const visibleOrders = sortedOrders.filter(activeTab.matches);
  const selectedOrder = visibleOrders.find((order) => order.id === selectedOrderId) || null;
  const nextOrder = () => {
    const currentIndex = visibleOrders.findIndex((order) => order.id === selectedOrderId);
    const following = visibleOrders.slice(currentIndex + 1).find(hasNextAction)
      || visibleOrders.find(hasNextAction)
      || visibleOrders.slice(currentIndex + 1)[0]
      || visibleOrders[0];
    if (following) setSelectedOrderId(following.id);
  };

  useEffect(() => {
    if (!selectedOrder) {
      setSelectedOrderId(visibleOrders.find(hasNextAction)?.id || visibleOrders[0]?.id || null);
    }
  }, [selectedOrder, setSelectedOrderId, visibleOrders]);

  const action = selectedOrder && nextAction(selectedOrder);
  const runAction = async () => {
    if (!selectedOrder || !action) return;
    if (action.action === 'proof') await onCheckProof(selectedOrder);
    if (action.action === 'confirm') await onConfirm(selectedOrder);
    if (action.action === 'ready') await onMarkReady(selectedOrder, deliveryBy);
    if (action.action === 'complete') await onComplete(selectedOrder);
  };

  return <>
    <SectionTitle eyebrow="SHOP MANAGEMENT" title="Orders" action={<Button variant="secondary" disabled={!visibleOrders.length} onClick={nextOrder}>Next order</Button>} />
    <div className="orders-toolbar">
      <div className="category-tabs order-tabs" role="tablist" aria-label="Order status">
        {orderTabs.map((tab) => {
          const count = orders.filter(tab.matches).length;
          return <button key={tab.label} role="tab" aria-selected={filter === tab.label} className={`category-tab ${filter === tab.label ? 'category-tab-active' : ''}`} onClick={() => setFilter(tab.label)}>
            {tab.label}<span className="order-tab-count">{count}</span>
          </button>;
        })}
      </div>
      <div className="search-field"><Icon name="search" size={17} /><input placeholder="Search orders..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    </div>
    <div className="orders-inbox">
      <section className="panel orders-inbox-list" aria-label={`${filter} orders`}>
        {loading || orders == null ? <SkeletonList count={4} /> : visibleOrders.length ? visibleOrders.map((order) => <button key={order.id} className={`order-inbox-item ${selectedOrderId === order.id ? 'order-inbox-item-active' : ''}`} onClick={() => setSelectedOrderId(order.id)}>
          <span className="order-inbox-heading"><b>{order.id}</b><span>{order.date}</span></span>
          <strong>{order.customer}</strong>
          <span className="order-inbox-items">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</span>
          <span className="order-inbox-bottom"><Status>{order.paymentStatus}</Status><b>{money(order.total)}</b></span>
        </button>) : <div className="order-inbox-empty">No orders in this tab.</div>}
      </section>
      {selectedOrder ? <section className="panel order-inbox-detail" aria-label={`Order ${selectedOrder.id} details`}>
        <div className="order-detail-heading"><div><span className="eyebrow">{selectedOrder.date}</span><h2>{selectedOrder.id}</h2></div><Status>{selectedOrder.statusLabel || selectedOrder.status}</Status></div>
        <div className="order-detail-customer"><b>{selectedOrder.customer}</b><span>{selectedOrder.phone}</span><span>{selectedOrder.delivery} · {selectedOrder.delivery === 'Pickup' ? selectedOrder.pickupLocation : selectedOrder.address}</span></div>
        <div className="order-detail-items"><h3>Items</h3>{selectedOrder.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}</div>
        <div className="order-detail-payment"><div><span>Payment method</span><b>{selectedOrder.method}</b></div><div><span>Payment status</span><Status>{selectedOrder.paymentStatus}</Status></div>{selectedOrder.method === 'GCash' && selectedOrder.reference && <div><span>Reference</span><b>{selectedOrder.reference}</b></div>}{selectedOrder.proofReason && <p className="reject-note">Proof rejected: {selectedOrder.proofReason}</p>}</div>
        {action && <div className="order-inbox-actions">
          {action.action === 'ready' && selectedOrder.delivery === 'Delivery' && <label className="field">Delivery provider<select className="input" value={deliveryBy} onChange={(event) => setDeliveryBy(event.target.value)}><option value="owner">Owner delivery</option><option value="lalamove">Lalamove</option></select></label>}
          <Button className="button-full" disabled={action.disabled} onClick={runAction}>{action.label}{action.action === 'proof' && <Icon name="arrow" size={16} />}</Button>
          {!['Completed', 'Cancelled'].includes(selectedOrder.status) && <Button variant="danger-soft" className="button-full" onClick={async () => { await onCancel(selectedOrder); }}>Cancel order</Button>}
        </div>}
      </section> : <section className="panel order-inbox-placeholder"><EmptyState title={filter === 'Needs action' && !query ? 'All caught up' : query ? 'No matching orders' : 'No orders here'} text={query ? 'Try another order number or customer name.' : filter === 'Needs action' ? 'New orders that need attention will appear here.' : 'Orders in this status will appear here.'} /></section>}
    </div>
  </>;
}
