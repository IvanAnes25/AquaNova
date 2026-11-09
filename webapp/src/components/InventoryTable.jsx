import Icon from '../Icon.jsx';
import { stockLabel } from '../lib/format.js';
import { ProductImage } from './ProductGrid.jsx';
import { Status } from './UI.jsx';

export function InventoryTable({ products, onStock }) {
  return <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>SKU</th><th>STOCK ON HAND</th><th>STATUS</th><th /></tr></thead>
    <tbody>{products.map((product) => <tr key={product.id}>
      <td><div className="table-person inventory-product"><ProductImage product={product} /><b>{product.name}</b></div></td>
      <td>{product.category}</td><td className="sku">{product.id.toUpperCase()}</td><td><b className="stock-number">{product.stock}</b> <span className="muted">units</span></td>
      <td><Status>{stockLabel(product.stock)}</Status></td><td><button className="text-button" onClick={() => onStock(product)}>Update <Icon name="arrow" size={14} /></button></td>
    </tr>)}</tbody>
  </table></div>;
}

export function MovementTable({ movements }) {
  return <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CHANGE</th><th>REASON</th><th>ORDER</th><th>DATE</th></tr></thead>
    <tbody>{movements.map((movement) => <tr key={movement.id}>
      <td><div className="table-person"><span className="movement-mark"><Icon name="box" size={15} /></span><b>{movement.product}</b></div></td>
      <td><b className={movement.change > 0 ? 'stock-plus' : 'stock-minus'}>{movement.change > 0 ? '+' : ''}{movement.change}</b></td>
      <td>{movement.reason}</td><td>{movement.orderId || '—'}</td><td>{movement.date}</td>
    </tr>)}</tbody>
  </table></div>;
}
