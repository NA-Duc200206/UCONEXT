import React, { createContext, useState, useEffect, useContext } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const loadProfile = async (currentToken) => {
    try {
      if (currentToken) {
        const response = await api.auth.getProfile();
        setUser(response.user);
        const latestToken = localStorage.getItem('token');
        if (latestToken && latestToken !== currentToken) {
          setToken(latestToken);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error.message);
      // If token expired or invalid, clear it
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('uconext:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('uconext:auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      loadProfile(token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await api.auth.login(email, password);
      if (response.refreshToken) {
        localStorage.setItem('refreshToken', response.refreshToken);
      }
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (name, email, password) => {
    setLoading(true);
    try {
      const response = await api.auth.register(name, email, password);
      if (response.refreshToken) {
        localStorage.setItem('refreshToken', response.refreshToken);
      }
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const loginWithFirebase = async (idToken) => {
    setLoading(true);
    try {
      const response = await api.auth.loginWithFirebase(idToken);
      if (response.refreshToken) {
        localStorage.setItem('refreshToken', response.refreshToken);
      }
      setToken(response.token);
      setUser(response.user);
      return response.user;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = () => {
    const currentRefreshToken = localStorage.getItem('refreshToken');
    if (currentRefreshToken) {
      api.auth.logout(currentRefreshToken).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  };

  const updateUser = (updatedUser) => {
    setUser((prev) => (updatedUser ? { ...prev, ...updatedUser } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithFirebase, logout, updateUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
