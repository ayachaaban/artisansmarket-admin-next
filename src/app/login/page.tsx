'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../dashboard/legacy.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

const EyeOpen = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" />
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
  </svg>
);
const EyeOff = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" />
    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" />
    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" />
  </svg>
);
const MoonIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
  </svg>
);
const SunIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z" />
  </svg>
);

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address format.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password. Please try again.',
  'auth/invalid-login-credentials': 'Incorrect email or password. Please try again.',
  'auth/too-many-requests': 'Too many failed login attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Please contact support.',
};

export default function LoginPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'danger' | 'success' } | null>(null);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!loading && profile) router.replace('/dashboard/overview');
  }, [loading, profile, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
      setDark(true);
    }
  }, []);

  function showError(text: string) {
    setMsg({ text, type: 'danger' });
  }
  function showSuccess(text: string) {
    setMsg({ text, type: 'success' });
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    setDark(isDark);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setEmailInvalid(false);
    setPasswordInvalid(false);

    const mail = email.trim();
    if (!mail) {
      setEmailInvalid(true);
      showError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setEmailInvalid(true);
      showError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setPasswordInvalid(true);
      showError('Please enter your password.');
      return;
    }
    if (password.length < 6) {
      setPasswordInvalid(true);
      showError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await setPersistence(auth, keepLoggedIn ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, mail, password);
      let adminDoc;
      try {
        adminDoc = await getDoc(doc(db, 'admins', cred.user.uid));
      } catch {
        await signOut(auth);
        showError('Access denied. You are not an admin.');
        setSubmitting(false);
        return;
      }
      if (!adminDoc.exists()) {
        await signOut(auth);
        showError('Access denied. You are not an admin.');
        setSubmitting(false);
        return;
      }
      showSuccess('Login successful! Redirecting to dashboard...');
      setTimeout(() => router.replace('/dashboard/overview'), 1200);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      showError(AUTH_ERRORS[code] || 'An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  }

  async function onSendReset() {
    const mail = resetEmail.trim();
    if (!mail) {
      showError('Please enter your email address.');
      return;
    }
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, mail);
      showSuccess('Password reset email sent! Check your inbox.');
      setTimeout(() => {
        setShowForgot(false);
        setMsg(null);
      }, 3000);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      if (code === 'auth/invalid-email') showError('Invalid email address format.');
      else if (code === 'auth/user-not-found') showSuccess('If an account exists with this email, a reset link has been sent.');
      else if (code === 'auth/too-many-requests') showError('Too many requests. Please try again later.');
      else showError('Error sending reset email. Please try again.');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="container-fluid">
      <div className="row min-vh-100">
        {/* Left — login form */}
        <div className="col-lg-6 col-md-12 d-flex align-items-center justify-content-center left-section">
          <div className="login-container">
            <h1 className="login-title">Sign In</h1>
            <p className="login-subtitle">Enter your email and password to sign in!</p>

            <form id="loginForm" onSubmit={onSubmit}>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  type="email"
                  className={'form-control custom-input reset-email-input' + (emailInvalid ? ' is-invalid' : '')}
                  id="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setMsg(null);
                    setEmailInvalid(false);
                  }}
                  required
                />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={'form-control custom-input reset-email-input' + (passwordInvalid ? ' is-invalid' : '')}
                    id="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setMsg(null);
                      setPasswordInvalid(false);
                    }}
                    required
                  />
                  <span className="password-toggle" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? EyeOpen : EyeOff}
                  </span>
                </div>
              </div>

              <div className="d-flex justify-content-start align-items-center mb-4">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="keepLoggedIn"
                    checked={keepLoggedIn}
                    onChange={(e) => setKeepLoggedIn(e.target.checked)}
                  />
                  <label className="form-check-label keep-logged-label" htmlFor="keepLoggedIn">
                    Keep me logged in
                  </label>
                </div>
              </div>

              {showForgot && (
                <div className="mb-3">
                  <label htmlFor="resetEmail" className="form-label">
                    Enter your email to reset password
                  </label>
                  <input
                    type="email"
                    className="form-control custom-input reset-email-input"
                    id="resetEmail"
                    placeholder="Enter your email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                  <div className="d-flex gap-2 mt-2">
                    <button type="button" className="btn btn-primary reset-btn flex-grow-1" onClick={onSendReset} disabled={sendingReset}>
                      {sendingReset ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-grow-0"
                      style={{ borderRadius: '0.75rem' }}
                      onClick={() => {
                        setShowForgot(false);
                        setMsg(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!showForgot && (
                <div className="mb-3 text-end">
                  <a
                    href="#"
                    className="forgot-password"
                    onClick={(e) => {
                      e.preventDefault();
                      if (email.trim()) setResetEmail(email.trim());
                      setShowForgot(true);
                      setMsg(null);
                    }}
                  >
                    Forgot Password?
                  </a>
                </div>
              )}

              <button type="submit" className="btn btn-primary w-100 reset-btn" disabled={submitting}>
                {submitting ? 'Signing In...' : 'Sign In'}
              </button>

              {msg && <div className={`alert alert-${msg.type} mt-3`}>{msg.text}</div>}
            </form>

            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {dark ? SunIcon : MoonIcon}
            </button>
          </div>
        </div>

        {/* Right — banner */}
        <div className="col-lg-6 d-none d-lg-flex align-items-center justify-content-center right-section">
          <div className="text-center welcome-section">
            <div className="logo-placeholder">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-web.png" alt="Artisans Market - Handmade. Local. Loved." className="login-banner" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
