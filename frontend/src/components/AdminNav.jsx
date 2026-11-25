import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Ticket,
  Users,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck },
];

const AdminNav = () => {
  const location = useLocation();

  return (
    <nav
      aria-label="Admin portal navigation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '8px',
        marginBottom: '28px',
        borderRadius: '14px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--glass-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {ADMIN_LINKS.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 600,
                textDecoration: 'none',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand)' : 'transparent',
                transition: 'var(--transition-fast)',
              }}
            >
              <Icon size={15} strokeWidth={1.85} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <Link
        to="/products"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          borderRadius: '10px',
          fontSize: '12.5px',
          fontWeight: 600,
          textDecoration: 'none',
          color: 'var(--text-muted)',
        }}
      >
        <span>Storefront</span>
        <ExternalLink size={13} />
      </Link>
    </nav>
  );
};

export default AdminNav;
