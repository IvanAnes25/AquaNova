import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import Sidebar, { customerPages, ownerPages } from './components/Sidebar.jsx';
import { Button, Field, Modal } from './components/UI.jsx';
import { money } from './lib/format.js';
import { initialMovements, initialOrders, initialProducts } from './data.js';
import { authGet, authPost } from './lib/authApi.js';
import AccountPage from './pages/AccountPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HomePage from './pages/HomePage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import MyOrdersPage from './pages/MyOrdersPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import PaymentPage from './pages/PaymentPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import { ProductImage } from './components/ProductGrid.jsx';

const pageTitles = {
  home: 'A little piece of the ocean', shop: 'Shop', cart: 'Your cart', checkout: 'Checkout',
  'my-orders': 'My orders', account: 'My account', dashboard: 'Dashboard', orders: 'Orders',
  payments: 'Payment verification', products: 'Products', inventory: 'Inventory', customers: 'Customers',
  reports: 'Reports', settings: 'Settings', payment: 'Pay with GCash', 'order-placed': 'Order placed',
  'proof-submitted': 'Payment received', 'order-detail': 'Order details',
};
function websiteLoginPath() {
  const projectBase = window.location.pathname.replace(/\/webapp\/?$/, '').replace(/\/+$/, '');
  return `${projectBase}/login`;
}

function stored(key, fallback) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

export default function App() {
  const [page, setPage] = useState('login');
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [products, setProducts] = useState(() => stored('aquatica-demo-products', initialProducts));
  const [orders, setOrders] = useState(() => stored('aquatica-demo-orders', initialOrders));
  const [movements, setMovements] = useState(() => stored('aquatica-demo-movements', initialMovements));
  const [cart, setCart] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All items');
  const [orderFilter, setOrderFilter] = useState('All orders');
  const [deliveryMethod, setDeliveryMethod] = useState('Delivery');
  const [paymentMethod, setPaymentMethod] = useState('GCash');
  const [customer, setCustomer] = useState({ name: 'Mika Reyes', phone: '+63 917 555 0142', address: 'Nasugbu Town Center, Batangas', notes: '' });
  const [proofRef, setProofRef] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState('');
  const [proofOrderId, setProofOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', category: 'Fish', price: '', stock: '', size: '', description: '' });
  const [stockForm, setStockForm] = useState({ productId: '', quantity: '', reason: 'Restock', note: '' });

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const session = await authGet('/api/auth/session.php');
        if (!active) return;
        if (!session.user) {
          window.location.replace(websiteLoginPath());
          return;
        }
        const verified = await verifyRole(session.user.role);
        if (!active) return;
        setUser(verified);
        setRole(verified.role);
        setPage(verified.role === 'owner' ? 'dashboard' : 'home');
      } catch {
        if (active) window.location.replace(websiteLoginPath());
      } finally {
        if (active) setSessionLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => localStorage.setItem('aquatica-demo-products', JSON.stringify(products)), [products]);
  useEffect(() => localStorage.setItem('aquatica-demo-orders', JSON.stringify(orders)), [orders]);
  useEffect(() => localStorage.setItem('aquatica-demo-movements', JSON.stringify(movements)), [movements]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fee = deliveryMethod === 'Delivery' ? 80 : 0;
  const total = subtotal + fee;
  const activeOrder = orders.find((order) => order.id === activeOrderId) || null;
  const paymentOrder = orders.find((order) => order.id === proofOrderId) || null;
  const filteredProducts = useMemo(() => products.filter((product) => {
    const categoryMatches = category === 'All items' || product.category === category;
    return categoryMatches && `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase());
  }), [category, products, query]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const statusMatches = orderFilter === 'All orders' || order.status === orderFilter;
    return statusMatches && `${order.id} ${order.customer}`.toLowerCase().includes(query.toLowerCase());
  }), [orderFilter, orders, query]);

  const notify = (message) => setToast(message);
  const verifyRole = async (requiredRole) => {
    if (!['customer', 'owner'].includes(requiredRole)) {
      throw new Error('This account does not have an app role.');
    }
    const endpoint = requiredRole === 'owner' ? '/api/auth/owner-page.php' : '/api/auth/customer-page.php';
    const result = await authGet(endpoint);
    if (result.user?.role !== requiredRole) {
      throw new Error('Your account does not have access to this area.');
    }
    return result.user;
  };
  const clearSession = () => {
    setUser(null);
    setRole(null);
    setModal(null);
    window.location.replace(websiteLoginPath());
  };
  const navigate = async (nextPage) => {
    const requiredRole = ownerPages.includes(nextPage)
      ? 'owner'
      : [...customerPages, 'checkout', 'payment', 'order-detail', 'order-placed', 'proof-submitted'].includes(nextPage)
        ? 'customer'
        : null;
    if (!role || !user) {
      setPage('login');
      return;
    }
    if (requiredRole && role !== requiredRole) {
      notify('This area is not available for your account.');
      return;
    }
    setAccessLoading(true);
    try {
      if (requiredRole) {
        const verified = await verifyRole(requiredRole);
        setUser(verified);
      }
      setPage(nextPage);
      setQuery('');
      setMobileMenu(false);
      setSelectedProduct(null);
    } catch (error) {
      clearSession(error.message);
    } finally {
      setAccessLoading(false);
    }
  };
  const runOwnerAction = async (action) => {
    try {
      await verifyRole('owner');
    } catch (error) {
      clearSession(error.message);
      return;
    }
    action();
  };
  const updateOrder = (orderId, updates) => setOrders((items) => items.map((order) => order.id === orderId ? { ...order, ...updates } : order));
  const moveStock = (productId, amount, reason, orderId = '') => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setProducts((items) => items.map((item) => item.id === productId ? { ...item, stock: item.stock + amount } : item));
    setMovements((items) => [{
      id: `MV-${String(Date.now()).slice(-6)}`, product: product.name, productId, change: amount,
      reason, orderId, date: 'Just now',
    }, ...items]);
  };
  const stockAvailable = (order) => order.items.every((line) => (products.find((item) => item.id === line.productId)?.stock ?? 0) >= line.quantity);
  const deductStock = (order) => {
    if (order.stockDeducted) return true;
    const quantities = order.items.reduce((totals, line) => ({ ...totals, [line.productId]: (totals[line.productId] || 0) + line.quantity }), {});
    const unavailable = Object.entries(quantities).find(([productId, quantity]) => (products.find((item) => item.id === productId)?.stock ?? 0) < quantity);
    if (unavailable) {
      notify(`Not enough stock for ${products.find((item) => item.id === unavailable[0])?.name || 'this item'}.`);
      return false;
    }
    Object.entries(quantities).forEach(([productId, quantity]) => moveStock(productId, -quantity, 'Sale', order.id));
    updateOrder(order.id, { stockDeducted: true });
    return true;
  };
  const cancelOrder = (order) => {
    if (order.stockDeducted) {
      order.items.forEach((line) => moveStock(line.productId, line.quantity, 'Adjustment', order.id));
    }
    updateOrder(order.id, { status: 'Cancelled', stockDeducted: false });
    setModal(null);
    notify(`${order.id} has been cancelled.`);
  };
  const addToCart = (product, quantity = 1) => {
    const currentQuantity = cart.find((item) => item.productId === product.id)?.quantity || 0;
    if (currentQuantity + quantity > product.stock) {
      notify('There is not enough stock for that quantity.');
      return;
    }
    setCart((items) => {
      const current = items.find((item) => item.productId === product.id);
      if (current) return items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      return [...items, { productId: product.id, name: product.name, price: product.price, quantity }];
    });
    notify(`${product.name} added to cart.`);
  };
  const changeCartQty = (productId, amount) => setCart((items) => items.map((item) => {
    if (item.productId !== productId) return item;
    const max = products.find((product) => product.id === productId)?.stock || 0;
    return { ...item, quantity: Math.max(0, Math.min(max, item.quantity + amount)) };
  }).filter((item) => item.quantity > 0));
  const placeOrder = (method) => {
    const unavailable = cart.find((line) => (products.find((item) => item.id === line.productId)?.stock ?? 0) < line.quantity);
    if (!cart.length || unavailable) {
      notify(unavailable ? `Not enough stock for ${unavailable.name}.` : 'Your cart is empty.');
      return;
    }
    const id = `AQ-${1050 + orders.length}`;
    const order = {
      id, customer: customer.name.trim() || 'Mika Reyes', email: 'mika.reyes@example.com', phone: customer.phone,
      items: cart.map((line) => ({ ...line })), subtotal, deliveryFee: fee, total, delivery: deliveryMethod,
      address: deliveryMethod === 'Delivery' ? customer.address : 'Pick up at Aquatica Nasugbu',
      method, status: 'Pending', paymentStatus: 'Unpaid', date: 'Just now', reference: '', proofName: '',
      proofReason: '', stockDeducted: false,
    };
    setOrders((items) => [order, ...items]);
    setCart([]);
    setActiveOrderId(id);
    if (method === 'GCash') {
      setProofOrderId(id);
      setProofRef('');
      setProofFile(null);
      setProofError('');
      navigate('payment');
    } else {
      navigate('order-placed');
    }
  };
  const submitProof = async (orderId) => {
    const reference = proofRef.trim();
    if (!/^[a-zA-Z0-9]{6,30}$/.test(reference)) {
      setProofError('Enter a valid GCash reference number (6–30 letters or numbers).');
      return;
    }
    if (orders.some((order) => order.id !== orderId && order.reference === reference)) {
      setProofError('This reference number has already been used. Check the number and try again.');
      return;
    }
    if (!proofFile) {
      setProofError('Upload a screenshot of your GCash payment.');
      return;
    }
    let proofImage;
    try {
      proofImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Screenshot could not be read.'));
        reader.onerror = () => reject(reader.error || new Error('Screenshot could not be read.'));
        reader.readAsDataURL(proofFile);
      });
    } catch (error) {
      setProofError('Could not read the payment screenshot. Please choose another image.');
      return;
    }
    updateOrder(orderId, { reference, proofName: proofFile.name, proofImage, proofReason: '', paymentStatus: 'Under review' });
    setProofError('');
    navigate('proof-submitted');
    notify('Payment proof submitted for review.');
  };
  const chooseProof = (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setProofError('Please choose a JPG or PNG image.');
      setProofFile(null);
    } else if (file.size > 2 * 1024 * 1024) {
      setProofError('This image is over 2 MB. Choose a smaller file.');
      setProofFile(null);
    } else {
      setProofFile(file);
      setProofError('');
    }
  };
  const approvePayment = (order) => {
    if (!stockAvailable(order)) {
      notify('There is not enough stock. Adjust inventory before approving.');
      return;
    }
    if (deductStock(order)) {
      updateOrder(order.id, { paymentStatus: 'Paid', status: 'Preparing', proofReason: '' });
      setModal(null);
      notify(`${order.id} payment approved. Stock deducted.`);
    }
  };
  const rejectPayment = (order) => {
    if (!rejectReason.trim()) return;
    updateOrder(order.id, { paymentStatus: 'Rejected', status: 'Pending', proofReason: rejectReason.trim() });
    setModal(null);
    setRejectReason('');
    notify(`${order.id} proof rejected. Customer can submit new proof.`);
  };
  const confirmOrder = (order) => {
    if (order.method === 'GCash') {
      notify('GCash payments must be approved from Payments.');
      return;
    }
    if (!deductStock(order)) return;
    updateOrder(order.id, { status: order.delivery === 'Pickup' ? 'Ready' : 'Preparing' });
    setModal(null);
    notify(`${order.id} confirmed and stock deducted.`);
  };
  const markReceived = (order) => {
    updateOrder(order.id, { paymentStatus: 'Paid', status: 'Completed' });
    setModal(null);
    notify(`${order.id} marked paid and completed.`);
  };
  const saveProduct = (event) => {
    event.preventDefault();
    const product = {
      id: `custom-${Date.now()}`, name: productForm.name.trim(), category: productForm.category,
      price: Number(productForm.price), stock: Number(productForm.stock), size: productForm.size || 'Standard',
      description: productForm.description || 'Freshly stocked at Aquatica Nasugbu.', image: '', emoji: '🐟',
    };
    if (!product.name || product.price <= 0 || !Number.isInteger(product.stock) || product.stock < 0) {
      notify('Enter a product name, valid price, and whole-number stock quantity.');
      return;
    }
    setProducts((items) => [...items, product]);
    if (product.stock) setMovements((items) => [{ id: `MV-${String(Date.now()).slice(-6)}`, product: product.name, productId: product.id, change: product.stock, reason: 'Restock', orderId: '', date: 'Just now' }, ...items]);
    setModal(null);
    setProductForm({ name: '', category: 'Fish', price: '', stock: '', size: '', description: '' });
    notify(`${product.name} added to your products.`);
  };
  const saveStock = (event) => {
    event.preventDefault();
    const amount = Number(stockForm.quantity);
    const product = products.find((item) => item.id === stockForm.productId);
    if (!product || !Number.isInteger(amount) || amount <= 0) {
      notify('Choose a product and enter a whole-number quantity greater than zero.');
      return;
    }
    if (stockForm.reason === 'Adjustment' && amount > product.stock) {
      notify(`Only ${product.stock} units are available to adjust.`);
      return;
    }
    moveStock(product.id, stockForm.reason === 'Adjustment' ? -amount : amount, stockForm.reason);
    setModal(null);
    notify(`${product.name} stock updated.`);
  };
  const openStockForm = (product, reason = 'Restock') => {
    setStockForm({ productId: product?.id || '', quantity: '', reason, note: '' });
    setModal({ type: 'stock' });
  };
  const chooseOrder = (order) => {
    setActiveOrderId(order.id);
    if (order.method === 'GCash' && order.paymentStatus !== 'Paid') {
      setProofOrderId(order.id);
      setProofRef('');
      setProofFile(null);
      setProofError('');
      navigate('payment');
    } else {
      navigate('order-detail');
    }
  };
  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(value === '0917 555 0142' ? 'GCash number copied.' : 'Amount copied.');
    } catch {
      notify('Clipboard access is unavailable in this browser.');
    }
  };
  const openOrderModal = (order) => runOwnerAction(() => {
    setActiveOrderId(order.id);
    setModal({ type: 'order', order });
  });
  const openPaymentReview = (order, action) => runOwnerAction(() => {
    if (action === 'reject') {
      setRejectReason('');
      setModal({ type: 'reject', order });
    } else {
      setModal({ type: 'proof', order });
    }
  });
  const logout = async () => {
    try {
      await authPost('/api/auth/logout.php');
      clearSession();
      setCart([]);
      setToast('');
    } catch (error) {
      notify(error.message);
    }
  };
  const pageProps = {
    products, orders, movements, cart, subtotal, fee, total, customer, setCustomer, category, setCategory,
    query, setQuery, orderFilter, setFilter: setOrderFilter, onNavigate: navigate, onProduct: setSelectedProduct,
    onAdd: addToCart, onChangeQty: changeCartQty, onPlaceOrder: placeOrder, deliveryMethod, setDeliveryMethod,
    paymentMethod, setPaymentMethod, checkoutInfo: customer, setCheckoutInfo: setCustomer, onToast: notify,
  };
  let content;
  switch (page) {
    case 'home': content = <HomePage {...pageProps} />; break;
    case 'shop': content = <ShopPage {...pageProps} products={filteredProducts} cartCount={cartCount} />; break;
    case 'cart': content = <CartPage {...pageProps} />; break;
    case 'checkout': content = <CheckoutPage {...pageProps} onPlaceOrder={placeOrder} />; break;
    case 'payment': content = <PaymentPage order={paymentOrder} proofRef={proofRef} setProofRef={(value) => { setProofRef(value); setProofError(''); }} proofFile={proofFile} onFile={chooseProof} proofError={proofError} onSubmit={submitProof} onNavigate={navigate} onCopy={copyText} />; break;
    case 'my-orders': content = <MyOrdersPage orders={orders} customerName={customer.name} onNavigate={navigate} onSelect={chooseOrder} />; break;
    case 'order-detail': content = <OrderDetailPage order={activeOrder} onNavigate={navigate} onCancel={(order) => setModal({ type: 'cancel-customer', order })} onNewProof={() => { setProofOrderId(activeOrder.id); setProofRef(''); setProofFile(null); navigate('payment'); }} />; break;
    case 'dashboard': content = <DashboardPage orders={orders} products={products} onNavigate={navigate} onOpenOrder={openOrderModal} />; break;
    case 'orders': content = <OrdersPage orders={filteredOrders} filter={orderFilter} setFilter={setOrderFilter} query={query} setQuery={setQuery} onOpen={openOrderModal} onToast={notify} />; break;
    case 'payments': content = <PaymentsPage orders={orders} onNavigate={navigate} onReview={openPaymentReview} />; break;
    case 'products': content = <ProductsPage products={products} category={category} setCategory={setCategory} query={query} setQuery={setQuery} onAddProduct={() => runOwnerAction(() => setModal({ type: 'product' }))} onStock={(product) => runOwnerAction(() => openStockForm(product))} />; break;
    case 'inventory': content = <InventoryPage products={products} movements={movements} query={query} setQuery={setQuery} onStock={(product, reason) => runOwnerAction(() => openStockForm(product, reason))} />; break;
    case 'customers': content = <CustomersPage orders={orders} query={query} setQuery={setQuery} onToast={notify} />; break;
    case 'reports': content = <ReportsPage products={products} onToast={notify} />; break;
    case 'account': content = <AccountPage customer={customer} setCustomer={setCustomer} onToast={notify} />; break;
    case 'settings': content = <SettingsPage onToast={notify} />; break;
    case 'order-placed': content = <Confirmation icon="check" title="Order placed!" text={`Thanks, ${customer.name.split(' ')[0] || 'there'}. Your order ${activeOrderId ? `#${activeOrderId}` : ''} is in. We’ll keep you posted as it moves along.`} onOrders={() => navigate('my-orders')} onShop={() => navigate('shop')} />; break;
    case 'proof-submitted': content = <Confirmation icon="clock" title="Payment received for review" text={`We’ve got your GCash proof for order ${proofOrderId}. Our team will check it and update your order soon.`} onOrders={() => navigate('my-orders')} onShop={() => navigate('shop')} />; break;
    default: content = <DashboardPage orders={orders} products={products} onNavigate={navigate} onOpenOrder={openOrderModal} />;
  }
  const pendingCount = orders.filter((order) => order.status === 'Pending').length;
  const reviewCount = orders.filter((order) => order.paymentStatus === 'Under review').length;
  if (sessionLoading) return <main className="auth-loading"><span className="auth-loading-mark">A</span><p>Checking your account…</p></main>;
  if (!user || !role) return <main className="auth-loading"><span className="auth-loading-mark">A</span><p>Redirecting to the website sign in…</p></main>;
  if (accessLoading) return <main className="auth-loading"><span className="auth-loading-mark">A</span><p>Verifying access…</p></main>;

  return <div className={`app-shell ${mobileMenu ? 'mobile-nav-open' : ''}`}>
    <Sidebar role={role} page={page} user={user} onNavigate={navigate} cartCount={cartCount} reviewCount={reviewCount} pendingCount={pendingCount} mobileMenu={mobileMenu} onClose={() => setMobileMenu(false)} onLogout={logout} />
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Icon name="menu" /></button><div className="breadcrumb"><span>Aquatica</span><i>/</i><b>{pageTitles[page]}</b></div></div>
      <div className="topbar-actions"><span className="workspace-role">{role === 'owner' ? 'Owner workspace' : 'Customer workspace'}</span><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up on notifications.')}><Icon name="bell" size={18} /><i /></button><button className="top-avatar" aria-label={`Signed in as ${user.name}`}>{(user.name || 'A').slice(0, 1).toUpperCase()}</button></div>
    </header><div className="content-area">{selectedProduct ? <ProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addToCart} /> : content}</div>
    <footer className="app-footer"><span>© 2026 Aquatica Nasugbu</span><span>Made for little pieces of the ocean <i>✳</i></span></footer></main>
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={15} /></button></div>}
    {modal && <AppModal modal={modal} onClose={() => setModal(null)} onRejectOpen={(order) => { if (order.__cancel) setModal({ type: 'cancel', order }); else openPaymentReview(order, 'reject'); }} productForm={productForm} setProductForm={setProductForm} stockForm={stockForm} setStockForm={setStockForm} products={products} rejectReason={rejectReason} setRejectReason={setRejectReason} onSaveProduct={(event) => { event.preventDefault(); runOwnerAction(() => saveProduct(event)); }} onSaveStock={(event) => { event.preventDefault(); runOwnerAction(() => saveStock(event)); }} onReject={(order) => runOwnerAction(() => rejectPayment(order))} onApprove={(order) => runOwnerAction(() => approvePayment(order))} onConfirm={(order) => runOwnerAction(() => confirmOrder(order))} onReceived={(order) => runOwnerAction(() => markReceived(order))} onCancel={(order) => role === 'owner' ? runOwnerAction(() => cancelOrder(order)) : cancelOrder(order)} onStatus={(order, status) => runOwnerAction(() => { updateOrder(order.id, { status }); setModal(null); notify(`${order.id} marked ${status.toLowerCase()}.`); })} />}
  </div>;
}

function ProductDetails({ product, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  return <div className="product-detail-page"><button className="back-link" onClick={onClose}><Icon name="back" size={16} /> Back to shop</button><div className="product-detail-grid">
    <div className="product-detail-visual"><ProductImage product={product} /><span className="category-pill">{product.category}</span></div>
    <div className="product-detail-info"><div className="eyebrow">AQUATICA COLLECTION · {product.size}</div><h1>{product.name}</h1><div className="detail-price">{money(product.price)}</div><div className="detail-stock"><span className="stock-dot" /> {product.stock > 0 ? `${product.stock} available` : 'Currently sold out'}</div><p>{product.description}</p><div className="detail-divider" />
      <div className="care-note"><span>✳</span><div><b>A little note from us</b><span>Our team carefully checks every order. Send us a message if you need help finding the right fit for your tank.</span></div></div>
      <div className="detail-buy"><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><span>{quantity}</span><button aria-label="Increase quantity" onClick={() => setQuantity(Math.min(product.stock || 1, quantity + 1))}>+</button></div><Button disabled={!product.stock} onClick={() => { onAdd(product, quantity); onClose(); }}><Icon name="cart" size={17} /> Add to cart · {money(product.price * quantity)}</Button></div>
    </div>
  </div></div>;
}

function Confirmation({ icon, title, text, onOrders, onShop }) {
  return <div className="centered-state"><span className="success-icon"><Icon name={icon} size={24} /></span><div className="eyebrow">AQUATICA NASUGBU</div><h1>{title}</h1><p>{text}</p><div className="centered-actions"><Button onClick={onOrders}>View my orders <Icon name="arrow" size={16} /></Button><button className="text-button" onClick={onShop}>Continue shopping</button></div></div>;
}

function AppModal({ modal, onClose, onRejectOpen, productForm, setProductForm, stockForm, setStockForm, products, rejectReason, setRejectReason, onSaveProduct, onSaveStock, onReject, onApprove, onConfirm, onReceived, onCancel, onStatus }) {
  const title = modal.type === 'order' ? `Order ${modal.order.id}` : {
    product: 'Add a product', stock: stockForm.reason === 'Adjustment' ? 'Adjust stock' : 'Restock product',
    reject: 'Reject payment proof', proof: 'Payment proof',
    cancel: 'Cancel this order?',
    'cancel-customer': 'Cancel this order?',
  }[modal.type];
  if (modal.type === 'cancel-customer' || modal.type === 'cancel') {
    return <Modal title="Cancel this order?" onClose={onClose}><div className="modal-form"><p className="modal-description">Cancel order <b>{modal.order.id}</b>? This action will be recorded in the order history.</p><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Keep order</Button><Button variant="danger" onClick={() => onCancel(modal.order)}>Cancel order</Button></div></div></Modal>;
  }
  return <Modal title={title} onClose={onClose} wide={['order', 'proof'].includes(modal.type)}>
    {modal.type === 'product' && <form className="modal-form" onSubmit={onSaveProduct}><div className="form-grid">
      <Field label="Product name"><input className="input" autoFocus required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
      <Field label="Category"><select className="input" value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>{['Fish', 'Aquariums', 'Accessories', 'Plants'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Price (₱)"><input className="input" required min="1" type="number" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></Field>
      <Field label="Opening stock"><input className="input" required min="0" type="number" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></Field>
      <Field label="Size or variant"><input className="input" placeholder="e.g. 2.5 in" value={productForm.size} onChange={(event) => setProductForm({ ...productForm, size: event.target.value })} /></Field>
      <Field label="Description" className="field-full"><textarea className="input textarea" value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></Field>
    </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Add product</Button></div></form>}
    {modal.type === 'stock' && <form className="modal-form" onSubmit={onSaveStock}>
      <Field label="Product"><select className="input" required value={stockForm.productId} onChange={(event) => setStockForm({ ...stockForm, productId: event.target.value })}><option value="">Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stock} in stock</option>)}</select></Field>
      <div className="form-grid"><Field label="Movement"><select className="input" value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })}><option>Restock</option><option>Adjustment</option></select></Field><Field label={stockForm.reason === 'Adjustment' ? 'Units to remove' : 'Units to add'}><input className="input" type="number" min="1" required value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></Field></div>
      <Field label="Reason or note (optional)"><input className="input" placeholder="e.g. Supplier delivery" value={stockForm.note} onChange={(event) => setStockForm({ ...stockForm, note: event.target.value })} /></Field>
      <div className="inline-info"><span className="info-mark">i</span><span>This change will be added to your stock movement history.</span></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save movement</Button></div>
    </form>}
    {modal.type === 'reject' && <div className="modal-form"><p className="modal-description">Let {modal.order.customer} know what needs to be corrected. They can submit new payment proof once you reject this one.</p><Field label="Reason for rejection"><textarea className="input textarea" autoFocus placeholder="e.g. The amount on the screenshot doesn't match the order total." value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Go back</Button><Button variant="danger" disabled={!rejectReason.trim()} onClick={() => onReject(modal.order)}>Reject payment proof</Button></div></div>}
    {modal.type === 'proof' && <div className="proof-modal-content"><div className="receipt-large proof-receipt">{modal.order.proofImage ? <img className="proof-image" src={modal.order.proofImage} alt={`Payment screenshot for ${modal.order.id}`} /> : <><span className="receipt-logo">G</span><span className="receipt-success">Payment successful</span><strong>{money(modal.order.total)}</strong><span>To Aquatica Nasugbu · 0917 555 0142</span><div /><span>Reference number</span><b>{modal.order.reference || 'Not submitted'}</b><span>{modal.order.date}</span></>}</div><div className="proof-modal-info"><span className="eyebrow">CUSTOMER SUBMISSION</span><h3>{modal.order.customer}</h3><p>{modal.order.proofName || 'No screenshot attached'}</p><div className="detail-info-row"><span>Amount due</span><b>{money(modal.order.total)}</b></div><div className="detail-info-row"><span>GCash reference</span><b>{modal.order.reference || '—'}</b></div>{modal.order.paymentStatus === 'Under review' && <div className="verification-actions"><Button variant="danger-soft" onClick={() => onRejectOpen(modal.order)}>Reject</Button><Button onClick={() => onApprove(modal.order)}><Icon name="check" size={16} /> Approve</Button></div>}</div></div>}
    {modal.type === 'order' && <div className="owner-order-detail"><div className="owner-order-columns"><section className="detail-main"><div className="detail-status"><span>Order status</span><span className="status-label">{modal.order.status}</span><div className="step-track"><span className="step-done">Placed</span><i /><span>{modal.order.delivery === 'Pickup' ? 'Ready' : 'Preparing'}</span><i /><span>Completed</span></div></div><div className="detail-block"><h3>Items ordered</h3>{modal.order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}</div><div className="detail-block"><h3>Customer details</h3><div className="detail-info-row"><span>Customer</span><b>{modal.order.customer}</b></div><div className="detail-info-row"><span>Phone</span><b>{modal.order.phone}</b></div><div className="detail-info-row"><span>{modal.order.delivery}</span><b>{modal.order.address}</b></div></div></section><aside className="owner-order-side"><div className="panel owner-summary"><h3>Payment summary</h3><div className="detail-info-row"><span>Total</span><b>{money(modal.order.total)}</b></div><div className="detail-info-row"><span>Method</span><b>{modal.order.method}</b></div><div className="detail-info-row"><span>Payment status</span><b>{modal.order.paymentStatus}</b></div></div><div className="owner-order-actions"><h3>Next step</h3>{modal.order.status === 'Pending' && modal.order.method !== 'GCash' && <Button className="button-full" onClick={() => onConfirm(modal.order)}>Confirm & deduct stock</Button>}{modal.order.method === 'GCash' && modal.order.paymentStatus === 'Under review' && <Button className="button-full" onClick={() => onApprove(modal.order)}>Approve payment</Button>}{modal.order.status === 'Preparing' && <Button variant="secondary" className="button-full" onClick={() => onStatus(modal.order, 'Ready')}>Mark as ready</Button>}{['Preparing', 'Ready'].includes(modal.order.status) && modal.order.paymentStatus !== 'Paid' && <Button className="button-full" onClick={() => onReceived(modal.order)}>Mark payment received</Button>}{['Preparing', 'Ready'].includes(modal.order.status) && modal.order.paymentStatus === 'Paid' && <Button className="button-full" onClick={() => onStatus(modal.order, 'Completed')}>Mark completed</Button>}{!['Completed', 'Cancelled'].includes(modal.order.status) && <Button variant="danger-soft" className="button-full" onClick={() => onRejectOpen({ ...modal.order, __cancel: true })}>Cancel order</Button>}</div></aside></div></div>}
  </Modal>;
}
