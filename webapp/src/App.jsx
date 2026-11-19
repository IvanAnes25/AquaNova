import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Sidebar, { customerPages, ownerPages } from './components/Sidebar.jsx';
import { Button, Field, Modal, SkeletonRoute } from './components/UI.jsx';
import { money } from './lib/format.js';
import { orderNeedsAction } from './data.js';
import { authGet, authPost } from './lib/authApi.js';
import { commerceGet, commerceGetAll, commerceRequest, createIdempotencyKey } from './lib/commerceApi.js';
import { commercePath } from './lib/commerceApi.js';
import AccountPage from './pages/AccountPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HomePage from './pages/HomePage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import MyOrdersPage from './pages/MyOrdersPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import PaymentPage from './pages/PaymentPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import FirstLoginPasswordPage from './pages/FirstLoginPasswordPage.jsx';
import { ProductImage } from './components/ProductGrid.jsx';

const pageTitles = {
  home: 'A little piece of the ocean', shop: 'Shop', cart: 'Your cart', checkout: 'Checkout',
  'my-orders': 'My orders', account: 'My account', dashboard: 'Dashboard', orders: 'Orders',
  products: 'Products', inventory: 'Inventory', customers: 'Customers',
  reports: 'Reports', settings: 'Settings', notifications: 'Notifications', payment: 'Pay with GCash', 'order-placed': 'Order placed',
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
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('page') === 'shop' ? 'shop' : 'login');
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [accessLoading, setAccessLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReload, setCatalogReload] = useState(0);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [movements, setMovements] = useState([]);
  const [settings, setSettings] = useState({ deliveryFee: 0, gcashReady: false });
  const [report, setReport] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationPagination, setNotificationPagination] = useState(null);
  const [notificationPage, setNotificationPage] = useState(1);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [toastRetry, setToastRetry] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get('category') || 'All items');
  const [orderFilter, setOrderFilter] = useState('Needs action');
  const [deliveryMethod, setDeliveryMethod] = useState('Delivery');
  const [paymentMethod, setPaymentMethod] = useState('GCash');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [proofRef, setProofRef] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState('');
  const [proofOrderId, setProofOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const workspaceLoadCount = useRef(0);
  const productSaveLock = useRef(false);
  const stockSaveLock = useRef(false);
  const logoutLock = useRef(false);
  const orderPlaceLock = useRef(false);
  const requestKeys = useRef(new Map());
  const pendingCartUpdate = useRef(null);
  const navigationStack = useRef([]);
  const [productForm, setProductForm] = useState({ name: '', category: 'Fish', price: '', stock: '', size: '', description: '' });
  const [stockForm, setStockForm] = useState({ productId: '', quantity: '', reason: 'Restock', reasonText: '', note: '', confirmLargeChange: false });
  const [productImageFile, setProductImageFile] = useState(null);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      let authenticatedUser = null;
      setSessionLoading(true);
      setSessionError('');
      try {
        const session = await authGet('/api/auth/session.php');
        if (!active) return;
        authenticatedUser = session.user;
        if (!authenticatedUser) {
          window.location.replace(websiteLoginPath());
          return;
        }
        if (authenticatedUser.mustChangePassword) {
          setUser(authenticatedUser);
          setRole(authenticatedUser.role);
          setSessionLoading(false);
          return;
        }
        const verified = await verifyRole(authenticatedUser.role);
        if (!active) return;
        setUser(verified);
        setRole(verified.role);
        const requestedPage = new URLSearchParams(window.location.search).get('page');
        const rolePages = verified.role === 'owner' ? ownerPages : [...customerPages, 'checkout', 'payment', 'order-detail', 'order-placed', 'proof-submitted'];
        setPage(rolePages.includes(requestedPage) ? requestedPage : (verified.role === 'owner' ? 'dashboard' : 'home'));
        try {
          await reloadWorkspace(verified.role);
        } catch (error) {
          if (active) notify(error.message, () => reloadWorkspaceWithRetry(verified.role));
        }
      } catch (error) {
        if (!active) return;
        if (!authenticatedUser && Number(error?.status) === 401) {
          window.location.replace(websiteLoginPath());
          return;
        }
        setSessionError(error.message || 'Could not verify your account. Please try again.');
      } finally {
        if (active) setSessionLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, [sessionAttempt]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast('');
      setToastRetry(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!role || !['shop', 'products'].includes(page)) {
      setCatalogLoading(false);
      return undefined;
    }
    let active = true;
    setCatalogLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (category !== 'All items') params.set('category', category);
        const catalogPath = role === 'owner' ? '/owner/products' : '/catalog/products';
        const result = await commerceGetAll(`${catalogPath}?${params.toString()}`, ['products']);
        if (active) setProducts(result.products);
      } catch (error) {
        if (active) notify(error.message, () => setCatalogReload((current) => current + 1));
      } finally {
        if (active) setCatalogLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalogReload, category, page, query, role]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fee = deliveryMethod === 'Delivery' ? Number(settings.deliveryFee || 0) : 0;
  const total = subtotal + fee;
  const activeOrder = orders.find((order) => order.id === activeOrderId) || null;
  const paymentOrder = orders.find((order) => order.id === proofOrderId) || null;
  const filteredProducts = useMemo(() => products.filter((product) => {
    const categoryMatches = category === 'All items' || product.category === category;
    return categoryMatches && `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase());
  }), [category, products, query]);
  const notify = (message, retry = null) => {
    setToast(message);
    setToastRetry(() => (typeof retry === 'function' ? retry : null));
  };
  const requestKey = (scope) => {
    if (!requestKeys.current.has(scope)) requestKeys.current.set(scope, createIdempotencyKey());
    return requestKeys.current.get(scope);
  };
  const clearRequestKey = (scope) => requestKeys.current.delete(scope);
  const clearDefinitiveRequestKey = (scope, error) => {
    const status = Number(error?.status);
    if (status >= 400 && status < 500
      && !(status === 409 && /already in progress/i.test(String(error?.message || '')))) {
      clearRequestKey(scope);
    }
  };
  const updateShopUrl = (nextCategory = category, nextQuery = query, push = false) => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', 'shop');
    if (nextCategory === 'All items') params.delete('category');
    else params.set('category', nextCategory);
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    else params.delete('q');
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history[push ? 'pushState' : 'replaceState']({ page: 'shop' }, '', url);
  };
  const changeShopCategory = (nextCategory) => {
    const value = nextCategory === category && nextCategory !== 'All items' ? 'All items' : nextCategory;
    setCategory(value);
    updateShopUrl(value, query, true);
  };
  const changeShopQuery = (value) => {
    setQuery(value);
    updateShopUrl(category, value);
  };
  useEffect(() => {
    const restoreShopFilters = () => {
      const params = new URLSearchParams(window.location.search);
      setCategory(params.get('category') || 'All items');
      setQuery(params.get('q') || '');
      const requestedPage = params.get('page');
      const allowedPages = role === 'owner'
        ? [...ownerPages, 'home']
        : [...customerPages, 'checkout', 'payment', 'order-detail', 'order-placed', 'proof-submitted'];
      if (allowedPages.includes(requestedPage)) setPage(requestedPage);
    };
    window.addEventListener('popstate', restoreShopFilters);
    return () => window.removeEventListener('popstate', restoreShopFilters);
  }, [role]);
  async function reloadWorkspace(currentRole = role) {
    workspaceLoadCount.current += 1;
    setWorkspaceLoading(true);
    try {
      if (currentRole === 'customer') {
        const [catalog, categoryData, cartData, orderData, profileData, shopSettings, notificationData, notificationCount] = await Promise.all([
          commerceGetAll('/catalog/products', ['products']),
          commerceGetAll('/catalog/categories', ['categories']),
          commerceGetAll('/cart', ['items']),
          commerceGetAll('/orders', ['orders']),
          commerceGet('/account/profile'),
          commerceGet('/settings/public'),
          commerceGet('/notifications?page=1&pageSize=50'),
          commerceGet('/notifications/unread-count'),
        ]);
        setProducts(catalog.products);
        setCategories(categoryData.categories.map((item) => item.name));
        setCart(cartData.items.map((item) => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity })));
        setOrders(orderData.orders);
        setCustomer(profileData.profile);
        setSettings(shopSettings);
        setNotifications(notificationData.notifications);
        setNotificationPagination(notificationData.pagination);
        setNotificationPage(1);
        setUnreadNotifications(notificationCount.count);
        return;
      }
      if (currentRole === 'owner') {
        const [catalog, inventory, orderData, settingsData, customerData, reportData, notificationData, notificationCount] = await Promise.all([
          commerceGetAll('/owner/products', ['products']),
          commerceGetAll('/owner/inventory', [
            { key: 'products', pageKey: 'productsPage', sizeKey: 'productsPageSize', metaKey: 'productsPagination' },
            { key: 'movements', pageKey: 'movementsPage', sizeKey: 'movementsPageSize', metaKey: 'movementsPagination' },
          ]),
          commerceGetAll('/owner/orders', ['orders']),
          commerceGet('/owner/settings'),
          commerceGetAll('/owner/customers', ['customers']),
          commerceGet('/owner/reports'),
          commerceGet('/notifications?page=1&pageSize=50'),
          commerceGet('/notifications/unread-count'),
        ]);
        setProducts(catalog.products);
        setMovements(inventory.movements);
        setOrders(orderData.orders);
        setSettings(settingsData.settings);
        setCustomers(customerData.customers);
        setReport(reportData);
        setNotifications(notificationData.notifications);
        setNotificationPagination(notificationData.pagination);
        setNotificationPage(1);
        setUnreadNotifications(notificationCount.count);
      }
    } finally {
      workspaceLoadCount.current -= 1;
      if (workspaceLoadCount.current === 0) setWorkspaceLoading(false);
    }
  }
  async function reloadWorkspaceWithRetry(currentRole = role) {
    try {
      await reloadWorkspace(currentRole);
    } catch (error) {
      notify(error.message, () => reloadWorkspaceWithRetry(currentRole));
    }
  }
  async function reloadNotificationPage(targetPage = notificationPage) {
    const [notificationData, notificationCount] = await Promise.all([
      commerceGet(`/notifications?page=${targetPage}&pageSize=50`),
      commerceGet('/notifications/unread-count'),
    ]);
    const pageCount = Number(notificationData.pagination?.pages) || 0;
    const resolvedPage = pageCount === 0 ? 1 : Math.min(targetPage, pageCount);
    if (resolvedPage !== targetPage) {
      return reloadNotificationPage(resolvedPage);
    }
    setNotifications(notificationData.notifications);
    setNotificationPagination(notificationData.pagination);
    setNotificationPage(resolvedPage);
    setUnreadNotifications(notificationCount.count);
  }
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
  const navigate = async (nextPage, { replace = false, remember = true } = {}) => {
    if (nextPage !== 'checkout') orderPlaceLock.current = false;
    if (nextPage === 'cart' && pendingCartUpdate.current) {
      await pendingCartUpdate.current;
    }
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
      if (remember && page !== nextPage) navigationStack.current.push(page);
      setPage(nextPage);
      setQuery('');
      setMobileMenu(false);
      setSelectedProduct(null);
      const params = new URLSearchParams(window.location.search);
      params.set('page', nextPage);
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history[replace ? 'replaceState' : 'pushState']({ page: nextPage }, '', url);
    } catch (error) {
      notify(error.message, () => navigate(nextPage, { replace, remember }));
    } finally {
      setAccessLoading(false);
    }
  };
  const goBack = () => {
    const parents = {
      cart: 'shop', checkout: 'cart', payment: 'checkout', 'order-detail': 'my-orders',
      notifications: role === 'owner' ? 'dashboard' : 'home',
      account: 'home', orders: 'dashboard', products: 'dashboard', inventory: 'dashboard',
      settings: 'dashboard',
    };
    const previousPage = navigationStack.current.pop() || parents[page] || (role === 'owner' ? 'dashboard' : 'home');
    navigate(previousPage, { replace: true, remember: false });
  };
  const runOwnerAction = async (action, retry = null) => {
    try {
      await verifyRole('owner');
      await action();
    } catch (error) {
      notify(error.message, retry ? () => runOwnerAction(retry) : null);
    }
  };
  const cancelOrder = async (order, reason = 'Cancelled by customer') => {
    const scope = `order.cancel.${order.databaseId}`;
    try {
      if (role === 'owner') {
        await commerceRequest(`/owner/orders/${order.databaseId}/actions`, 'POST', { action: 'cancel', reason }, requestKey(scope));
        await reloadWorkspace('owner');
        clearRequestKey(scope);
      } else {
        await commerceRequest(`/orders/${order.databaseId}/cancel`, 'POST', { reason }, requestKey(scope));
        await reloadWorkspace('customer');
        clearRequestKey(scope);
      }
      setModal(null);
      setCancelReason('');
      notify(`${order.id} has been cancelled.`);
    } catch (error) {
      clearDefinitiveRequestKey(scope, error);
      notify(error.message, () => cancelOrder(order, reason));
    }
  };
  const addToCart = (product, quantity = 1) => {
    const operation = (async () => {
      try {
        await commerceRequest('/cart/items', 'POST', { productId: product.id, quantity });
        await reloadWorkspace('customer');
        notify(`${product.name} added to cart.`);
      } catch (error) {
        notify(error.message, () => addToCart(product, quantity));
      }
    })();
    pendingCartUpdate.current = operation;
    operation.finally(() => {
      if (pendingCartUpdate.current === operation) pendingCartUpdate.current = null;
    });
    return operation;
  };
  const changeCartQty = async (productId, amount) => {
    const item = cart.find((line) => line.productId === productId);
    if (!item) return;
    try {
      await commerceRequest(`/cart/items/${encodeURIComponent(productId)}`, 'PATCH', { quantity: Math.max(0, item.quantity + amount) });
      await reloadWorkspace('customer');
    } catch (error) {
      notify(error.message, () => changeCartQty(productId, amount));
    }
  };
  const placeOrder = async (method) => {
    if (orderPlaceLock.current) return;
    orderPlaceLock.current = true;
    const paymentMethod = method === 'GCash' ? 'gcash' : method === 'Cash on delivery' ? 'cod' : 'cash_pickup';
    const scope = 'order.create';
    try {
      const result = await commerceRequest('/orders', 'POST', {
        fulfillment: deliveryMethod === 'Delivery' ? 'delivery' : 'pickup',
        paymentMethod,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
      }, requestKey(scope));
      await reloadWorkspace('customer');
      clearRequestKey(scope);
      setActiveOrderId(result.order.id);
      if (paymentMethod === 'gcash') {
        setProofOrderId(result.order.id);
        setProofRef('');
        setProofFile(null);
        setProofError('');
        navigate('payment');
      } else {
        navigate('order-placed');
      }
    } catch (error) {
      clearDefinitiveRequestKey(scope, error);
      notify(error.message, () => placeOrder(method));
    } finally {
      orderPlaceLock.current = false;
    }
  };
  const submitProof = async (orderId) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status !== 'Pending' || !['Unpaid', 'Rejected'].includes(order.paymentStatus)) {
      setProofError('This order is not accepting payment proof right now.');
      return;
    }
    const reference = proofRef.trim();
    if (!/^[a-zA-Z0-9]{6,20}$/.test(reference)) {
      setProofError('Enter a valid GCash reference number (6–20 letters or numbers).');
      return;
    }
    if (!proofFile) {
      setProofError('Upload a screenshot of your GCash payment.');
      return;
    }
    try {
      const form = new FormData();
      form.append('reference', reference);
      form.append('proof', proofFile);
      const scope = `proof.submit.${order.databaseId}`;
      await commerceRequest(`/orders/${order.databaseId}/payment-proof`, 'POST', form, requestKey(scope));
      await reloadWorkspace('customer');
      clearRequestKey(scope);
      setProofError('');
      navigate('proof-submitted');
      notify('Payment proof submitted for review.');
    } catch (error) {
      clearDefinitiveRequestKey(`proof.submit.${order.databaseId}`, error);
      setProofError(error.message);
      notify(error.message, () => submitProof(orderId));
    }
  };
  const chooseProof = (file) => {
    if (!file) return;
    if (file.size < 1) {
      setProofError('This image is empty. Choose another file.');
      setProofFile(null);
    } else if (file.size > 2 * 1024 * 1024) {
      setProofError('This image is over 2 MB. Choose a smaller file.');
      setProofFile(null);
    } else {
      setProofFile(file);
      setProofError('');
    }
  };
  const ownerOrderAction = async (order, action, values = {}) => {
    const scope = `order.action.${order.databaseId}.${action}`;
    try {
      await commerceRequest(`/owner/orders/${order.databaseId}/actions`, 'POST', { action, ...values }, requestKey(scope));
      await reloadWorkspace('owner');
      clearRequestKey(scope);
      setModal(null);
      setRejectReason('');
      setCancelReason('');
      notify(`Order ${order.id} updated.`);
    } catch (error) {
      clearDefinitiveRequestKey(scope, error);
      throw error;
    }
  };
  const approvePayment = (order) => ownerOrderAction(order, 'approve_proof');
  const rejectPayment = (order) => ownerOrderAction(order, 'reject_proof', { reason: rejectReason.trim() });
  const confirmOrder = (order) => ownerOrderAction(order, 'confirm_cash');
  const markOrderReady = (order, deliveryBy) => ownerOrderAction(order, 'mark_ready', { deliveryBy });
  const completeOrder = (order) => ownerOrderAction(order, 'complete');
  const saveProduct = async () => {
    if (productSaveLock.current) return;
    productSaveLock.current = true;
    setSavingProduct(true);
    try {
      const scope = 'product.create';
      await commerceRequest('/owner/products', 'POST', {
        name: productForm.name.trim(), category: productForm.category,
        price: Number(productForm.price), stock: Number(productForm.stock),
        description: productForm.description || 'Freshly stocked at Aquatica Nasugbu.',
      }, requestKey(scope));
      await reloadWorkspace('owner');
      clearRequestKey(scope);
      setModal(null);
      setProductForm({ name: '', category: 'Fish', price: '', stock: '', size: '', description: '' });
      notify('Product added to your catalog.');
    } catch (error) {
      clearDefinitiveRequestKey('product.create', error);
      notify(error.message, () => runOwnerAction(() => saveProduct()));
    } finally {
      productSaveLock.current = false;
      setSavingProduct(false);
    }
  };
  const saveStock = async () => {
    if (stockSaveLock.current) return;
    const amount = Number(stockForm.quantity);
    const product = products.find((item) => item.id === stockForm.productId);
    if (!product || !Number.isInteger(amount) || amount <= 0) {
      notify('Choose a product and enter a whole-number quantity greater than zero.');
      return;
    }
    if (!stockForm.reasonText.trim()) {
      notify('A reason is required for every stock change.');
      return;
    }
    if (amount >= 50 && !stockForm.confirmLargeChange) {
      notify('Confirm the large stock change before saving.');
      return;
    }
    stockSaveLock.current = true;
    setSavingStock(true);
    try {
      const scope = 'stock.move';
      await commerceRequest('/owner/inventory/movements', 'POST', {
        productId: product.id,
        quantity: stockForm.reason === 'Adjustment' ? -amount : amount,
        type: stockForm.reason === 'Adjustment' ? 'adjustment' : 'restock',
        reason: stockForm.reasonText.trim(),
        note: stockForm.note,
        confirmedLargeChange: amount >= 50 ? Boolean(stockForm.confirmLargeChange) : true,
      }, requestKey(scope));
      await reloadWorkspace('owner');
      clearRequestKey(scope);
      setModal(null);
      notify(`${product.name} stock updated.`);
    } catch (error) {
      clearDefinitiveRequestKey('stock.move', error);
      notify(error.message, () => runOwnerAction(() => saveStock()));
    } finally {
      stockSaveLock.current = false;
      setSavingStock(false);
    }
  };
  const openProductImage = (product) => {
    setProductImageFile(null);
    setModal({ type: 'product-image', product });
  };
  const saveProductImage = async () => {
    if (!modal?.product || !productImageFile) {
      notify('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    setSavingImage(true);
    const scope = `product.image.upload.${modal.product.id}`;
    try {
      const form = new FormData();
      form.append('image', productImageFile);
      await commerceRequest(`/owner/products/${modal.product.id}/image`, 'POST', form, requestKey(scope));
      await reloadWorkspace('owner');
      clearRequestKey(scope);
      setModal(null);
      setProductImageFile(null);
      notify('Product image uploaded.');
    } catch (error) {
      clearDefinitiveRequestKey(scope, error);
      notify(error.message, () => saveProductImage());
    } finally {
      setSavingImage(false);
    }
  };
  const removeProductImage = async (product) => {
    const scope = `product.image.remove.${product.id}`;
    try {
      await commerceRequest(`/owner/products/${product.id}/image`, 'DELETE', {}, requestKey(scope));
      await reloadWorkspace('owner');
      clearRequestKey(scope);
      setModal(null);
      notify('Product image removed.');
    } catch (error) {
      clearDefinitiveRequestKey(scope, error);
      notify(error.message, () => removeProductImage(product));
    }
  };
  const openStockForm = (product, reason = 'Restock') => {
    setStockForm({ productId: product?.id || '', quantity: '', reason, reasonText: '', note: '', confirmLargeChange: false });
    setModal({ type: 'stock' });
  };
  const chooseOrder = (order) => {
    setActiveOrderId(order.id);
    if (order.method === 'GCash' && ['Unpaid', 'Rejected'].includes(order.paymentStatus)) {
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
    navigate('orders');
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
    if (logoutLock.current) return;
    logoutLock.current = true;
    try {
      await authPost('/api/auth/logout.php');
      clearSession();
      setCart([]);
      setToast('');
    } catch (error) {
      notify(error.message);
    } finally {
      logoutLock.current = false;
    }
  };
  const saveAccountProfile = async () => {
    try {
      await commerceRequest('/account/profile', 'PATCH', customer);
      await reloadWorkspace('customer');
      notify('Profile saved.');
    } catch (error) {
      notify(error.message, () => saveAccountProfile());
    }
  };
  const runNotificationMutation = async (path, method, body = {}) => {
    const perform = async () => {
      try {
        await commerceRequest(path, method, body);
        await reloadNotificationPage(notificationPage);
      } catch (error) {
        notify(error.message, () => perform());
      }
    };
    await perform();
  };
  const pageProps = {
    products, orders, movements, cart, subtotal, fee, total, customer, setCustomer, category, setCategory,
    query, setQuery, orderFilter, setFilter: setOrderFilter, onNavigate: navigate, onProduct: setSelectedProduct,
    onAdd: addToCart, onChangeQty: changeCartQty, onPlaceOrder: placeOrder, deliveryMethod, setDeliveryMethod,
    paymentMethod, setPaymentMethod, checkoutInfo: customer, setCheckoutInfo: setCustomer, onToast: notify,
    settings,
  };
  let content;
  switch (page) {
    case 'home': content = <HomePage {...pageProps} />; break;
    case 'shop': content = <ShopPage {...pageProps} products={filteredProducts} categories={categories} category={category} setCategory={changeShopCategory} query={query} setQuery={changeShopQuery} cartCount={cartCount} settings={settings} loading={catalogLoading || workspaceLoading} />; break;
    case 'cart': content = <CartPage {...pageProps} />; break;
    case 'checkout': content = <CheckoutPage {...pageProps} onPlaceOrder={placeOrder} />; break;
    case 'payment': content = <PaymentPage order={paymentOrder} settings={settings} proofRef={proofRef} setProofRef={(value) => { setProofRef(value); setProofError(''); }} proofFile={proofFile} onFile={chooseProof} proofError={proofError} onSubmit={submitProof} onNavigate={navigate} onCopy={copyText} />; break;
    case 'my-orders': content = <MyOrdersPage orders={orders} customerName={customer.name} onNavigate={navigate} onSelect={chooseOrder} loading={workspaceLoading} />; break;
    case 'order-detail': content = <OrderDetailPage order={activeOrder} onNavigate={navigate} onCancel={(order) => { setCancelReason(''); setModal({ type: 'cancel-customer', order }); }} onNewProof={() => { setProofOrderId(activeOrder.id); setProofRef(''); setProofFile(null); navigate('payment'); }} />; break;
    case 'dashboard': content = <DashboardPage orders={orders} products={products} onNavigate={navigate} onOpenOrder={openOrderModal} />; break;
    case 'orders': content = <OrdersPage
      orders={orders} filter={orderFilter} setFilter={setOrderFilter} query={query} setQuery={setQuery}
      selectedOrderId={activeOrderId} setSelectedOrderId={setActiveOrderId}
      onCheckProof={(order) => openPaymentReview(order, 'preview')}
      onConfirm={(order) => runOwnerAction(() => confirmOrder(order), () => confirmOrder(order))}
      onMarkReady={(order, deliveryBy) => runOwnerAction(() => markOrderReady(order, deliveryBy), () => markOrderReady(order, deliveryBy))}
      onComplete={(order) => runOwnerAction(() => completeOrder(order), () => completeOrder(order))}
      onCancel={(order) => runOwnerAction(() => { setCancelReason(''); setModal({ type: 'cancel', order }); })}
      loading={workspaceLoading}
    />; break;
    case 'products': content = <ProductsPage products={products} category={category} setCategory={setCategory} query={query} setQuery={setQuery} onAddProduct={() => runOwnerAction(() => setModal({ type: 'product' }))} onStock={(product) => runOwnerAction(() => openStockForm(product))} onImage={(product, remove = false) => runOwnerAction(() => remove ? removeProductImage(product) : openProductImage(product))} loading={catalogLoading || workspaceLoading} />; break;
    case 'inventory': content = <InventoryPage products={products} movements={movements} query={query} setQuery={setQuery} onStock={(product, reason) => runOwnerAction(() => openStockForm(product, reason))} loading={workspaceLoading} />; break;
    case 'customers': content = <CustomersPage customers={customers} query={query} setQuery={setQuery} onToast={notify} loading={workspaceLoading} />; break;
    case 'reports': content = <ReportsPage products={products} report={report} onToast={notify} />; break;
    case 'account': content = <AccountPage customer={customer} setCustomer={setCustomer} onSave={saveAccountProfile} onToast={notify} />; break;
    case 'settings': content = <SettingsPage settings={settings} onSave={async (values, qrFile) => { const doSave = async () => { try { await commerceRequest('/owner/settings', 'PATCH', values); if (qrFile) { const form = new FormData(); form.append('qr', qrFile); await commerceRequest('/owner/settings/gcash-qr', 'POST', form); } await reloadWorkspace('owner'); notify('Settings saved.'); } catch (error) { notify(error.message, () => doSave()); } }; await doSave(); }} onToast={notify} />; break;
    case 'notifications': content = <NotificationsPage
      notifications={notifications}
      pagination={notificationPagination}
      unreadCount={unreadNotifications}
      page={notificationPage}
      onPage={reloadNotificationPage}
      onRead={(id) => runNotificationMutation(`/notifications/${id}/read`, 'PATCH')}
      onReadGroup={(orderId) => runNotificationMutation('/notifications/group/read', 'PATCH', { orderId })}
      onReadAll={() => runNotificationMutation('/notifications/read-all', 'POST')}
      onDelete={(id) => runNotificationMutation(`/notifications/${id}`, 'DELETE')}
      onDeleteGroup={(orderId) => runNotificationMutation('/notifications/group/read', 'DELETE', { orderId })}
      onDeleteAll={() => runNotificationMutation('/notifications/read', 'DELETE')}
      loading={workspaceLoading}
    />; break;
    case 'order-placed': content = <Confirmation icon="check" title="Order placed!" text={`Thanks, ${customer.name.split(' ')[0] || 'there'}. Your order ${activeOrderId ? `#${activeOrderId}` : ''} is in. We’ll keep you posted as it moves along.`} onOrders={() => navigate('my-orders')} onShop={() => navigate('shop')} />; break;
    case 'proof-submitted': content = <Confirmation icon="clock" title="Payment received for review" text={`We’ve got your GCash proof for order ${proofOrderId}. Our team will check it and update your order soon.`} onOrders={() => navigate('my-orders')} onShop={() => navigate('shop')} />; break;
    default: content = <DashboardPage orders={orders} products={products} onNavigate={navigate} onOpenOrder={openOrderModal} />;
  }
  const pendingCount = orders.filter(orderNeedsAction).length;
  if (sessionLoading) return <main className="auth-loading"><span className="auth-loading-mark">A</span><p>Checking your account…</p></main>;
  if (sessionError) return <main className="auth-loading"><div className="auth-password-form" role="alert"><h1>Could not verify your account</h1><p>{sessionError}</p><Button onClick={() => setSessionAttempt((current) => current + 1)}>Try again</Button></div></main>;
  if (!user || !role) return <main className="auth-loading"><span className="auth-loading-mark">A</span><p>Redirecting to the website sign in…</p></main>;
  if (user.mustChangePassword) {
    return <FirstLoginPasswordPage onComplete={() => {
      setUser({ ...user, mustChangePassword: false });
      setPage('dashboard');
    }} />;
  }
  return <div className={`app-shell ${mobileMenu ? 'mobile-nav-open' : ''}`}>
    {accessLoading && <div className="route-loading-bar" aria-hidden="true" />}
    <Sidebar role={role} page={page} user={user} shopStatus={settings.shopStatus} onNavigate={navigate} cartCount={cartCount} pendingCount={pendingCount} mobileMenu={mobileMenu} onClose={() => setMobileMenu(false)} onLogout={logout} />
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Icon name="menu" /></button>{['cart', 'checkout', 'payment', 'order-detail', 'notifications', 'account', 'orders', 'products', 'inventory', 'settings'].includes(page) && <button className="app-back-button" aria-label="Back" onClick={goBack}><Icon name="back" size={16} /><span className="app-back-label">Back</span></button>}<div className="breadcrumb"><span>Aquatica</span><i>/</i><b>{pageTitles[page]}</b></div></div>
      <div className="topbar-actions">{settings.shopStatus && <span className={`shop-status-line shop-status-header ${settings.shopStatus.isOpen ? 'shop-status-open' : 'shop-status-closed'}`} role="status" aria-label={settings.shopStatus.statusLine} title={settings.shopStatus.statusLine}><span className="shop-status-header-full">{settings.shopStatus.statusLine}</span><span className="shop-status-header-compact" aria-hidden="true">{settings.shopStatus.isOpen ? 'Open' : 'Closed'}</span></span>}<span className="workspace-role">{role === 'owner' ? 'Owner workspace' : 'Customer workspace'}</span><button className="icon-button notification-button" aria-label="Notifications" aria-description={`${unreadNotifications} unread messages`} onClick={() => navigate(page === 'notifications' ? (role === 'owner' ? 'dashboard' : 'home') : 'notifications')}><Icon name="bell" size={18} />{unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button><button className="top-avatar" aria-label={`Signed in as ${user.name}`}>{(user.name || 'A').slice(0, 1).toUpperCase()}</button></div>
    </header><div className="content-area">{accessLoading ? <SkeletonRoute /> : selectedProduct ? <ProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addToCart} /> : content}</div>
    <footer className="app-footer"><span>© 2026 Aquatica Nasugbu</span><span>Made for little pieces of the ocean <i>✳</i></span></footer></main>
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}{toastRetry && <button className="toast-retry" onClick={() => { const retry = toastRetry; setToast(''); setToastRetry(null); retry(); }}>Retry</button>}<button aria-label="Dismiss notification" onClick={() => { setToast(''); setToastRetry(null); }}><Icon name="close" size={15} /></button></div>}
    {modal && <AppModal modal={modal} onClose={() => setModal(null)} onRejectOpen={(order) => openPaymentReview(order, 'reject')} productForm={productForm} setProductForm={setProductForm} stockForm={stockForm} setStockForm={setStockForm} savingProduct={savingProduct} savingStock={savingStock} productImageFile={productImageFile} setProductImageFile={setProductImageFile} savingImage={savingImage} onSaveProductImage={saveProductImage} onRemoveProductImage={removeProductImage} products={products} rejectReason={rejectReason} setRejectReason={setRejectReason} cancelReason={cancelReason} setCancelReason={setCancelReason} onSaveProduct={(event) => { event.preventDefault(); runOwnerAction(() => saveProduct(), () => saveProduct()); }} onSaveStock={(event) => { event.preventDefault(); runOwnerAction(() => saveStock(), () => saveStock()); }} onReject={(order) => runOwnerAction(() => rejectPayment(order), () => rejectPayment(order))} onApprove={(order) => runOwnerAction(() => approvePayment(order), () => approvePayment(order))} onCancel={(order) => cancelOrder(order, cancelReason)} />}
  </div>;
}

function ProductDetails({ product, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  return <div className="product-detail-page"><button className="back-link" onClick={onClose}><Icon name="back" size={16} /> Back to shop</button><div className="product-detail-grid">
    <div className="product-detail-visual"><ProductImage product={product} /><span className="category-pill">{product.category}</span></div>
    <div className="product-detail-info"><div className="eyebrow">AQUATICA COLLECTION · {product.size}</div><h1>{product.name}</h1><div className={`detail-stock ${product.stock === 0 ? 'status-sold-out' : ''}`}>{product.stock > 0 ? `${product.stock} available` : '! Sold out'}</div><p>{product.description}</p><div className="detail-divider" />
      <div className="care-note"><span>✳</span><div><b>A little note from us</b><span>Our team carefully checks every order. Send us a message if you need help finding the right fit for your tank.</span></div></div>
      <div className="detail-buy"><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><span>{quantity}</span><button aria-label="Increase quantity" onClick={() => setQuantity(Math.min(product.stock || 1, quantity + 1))}>+</button></div><Button disabled={!product.stock} onClick={async () => { await onAdd(product, quantity); onClose(); }}><Icon name="cart" size={17} /> Add to cart · {money(product.price * quantity)}</Button></div>
    </div>
  </div></div>;
}

function Confirmation({ icon, title, text, onOrders, onShop }) {
  return <div className="centered-state"><span className="success-icon"><Icon name={icon} size={24} /></span><div className="eyebrow">AQUATICA NASUGBU</div><h1>{title}</h1><p>{text}</p><div className="centered-actions"><Button onClick={onOrders}>View my orders <Icon name="arrow" size={16} /></Button><button className="text-button" onClick={onShop}>Continue shopping</button></div></div>;
}

function AppModal({ modal, onClose, onRejectOpen, productForm, setProductForm, stockForm, setStockForm, savingProduct, savingStock, productImageFile, setProductImageFile, savingImage, onSaveProductImage, onRemoveProductImage, products, rejectReason, setRejectReason, cancelReason, setCancelReason, onSaveProduct, onSaveStock, onReject, onApprove, onConfirm, onReceived, onCancel, onStatus }) {
  const title = modal.type === 'order' ? `Order ${modal.order.id}` : {
    product: 'Add a product', 'product-image': modal.product?.image ? 'Replace product image' : 'Upload product image', stock: stockForm.reason === 'Adjustment' ? 'Adjust stock' : 'Restock product',
    reject: 'Reject payment proof', proof: 'Payment proof',
    cancel: 'Cancel this order?',
    'cancel-customer': 'Cancel this order?',
  }[modal.type];
  if (modal.type === 'cancel-customer' || modal.type === 'cancel') {
    return <Modal title="Cancel this order?" onClose={onClose}><div className="modal-form"><p className="modal-description">Cancel order <b>{modal.order.id}</b>? This action will be recorded in the order history.</p>{modal.type === 'cancel' && <Field label="Cancellation reason"><textarea className="input textarea" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></Field>}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Keep order</Button><Button variant="danger" aria-label="Cancel order" disabled={modal.type === 'cancel' && !cancelReason.trim()} onClick={async () => { await onCancel(modal.order); }}>Cancel order</Button></div></div></Modal>;
  }
  return <Modal title={title} onClose={onClose} wide={['order', 'proof'].includes(modal.type)}>
    {modal.type === 'product' && <form className="modal-form" onSubmit={onSaveProduct}><div className="form-grid">
      <Field label="Product name"><input className="input" autoFocus required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
      <Field label="Category"><select className="input" value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>{['Fish', 'Aquariums', 'Accessories', 'Plants'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Price (₱)"><input className="input" required min="1" type="number" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></Field>
      <Field label="Opening stock"><input className="input" required min="0" type="number" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></Field>
      <Field label="Size or variant"><input className="input" placeholder="e.g. 2.5 in" value={productForm.size} onChange={(event) => setProductForm({ ...productForm, size: event.target.value })} /></Field>
      <Field label="Description" className="field-full"><textarea className="input textarea" value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></Field>
    </div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" aria-label="Create product" loading={savingProduct}>Create product</Button></div></form>}
    {modal.type === 'product-image' && <div className="modal-form">
      <p className="modal-description">{modal.product.name}</p>
      <Field label="JPEG, PNG, or WebP image"><input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProductImageFile(event.target.files?.[0] || null)} /></Field>
      <div className="inline-info"><span className="info-mark">i</span><span>Maximum size 2 MB. The file will be verified and re-encoded on the server.</span></div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>{modal.product.image && <Button type="button" variant="danger-soft" aria-label="Delete image" loading={savingImage} onClick={async () => { await onRemoveProductImage(modal.product); }}>Delete image</Button>}<Button type="button" aria-label="Save image" loading={savingImage} onClick={async () => { await onSaveProductImage(); }}>{modal.product.image ? 'Save image' : 'Upload image'}</Button></div>
    </div>}
    {modal.type === 'stock' && <form className="modal-form" onSubmit={onSaveStock}>
      <Field label="Product"><select className="input" required value={stockForm.productId} onChange={(event) => setStockForm({ ...stockForm, productId: event.target.value })}><option value="">Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stock} in stock</option>)}</select></Field>
      <div className="form-grid"><Field label="Movement"><select className="input" value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })}><option>Restock</option><option>Adjustment</option></select></Field><Field label={stockForm.reason === 'Adjustment' ? 'Units to remove' : 'Units to add'}><input className="input" type="number" min="1" required value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></Field></div>
      <Field label="Reason"><input className="input" required placeholder="e.g. Supplier delivery" value={stockForm.reasonText} onChange={(event) => setStockForm({ ...stockForm, reasonText: event.target.value })} /></Field>
      <Field label="Note (optional)"><input className="input" value={stockForm.note} onChange={(event) => setStockForm({ ...stockForm, note: event.target.value })} /></Field>
      {Number(stockForm.quantity) >= 50 && <label className="field"><span>Large-change confirmation</span><input type="checkbox" checked={stockForm.confirmLargeChange} onChange={(event) => setStockForm({ ...stockForm, confirmLargeChange: event.target.checked })} /> Confirm this change is 50 units or more.</label>}
      <div className="inline-info"><span className="info-mark">i</span><span>This change will be added to your stock movement history.</span></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" aria-label={stockForm.reason === 'Adjustment' ? 'Adjust stock' : 'Restock'} loading={savingStock}>{stockForm.reason === 'Adjustment' ? 'Adjust stock' : 'Restock'}</Button></div>
    </form>}
    {modal.type === 'reject' && <div className="modal-form"><p className="modal-description">Let {modal.order.customer} know what needs to be corrected. They can submit new payment proof once you reject this one.</p><Field label="Reason for rejection"><textarea className="input textarea" autoFocus placeholder="e.g. The amount on the screenshot doesn't match the order total." value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Go back</Button><Button variant="danger" aria-label="Reject payment proof" disabled={!rejectReason.trim()} onClick={async () => { await onReject(modal.order); }}>Reject payment proof</Button></div></div>}
    {modal.type === 'proof' && <div className="proof-modal-content"><div className="receipt-large proof-receipt">{modal.order.proofImageUrl ? <img className="proof-image" src={commercePath(modal.order.proofImageUrl)} alt={`Payment screenshot for ${modal.order.id}`} /> : <span>No payment screenshot is attached.</span>}</div><div className="proof-modal-info"><span className="eyebrow">CUSTOMER SUBMISSION</span><h3>{modal.order.customer}</h3><p>{modal.order.proofName || 'No screenshot attached'}</p><div className="detail-info-row"><span>Amount due</span><b>{money(modal.order.total)}</b></div><div className="detail-info-row"><span>GCash reference</span><b>{modal.order.reference || '—'}</b></div>{modal.order.paymentStatus === 'Under review' && <div className="verification-actions"><Button variant="danger-soft" aria-label="Reject" onClick={() => onRejectOpen(modal.order)}>Reject</Button><Button aria-label="Approve" onClick={async () => { await onApprove(modal.order); }}><Icon name="check" size={16} /> Approve</Button></div>}</div></div>}
    {modal.type === 'order' && <div className="owner-order-detail"><div className="owner-order-columns"><section className="detail-main"><div className="detail-status"><span>Order status</span><span className="status-label">{modal.order.statusLabel || modal.order.status}</span><div className="step-track"><span className="step-done">Placed</span><i /><span>{modal.order.delivery === 'Pickup' ? 'Ready for pickup' : 'Preparing'}</span><i /><span>{modal.order.delivery === 'Pickup' ? 'Picked up' : 'Delivered'}</span></div></div><div className="detail-block"><h3>Items ordered</h3>{modal.order.items.map((item) => <div className="mini-line" key={item.productId}><span>{item.name} <i>× {item.quantity}</i></span><b>{money(item.price * item.quantity)}</b></div>)}</div><div className="detail-block"><h3>Customer details</h3><div className="detail-info-row"><span>Customer</span><b>{modal.order.customer}</b></div><div className="detail-info-row"><span>Phone</span><b>{modal.order.phone}</b></div><div className="detail-info-row"><span>{modal.order.delivery === 'Delivery' ? 'Delivery address' : 'Pickup location'}</span><b>{modal.order.delivery === 'Delivery' ? modal.order.address : modal.order.pickupLocation}</b></div></div></section><aside className="owner-order-side"><div className="panel owner-summary"><h3>Payment summary</h3><div className="detail-info-row"><span>Total</span><b>{money(modal.order.total)}</b></div><div className="detail-info-row"><span>Method</span><b>{modal.order.method}</b></div><div className="detail-info-row"><span>Payment status</span><b>{modal.order.paymentStatus}</b></div></div><div className="owner-order-actions"><h3>Next step</h3>{modal.order.status === 'Pending' && modal.order.method !== 'GCash' && <Button className="button-full" aria-label="Confirm order" onClick={async () => { await onConfirm(modal.order); }}>Confirm order</Button>}{modal.order.method === 'GCash' && modal.order.paymentStatus === 'Under review' && <Button className="button-full" aria-label="Approve payment" onClick={async () => { await onApprove(modal.order); }}>Approve payment</Button>}{modal.order.status === 'Preparing' && <Button variant="secondary" className="button-full" aria-label="Mark as ready" onClick={async () => { await onStatus(modal.order, 'Ready'); }}>Mark as ready</Button>}{['Preparing', 'Ready'].includes(modal.order.status) && modal.order.paymentStatus !== 'Paid' && <Button className="button-full" onClick={async () => { await onReceived(modal.order); }}>Mark payment received</Button>}{['Preparing', 'Ready'].includes(modal.order.status) && modal.order.paymentStatus === 'Paid' && <Button className="button-full" aria-label="Mark completed" onClick={async () => { await onStatus(modal.order, 'Completed'); }}>Mark completed</Button>}{!['Completed', 'Cancelled'].includes(modal.order.status) && <Button variant="danger-soft" className="button-full" aria-label="Cancel order" onClick={() => onRejectOpen({ ...modal.order, __cancel: true })}>Cancel order</Button>}</div></aside></div></div>}
  </Modal>;
}
