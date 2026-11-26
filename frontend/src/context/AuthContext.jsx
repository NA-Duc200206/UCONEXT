import React, { createContext, useState, useEffect, useContext } from 'react';
import { api, setAccessToken, clearAccessToken } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Migration cleanup: remove any legacy tokens stored in localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await api.auth.refresh();
        if (!cancelled && response?.token) {
          setAccessToken(response.token);
          setToken(response.token);
          setUser(response.user || null);
        }
      } catch {
        if (!cancelled) {
          clearAccessToken();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAccessToken();
      setToken(null);
      setUser(null);
      setLoading(false);
    };
    const handleTokenRefreshed = (evt) => {
      const nextToken = evt?.detail?.token;
      const nextUser = evt?.detail?.user;
      if (nextToken) {
        setToken(nextToken);
      }
      if (nextUser) {
        setUser(nextUser);
      }
    };
    window.addEventListener('uconext:auth-expired', handleAuthExpired);
    window.addEventListener('uconext:token-refreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('uconext:auth-expired', handleAuthExpired);
      window.removeEventListener('uconext:token-refreshed', handleTokenRefreshed);
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await api.auth.login(email, password);
      setAccessToken(response.token);
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name, email, password) => {
    setLoading(true);
    try {
      const response = await api.auth.register(name, email, password);
      setAccessToken(response.token);
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } finally {
      setLoading(false);
    }
  };

  const loginWithFirebase = async (idToken) => {
    setLoading(true);
    try {
      const response = await api.auth.loginWithFirebase(idToken);
      setAccessToken(response.token);
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    clearAccessToken();
    setToken(null);
    setUser(null);
  };

  const logoutAll = async () => {
    try {
      await api.auth.logoutAll();
    } catch {
      // ignore
    } finally {
      clearAccessToken();
      setToken(null);
      setUser(null);
    }
  };

  const updateUser = (updatedUser) => {
    setUser((prev) => (updatedUser ? { ...prev, ...updatedUser } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithFirebase, logout, logoutAll, updateUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
