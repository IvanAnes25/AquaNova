import Icon from '../Icon.jsx';

const customerLinks = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'shop', label: 'Shop', icon: 'bag' },
  { id: 'cart', label: 'Cart', icon: 'cart' },
  { id: 'my-orders', label: 'My orders', icon: 'orders' },
  { id: 'account', label: 'My account', icon: 'users' },
];
const ownerLinks = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'products', label: 'Products', icon: 'bag' },
  { id: 'inventory', label: 'Inventory', icon: 'box' },
  { id: 'customers', label: 'Customers', icon: 'users' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'account', label: 'My account', icon: 'users' },
];

export const ownerPages = ownerLinks.map((item) => item.id);
export const customerPages = customerLinks.map((item) => item.id);

function LinkGroup({ title, items, page, onNavigate, cartCount, pendingCount }) {
  return <div className="nav-section"><div className="nav-label">{title}</div>{items.map((item) => {
    const count = item.id === 'cart' ? cartCount : item.id === 'orders' ? pendingCount : 0;
    return <button key={item.id} className={`nav-link ${page === item.id ? 'nav-link-active' : ''}`} onClick={() => onNavigate(item.id)}>
      <Icon name={item.icon} size={18} /><span>{item.label}</span>{count > 0 && <span className="nav-count">{count}</span>}
    </button>;
  })}</div>;
}

export default function Sidebar({ role, page, user, shopStatus, onNavigate, cartCount, pendingCount, mobileMenu, onClose, onLogout }) {
  const isOwner = role === 'owner';
  return <>
    <aside className="sidebar">
      <div className="brand-lockup"><span className="brand-mark">A</span><span><b>AQUATICA</b><small>NASUGBU · BATANGAS</small></span><button className="mobile-close icon-button" aria-label="Close navigation" onClick={onClose}><Icon name="close" /></button></div>
      <div className="nav-scroll">
        {isOwner
          ? <LinkGroup title="SHOP MANAGEMENT" items={ownerLinks} page={page} onNavigate={onNavigate} cartCount={cartCount} pendingCount={pendingCount} />
          : <LinkGroup title="YOUR AQUATICA" items={customerLinks} page={page} onNavigate={onNavigate} cartCount={cartCount} pendingCount={pendingCount} />}
      </div>
      <div className="sidebar-bottom">{shopStatus && <div className={`online-status ${shopStatus.isOpen ? 'online-status-open' : 'online-status-closed'}`} role="status"><span /> {shopStatus.statusLine}</div>}
        <div className="user-profile"><span className="avatar owner-avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</span><span><b>{user?.name || 'Aquatica'}</b><small>{isOwner ? 'Shop administrator' : 'Customer account'}</small></span><button className="profile-logout" onClick={onLogout}>Log out</button></div>
      </div>
    </aside>
    <div className={`sidebar-scrim ${mobileMenu ? 'sidebar-scrim-visible' : ''}`} onClick={onClose} />
  </>;
}
