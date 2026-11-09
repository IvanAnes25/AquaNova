import Icon from '../Icon.jsx';
import { initials, money } from '../lib/format.js';
import { Button, PanelHeader, SectionTitle, StatCard } from '../components/UI.jsx';

export default function CustomersPage({ orders, query, setQuery, onToast }) {
  const customers = [...new Map(orders.map((order) => [order.customer, order])).values()].filter((customer) => customer.customer.toLowerCase().includes(query.toLowerCase()));
  return <>
    <SectionTitle eyebrow="THE PEOPLE BEHIND THE ORDERS" title="Customers" action={<Button variant="secondary" onClick={() => onToast('Customer list exported (demo).')}><Icon name="download" size={16} /> Export customers</Button>} />
    <div className="customer-stats"><StatCard label="Total customers" value={customers.length + 124} note="Since opening" icon="users" accent /><StatCard label="New this month" value="18" note="↑ 6 from last month" trend="↑ 6" icon="plus" /><StatCard label="Returning customers" value="42%" note="Placed more than one order" icon="orders" /></div>
    <section className="panel table-panel"><PanelHeader title="Customer directory" subtitle="A little about the people shopping with you" action={<div className="search-field search-compact"><Icon name="search" size={17} /><input placeholder="Search customers..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>} />
      <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>ORDERS</th><th>TOTAL SPENT</th><th>LAST ORDER</th><th /></tr></thead><tbody>
        {customers.map((customer, i) => { const customerOrders = orders.filter((order) => order.customer === customer.customer); return <tr key={customer.customer}><td><div className="table-person"><span className="avatar">{initials(customer.customer)}</span><div><b>{customer.customer}</b><small>{customer.email}</small></div></div></td><td>{customer.phone}</td><td>{customerOrders.length + [8, 3, 5][i % 3]}</td><td>{money(customerOrders.reduce((sum, order) => sum + order.total, 0) + [8560, 12900, 3280][i % 3])}</td><td>{customer.date}</td><td><button className="icon-button" aria-label="View customer" onClick={() => onToast(`Customer profile for ${customer.customer} (demo).`)}><Icon name="arrow" size={16} /></button></td></tr>; })}
      </tbody></table></div>
    </section>
  </>;
}
