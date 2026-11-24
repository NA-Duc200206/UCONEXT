import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '70vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 20px',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '36px 32px',
              borderRadius: '20px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '10px',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                marginBottom: '24px',
              }}
            >
              We encountered an unexpected error while loading this view. Please reload the page or return to the storefront.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{ padding: '10px 20px', background: 'var(--brand)', color: '#fff', border: 'none' }}
              >
                Reload Page
              </button>
              <a href="/" className="btn btn-secondary" style={{ padding: '10px 20px' }}>
                Back to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
