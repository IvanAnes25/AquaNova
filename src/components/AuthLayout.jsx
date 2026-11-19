import { useState } from 'react';
import logo from '../assets/nasugbu-aquatica-logo.png';
import Icon from './Icon.jsx';
import { routePath } from '../lib/paths.js';

export default function AuthLayout({ title, children, footer, lightTheme = false }) {
  return (
    <main className={`auth-layout flex min-h-screen items-center justify-center px-4 py-10 ${lightTheme ? 'auth-light bg-white text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      <section className={`w-full max-w-lg rounded-3xl border p-6 sm:p-9 ${lightTheme ? 'border-slate-200 bg-white shadow-xl' : 'border-white/10 bg-slate-900 shadow-2xl'}`}>
        <a className="auth-brand mb-7 flex items-center gap-3" href={routePath('/')}>
          <img alt="" className="h-12 w-12 rounded-full object-cover" src={logo} />
          <span className="font-semibold tracking-wide">Nasugbu Aquatica</span>
        </a>
        <h1 className="mb-2 text-3xl font-semibold">{title}</h1>
        {children}
        {footer && <div className={`auth-footer mt-6 border-t pt-5 text-sm ${lightTheme ? 'border-slate-200 text-slate-600' : 'border-white/10 text-slate-300'}`}>{footer}</div>}
      </section>
    </main>
  );
}

export function FormField({ label, ...inputProps }) {
  return (
    <label className="block">
      <span className="auth-form-label mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      <input
        className="auth-form-input w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
        {...inputProps}
      />
    </label>
  );
}

export function PasswordField({ label, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block" onMouseLeave={() => setVisible(false)} onBlur={() => setVisible(false)}>
      <span className="auth-form-label mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      <span className="relative block">
        <input
          className="auth-form-input w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 pr-14 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
          {...inputProps}
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} className="h-5 w-5" />
        </button>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {visible ? 'Password is visible' : 'Password is hidden'}
        </span>
      </span>
    </label>
  );
}

export function FormMessage({ children, error = false }) {
  if (!children) return null;
  return (
    <p
      className={`auth-message mb-4 rounded-xl px-4 py-3 text-sm ${error ? 'auth-message-error bg-red-950/70 text-red-200' : 'auth-message-success bg-emerald-950/70 text-emerald-200'}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function SubmitButton({ children, disabled = false, busy = false }) {
  return (
    <button
      className="auth-submit-button w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      aria-busy={busy || undefined}
      type="submit"
    >
      {busy && <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950 align-middle" aria-hidden="true" />}
      {children}
    </button>
  );
}
