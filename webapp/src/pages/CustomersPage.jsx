import Icon from '../Icon.jsx';
import { initials, money } from '../lib/format.js';
import { PanelHeader, SectionTitle, StatCard } from '../components/UI.jsx';

export default function CustomersPage({ customers, query, setQuery }) {
  return <>
    <SectionTitle eyebrow="THE PEOPLE BEHIND THE ORDERS" title="Customers" />
    <div className="customer-stats"><StatCard label="Total customers" value={customers.length} note="Registered customer accounts" icon="users" accent /><StatCard label="Orders placed" value={customers.reduce((sum, item) => sum + Number(item.orders_count), 0)} note="Across these customers" icon="orders" /><StatCard label="Total sales" value={money(customers.reduce((sum, item) => sum + Number(item.spend), 0))} note="Excluding cancelled orders" icon="chart" /></div>
    <section className="panel table-panel"><PanelHeader title="Customer directory" subtitle="A little about the people shopping with you" action={<div className="search-field search-compact"><Icon name="search" size={17} /><input placeholder="Search customers..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>} />
      <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>ORDERS</th><th>TOTAL SPENT</th><th>LAST ORDER</th><th /></tr></thead><tbody>
        {customers.filter((item) => `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.toLowerCase())).map((customer) => <tr key={customer.id}><td><div className="table-person"><span className="avatar">{initials(customer.name)}</span><div><b>{customer.name}</b><small>{customer.email}</small></div></div></td><td>{customer.phone}</td><td>{customer.orders_count}</td><td>{money(customer.spend)}</td><td>{customer.created_at}</td><td /></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
