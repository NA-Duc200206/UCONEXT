import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';

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
import ErrorBoundary from './components/ErrorBoundary';

// Primary Landing & Fallback Pages (Eager)
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// Storefront, Auth & Admin Pages (Code-Split via React.lazy)
const Shop = React.lazy(() => import('./pages/Shop'));
const ProductDetail = React.lazy(() => import('./pages/ProductDetail'));
const Cart = React.lazy(() => import('./pages/Cart'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const PaymentResult = React.lazy(() => import('./pages/PaymentResult'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const MyOrders = React.lazy(() => import('./pages/MyOrders'));
const Wishlist = React.lazy(() => import('./pages/Wishlist'));
const Settings = React.lazy(() => import('./pages/Settings'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = React.lazy(() => import('./pages/AdminProducts'));
const AdminCategories = React.lazy(() => import('./pages/AdminCategories'));
const AdminOrders = React.lazy(() => import('./pages/AdminOrders'));
const AdminUsers = React.lazy(() => import('./pages/AdminUsers'));
const AdminCoupons = React.lazy(() => import('./pages/AdminCoupons'));
const AdminAuditLogs = React.lazy(() => import('./pages/AdminAuditLogs'));

const PageLoaderFallback = () => (
  <div
    style={{
      minHeight: '55vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontSize: '13px',
      fontWeight: 600,
      letterSpacing: '0.04em',
    }}
  >
    Loading...
  </div>
);

const AppContent = () => {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset-password';

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
          <ErrorBoundary>
            <React.Suspense fallback={<PageLoaderFallback />}>
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/products" element={<Shop />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/payment-result" element={<PaymentResult />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/orders" element={<RouteGuard><MyOrders /></RouteGuard>} />
                <Route path="/wishlist" element={<RouteGuard><Wishlist /></RouteGuard>} />
                <Route path="/settings" element={<RouteGuard><Settings /></RouteGuard>} />
                <Route path="/profile" element={<RouteGuard><Settings /></RouteGuard>} />
                
                {/* Admin Routes */}
                <Route path="/admin" element={<RouteGuard requireAdmin><AdminDashboard /></RouteGuard>} />
                <Route path="/admin/products" element={<RouteGuard requireAdmin><AdminProducts /></RouteGuard>} />
                <Route path="/admin/categories" element={<RouteGuard requireAdmin><AdminCategories /></RouteGuard>} />
                <Route path="/admin/orders" element={<RouteGuard requireAdmin><AdminOrders /></RouteGuard>} />
                <Route path="/admin/users" element={<RouteGuard requireAdmin><AdminUsers /></RouteGuard>} />
                <Route path="/admin/coupons" element={<RouteGuard requireAdmin><AdminCoupons /></RouteGuard>} />
                <Route path="/admin/audit-logs" element={<RouteGuard requireAdmin><AdminAuditLogs /></RouteGuard>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {!isAdminPage && !isAuthPage && <Footer />}
      {!isAdminPage && !isAuthPage && <AIFloatingChat />}
    </div>
  );
};

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
};

export default App;
