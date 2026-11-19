import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShoppingBag } from 'lucide-react';

const NotFound = () => {
  return (
    <div
      style={{
        maxWidth: '1560px',
        margin: '0 auto',
        padding: '80px 48px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          textAlign: 'center',
          padding: '48px 32px',
          borderRadius: '20px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--glass-border)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: '18px',
          }}
        >
          404 ERROR
        </div>

        <h1
          style={{
            fontSize: '30px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '12px',
            lineHeight: 1.2,
          }}
        >
          Page not found
        </h1>

        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '28px',
          }}
        >
          The page you are looking for does not exist or may have been moved.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              borderRadius: '10px',
              background: 'var(--brand)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <Link
            to="/products"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              borderRadius: '10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ShoppingBag size={16} /> Browse Shop
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

