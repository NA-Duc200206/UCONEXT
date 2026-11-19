import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Context Providers
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { WishlistProvider } from './context/WishlistContext';

// Layout Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AIFloatingChat from './components/AIFloatingChat';
import RouteGuard from './components/RouteGuard';

// Pages
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import PaymentResult from './pages/PaymentResult';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import MyOrders from './pages/MyOrders';
import Wishlist from './pages/Wishlist';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import AdminUsers from './pages/AdminUsers';
import AdminCoupons from './pages/AdminCoupons';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

const AppContent = () => {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset-password';
  const isHomePage = location.pathname === '/';

  // Smooth scroll to top on every page change and disable browser scroll restoration
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Dynamic Page Transition Animation Injection */}
      <style>{`
        .page-transition-container {
          animation: pageSlideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }
        @keyframes pageSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      {!isAuthPage && <Navbar />}
      
      <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <div key={location.pathname} className="page-transition-container">
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Shop />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/payment-result" element={<PaymentResult />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/orders" element={<MyOrders />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<RouteGuard requireAdmin><AdminDashboard /></RouteGuard>} />
            <Route path="/admin/products" element={<RouteGuard requireAdmin><AdminProducts /></RouteGuard>} />
            <Route path="/admin/orders" element={<RouteGuard requireAdmin><AdminOrders /></RouteGuard>} />
            <Route path="/admin/users" element={<RouteGuard requireAdmin><AdminUsers /></RouteGuard>} />
            <Route path="/admin/coupons" element={<RouteGuard requireAdmin><AdminCoupons /></RouteGuard>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>

      {!isAdminPage && !isAuthPage && <Footer />}
      {!isAdminPage && !isAuthPage && <AIFloatingChat />}
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <WishlistProvider>
                <AppContent />
              </WishlistProvider>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;
