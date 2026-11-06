import logo from '../assets/nasugbu-aquatica-logo.png';
import { routePath } from '../lib/paths.js';

export default function AuthLayout({ title, children, footer }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-9">
        <a className="mb-7 flex items-center gap-3" href={routePath('/')}>
          <img alt="" className="h-12 w-12 rounded-full object-cover" src={logo} />
          <span className="font-semibold tracking-wide">Nasugbu Aquatica</span>
        </a>
        <h1 className="mb-2 text-3xl font-semibold">{title}</h1>
        {children}
        {footer && <div className="mt-6 border-t border-white/10 pt-5 text-sm text-slate-300">{footer}</div>}
      </section>
    </main>
  );
}

export function FormField({ label, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
        {...inputProps}
      />
    </label>
  );
}

export function FormMessage({ children, error = false }) {
  if (!children) return null;
  return (
    <p
      className={`mb-4 rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-950/70 text-red-200' : 'bg-emerald-950/70 text-emerald-200'}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function SubmitButton({ children, disabled = false }) {
  return (
    <button
      className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      type="submit"
    >
      {children}
    </button>
  );
}
