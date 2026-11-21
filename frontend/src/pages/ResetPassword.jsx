import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import GlowLogo from '../components/GlowLogo';
import AuthLayout from '../components/auth/AuthLayout';
import AuthBrandPanel from '../components/auth/AuthBrandPanel';
import AuthInput from '../components/auth/AuthInput';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const ResetPassword = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!token) {
      setErrorMsg('Reset token is missing. Please request a new password reset link.');
      return;
    }

    if (!PASSWORD_RULE.test(newPassword)) {
      setErrorMsg('Password must be 8–128 characters and include uppercase, lowercase, and a number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (error) {
      setErrorMsg(error.message || 'Password reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      backTo="/login"
      backLabel="Back to Sign in"
      brandPanel={<AuthBrandPanel />}
    >
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'inline-block', marginBottom: '22px' }}>
          <GlowLogo size={26} fontSize="19px" to="/" />
        </div>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: '700',
            color: 'var(--text-primary)',
            letterSpacing: '-0.03em',
            margin: '0 0 8px 0',
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
          }}
        >
          Set a new password
        </h1>
        <p
          style={{
            fontSize: '14.5px',
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: '1.5',
          }}
        >
          Choose a strong password for your UCONEXT account.
        </p>
      </div>

      {!token && !success && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontSize: '13px',
            lineHeight: '1.45',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>This reset link is missing a token. Request a new one from the Sign in page.</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontSize: '13px',
            lineHeight: '1.45',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {success ? (
        <div
          style={{
            padding: '24px',
            borderRadius: '14px',
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#f0fdf4',
            border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#bbf7d0'}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto',
            }}
          >
            <Check size={24} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
            Password updated
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: '1.5' }}>
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              width: '100%',
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#2454F4',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Go to Sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <AuthInput
            id="reset-new-password"
            name="newPassword"
            label="New password"
            type={showNewPassword ? 'text' : 'password'}
            placeholder="At least 8 chars, A-Z, a-z, 0-9"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            required
            autoComplete="new-password"
            rightElement={
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showNewPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            }
          />

          <AuthInput
            id="reset-confirm-password"
            name="confirmPassword"
            label="Confirm new password"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            required
            autoComplete="new-password"
            rightElement={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={submitting || !token}
            style={{
              height: '46px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#2454F4',
              color: '#ffffff',
              fontSize: '14.5px',
              fontWeight: '600',
              cursor: submitting || !token ? 'not-allowed' : 'pointer',
              opacity: submitting || !token ? 0.65 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {submitting ? <Loader2 size={18} className="spin" /> : 'Reset Password'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <Link
              to="/login"
              style={{
                fontSize: '13.5px',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontWeight: '500',
              }}
            >
              Remembered your password? <span style={{ color: '#2454F4', fontWeight: '600' }}>Sign in</span>
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;

