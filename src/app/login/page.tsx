'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const { signIn, profile, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile) router.replace('/dashboard/overview');
  }, [loading, profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/wrong-password|invalid-credential/i.test(msg)) {
        setError('Wrong email or password.');
      } else if (/user-not-found/i.test(msg)) {
        setError('No account with that email.');
      } else if (/too-many-requests/i.test(msg)) {
        setError('Too many attempts. Try again in a minute.');
      } else {
        setError('Could not sign in. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onSendReset() {
    setError(null);
    setInfo(null);
    if (!resetEmail.trim()) {
      setError('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setInfo('Reset link sent. Check your inbox (and spam).');
      setShowForgot(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/user-not-found/i.test(msg)) {
        setError('No account with that email.');
      } else {
        setError('Could not send reset email. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Brand palette pulled from artisansmarket-admin/css/styles.css.
  const PRIMARY = '#6F8FA3';
  const PRIMARY_HOVER = '#5A7A8D';
  const TEXT_DARK = '#2C3E50';
  const TEXT_LIGHT = '#94A3B8';
  const BORDER = '#E6ECF1';
  const LINK = '#C98A5B';

  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Left: form */}
        <section className="flex items-center justify-center bg-white px-8 py-12 lg:px-16">
          <div className="w-full max-w-[450px]">
            <h1
              className="text-[2.5rem] font-extrabold leading-tight"
              style={{ color: TEXT_DARK }}
            >
              Sign In
            </h1>
            <p className="mt-1 text-base" style={{ color: TEXT_LIGHT }}>
              Enter your email and password to sign in!
            </p>

            <form className="mt-8 space-y-4" onSubmit={onSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-semibold"
                  style={{ color: TEXT_DARK }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="block w-full rounded-xl bg-white px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-slate-300 focus:ring-0"
                  style={{
                    border: `2px solid ${BORDER}`,
                    color: TEXT_DARK,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-semibold"
                  style={{ color: TEXT_DARK }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="block w-full rounded-xl bg-white px-4 py-3.5 pr-12 text-sm outline-none transition-colors placeholder:text-slate-300 focus:ring-0"
                    style={{
                      border: `2px solid ${BORDER}`,
                      color: TEXT_DARK,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1"
                    style={{ color: TEXT_LIGHT }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <label className="flex cursor-pointer items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300"
                    style={{ accentColor: PRIMARY }}
                  />
                  <span style={{ color: TEXT_LIGHT }}>Keep me logged in</span>
                </label>
              </div>

              {showForgot && (
                <div
                  className="rounded-xl p-4"
                  style={{ border: `2px solid ${BORDER}`, background: '#FAFBFC' }}
                >
                  <label
                    className="mb-1.5 block text-sm font-semibold"
                    style={{ color: TEXT_DARK }}
                  >
                    Enter your email to reset password
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="block w-full rounded-xl bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-300"
                    style={{ border: `2px solid ${BORDER}`, color: TEXT_DARK }}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={onSendReset}
                      disabled={submitting}
                      className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                      style={{ background: '#4A8AA6' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#3D7A94')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#4A8AA6')}
                    >
                      Send Reset Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!showForgot && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setShowForgot(true);
                    }}
                    className="text-sm font-medium hover:underline"
                    style={{ color: LINK }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: PRIMARY }}
                onMouseEnter={(e) =>
                  !submitting && (e.currentTarget.style.background = PRIMARY_HOVER)
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = PRIMARY)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
              </button>

              {error && (
                <p
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: '#FEE2E2',
                    color: '#B91C1C',
                    border: '1px solid #FECACA',
                  }}
                >
                  {error}
                </p>
              )}
              {info && (
                <p
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: '#D1FAE5',
                    color: '#047857',
                    border: '1px solid #A7F3D0',
                  }}
                >
                  {info}
                </p>
              )}
            </form>
          </div>
        </section>

        {/* Right: banner */}
        <section className="hidden items-center justify-center bg-white p-8 lg:flex">
          <div className="flex w-full max-w-[500px] flex-col items-center text-center">
            <Image
              src="/logo-web.png"
              alt="Artisans Market — Handmade. Local. Loved."
              width={500}
              height={500}
              priority
              className="h-auto w-full object-contain"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
