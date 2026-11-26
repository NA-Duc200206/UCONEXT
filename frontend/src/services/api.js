const BASE_URL = '/api';
const AUTH_SKIP_REFRESH_ENDPOINTS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/firebase',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

let accessToken = null;
let refreshPromise = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
}

export function clearAccessToken() {
  accessToken = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
}

function clearAuthStorage() {
  clearAccessToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('uconext:auth-expired'));
  }
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await parseJsonResponse(response);
      if (!response.ok || !data?.token) {
        clearAuthStorage();
        return null;
      }

      setAccessToken(data.token);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('uconext:token-refreshed', { detail: { token: data.token, user: data.user } })
        );
      }
      return data.token;
    } catch {
      clearAuthStorage();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseJsonResponse(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    const rawText = await response.text().catch(() => '');
    try {
      return JSON.parse(rawText);
    } catch {
      return {
        message: response.ok
          ? 'Unexpected server response format.'
          : `Server unavailable (HTTP ${response.status}).`,
      };
    }
  }
  try {
    return await response.json();
  } catch {
    return {
      message: response.ok
        ? 'Unexpected empty response.'
        : `Request failed (HTTP ${response.status}).`,
    };
  }
}
async function request(endpoint, { method = 'GET', body = null, token = null, _retry = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Use in-memory access token if not explicitly passed
  const authToken = token || accessToken;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    method,
    headers,
    credentials: 'include',
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (response.status === 401 && !_retry && !AUTH_SKIP_REFRESH_ENDPOINTS.has(endpoint) && !token) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return request(endpoint, { method, body, token: newToken, _retry: true });
      }
    }

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      const err = new Error(data.message || 'An unexpected error occurred.');
      err.status = response.status;
      err.code = data.code;
      err.provider = data.provider;
      err.model = data.model;
      throw err;
    }

    return data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error.message);
    throw error;
  }
}

async function uploadImageFile(endpoint, file, _retry = false) {
  const formData = new FormData();
  formData.append('image', file);
  const token = accessToken;
  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  if (res.status === 401 && !_retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return uploadImageFile(endpoint, file, true);
    }
  }

  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.message || 'Image upload failed');
  return data;
}

export const api = {
  // Authentication
  auth: {
    login: async (email, password) => {
      const data = await request('/auth/login', { method: 'POST', body: { email, password } });
      if (data?.token) setAccessToken(data.token);
      return data;
    },
    register: async (name, email, password) => {
      const data = await request('/auth/register', { method: 'POST', body: { name, email, password } });
      if (data?.token) setAccessToken(data.token);
      return data;
    },
    loginWithFirebase: async (idToken) => {
      const data = await request('/auth/firebase', { method: 'POST', body: { idToken } });
      if (data?.token) setAccessToken(data.token);
      return data;
    },
    refresh: async () => {
      const data = await request('/auth/refresh', { method: 'POST' });
      if (data?.token) setAccessToken(data.token);
      return data;
    },
    logout: async () => {
      try {
        return await request('/auth/logout', { method: 'POST' });
      } finally {
        clearAccessToken();
      }
    },
    logoutAll: async () => {
      try {
        return await request('/auth/logout-all', { method: 'POST' });
      } finally {
        clearAccessToken();
      }
    },
    forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (token, newPassword) => request('/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
    getProfile: () => request('/auth/me'),
    updateProfile: (profileData) => request('/auth/me', { method: 'PUT', body: profileData }),
    changePassword: (currentPassword, newPassword) => request('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } }),
    syncCart: (cart) => request('/auth/cart', { method: 'PUT', body: { cart } }),
    updatePreferences: (preferredCategories) => request('/auth/preferences', { method: 'PUT', body: { preferredCategories } }),
    getAddresses: () => request('/auth/addresses'),
    addAddress: (addressData) => request('/auth/addresses', { method: 'POST', body: addressData }),
    updateAddress: (addressId, addressData) => request(`/auth/addresses/${addressId}`, { method: 'PUT', body: addressData }),
    deleteAddress: (addressId) => request(`/auth/addresses/${addressId}`, { method: 'DELETE' }),
    getRecentlyViewed: () => request('/auth/recently-viewed'),
    addRecentlyViewed: (productId) => request(`/auth/recently-viewed/${productId}`, { method: 'POST' }),
    clearRecentlyViewed: () => request('/auth/recently-viewed', { method: 'DELETE' }),
    getAllUsers: () => request('/auth/users'),
    updateUserRole: (id, role) => request(`/auth/users/${id}/role`, { method: 'PUT', body: { role } }),
  },

  // Categories
  categories: {
    getAll: () => request('/categories'),
    create: (name, description) => request('/categories', { method: 'POST', body: { name, description } }),
    update: (id, name, description) => request(`/categories/${id}`, { method: 'PUT', body: { name, description } }),
    delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  },

  // Products
  products: {
    getAll: (params = {}) => {
      const query = new URLSearchParams();
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          query.append(key, params[key]);
        }
      });
      const queryString = query.toString();
      return request(`/products?${queryString}`);
    },
    getById: (id) => request(`/products/${id}`),
    getRecommended: (limit = 8) => request(`/products/recommended?limit=${limit}`),
    create: (productData) => request('/products', { method: 'POST', body: productData }),
    update: (id, productData) => request(`/products/${id}`, { method: 'PUT', body: productData }),
    delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  },

  // Orders
  orders: {
    create: (orderData) => request('/orders', { method: 'POST', body: orderData }),
    getMyOrders: () => request('/orders/my-orders'),
    cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'PUT' }),
    requestRefund: (id, reason) => request(`/orders/${id}/refund-request`, { method: 'POST', body: { reason } }),
    getById: (id) => request(`/orders/${id}`),
    getAll: () => request('/orders'),
    updateStatus: (id, status, paymentStatus) => request(`/orders/${id}/status`, { method: 'PUT', body: { status, paymentStatus } }),
  },

  // Coupons
  coupons: {
    getActive: () => request('/coupons/active'),
    validate: (code, orderAmount) => request('/coupons/validate', { method: 'POST', body: { code, orderAmount } }),
    getAll: () => request('/coupons'),
    create: (couponData) => request('/coupons', { method: 'POST', body: couponData }),
    update: (id, couponData) => request(`/coupons/${id}`, { method: 'PUT', body: couponData }),
    delete: (id) => request(`/coupons/${id}`, { method: 'DELETE' }),
  },

  // Media Upload
  media: {
    upload: (file) => uploadImageFile('/api/media/upload', file),
    uploadAvatar: (file) => uploadImageFile('/api/media/avatar', file),
  },

  // Payments
  payments: {
    createPaymentUrl: (orderId) => request(`/payment/create-payment-url/${orderId}`, { method: 'POST' }),
    verifyPayment: (queryParamsString) => request(`/payment/verify-payment?${queryParamsString}`),
  },

  // Analytics & Audit Logs
  analytics: {
    getDashboardStats: () => request('/analytics/dashboard'),
    getAuditLogs: (params = {}) => {
      const query = new URLSearchParams();
      Object.keys(params).forEach((key) => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          query.append(key, params[key]);
        }
      });
      const qs = query.toString();
      return request(`/analytics/audit-logs${qs ? `?${qs}` : ''}`);
    },
  },

  // Reviews
  reviews: {
    getByProductId: (productId) => request(`/reviews/product/${productId}`),
    add: (reviewData) => request('/reviews', { method: 'POST', body: reviewData }),
    delete: (id) => request(`/reviews/${id}`, { method: 'DELETE' }),
  },

  // Wishlist
  wishlist: {
    getAll: () => request('/wishlist'),
    toggle: (productId) => request(`/wishlist/${productId}`, { method: 'POST' }),
    remove: (productId) => request(`/wishlist/${productId}`, { method: 'DELETE' }),
  },

  // AI Assistant
  ai: {
    getStatus: () => request('/ai/status'),
    chat: (message, options = {}) =>
      request('/ai/chat', {
        method: 'POST',
        body: {
          message,
          ...(options.history ? { history: options.history } : {}),
          ...(options.context ? { context: options.context } : {}),
        },
      }),
    getHistory: () => request('/ai/history'),
    clearHistory: () => request('/ai/history', { method: 'DELETE' }),
    getProductSummary: (productId) => request(`/ai/products/${productId}/summary`),
  }
};
