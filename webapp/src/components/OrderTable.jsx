import Icon from '../Icon.jsx';
import { initials, money } from '../lib/format.js';
import { Status } from './UI.jsx';

export default function OrderTable({ orders, onOpen, owner = false }) {
  if (!orders.length) return <div className="table-empty">No orders here just yet.</div>;
  return <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>PAYMENT</th><th>STATUS</th><th /></tr></thead>
    <tbody>{orders.map((order) => <tr key={order.id}>
      <td><button className="order-id-link" onClick={() => onOpen(order)}>{order.id}</button><small className="table-date">{order.date}</small></td>
      <td><div className="table-person"><span className="avatar">{initials(order.customer)}</span><b>{order.customer}</b></div></td>
      <td>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</td><td><b>{money(order.total)}</b></td>
      <td><div className="payment-cell">{order.method}<small>{order.paymentStatus}</small></div></td><td><Status>{order.statusLabel || order.status}</Status></td>
      <td><button className="icon-button" aria-label={`View ${order.id}`} onClick={() => onOpen(order)}><Icon name={owner ? 'arrow' : 'eye'} size={16} /></button></td>
    </tr>)}</tbody>
  </table></div>;
}
