import { useEffect, useState } from 'react';
import { authGet, authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function DashboardPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    authGet('/api/auth/owner-page.php')
      .then((result) => setName(result.user.name))
      .catch(() => window.location.replace(routePath('/login')));
  }, []);

  async function logout() {
    try {
      await authPost('/api/auth/logout.php');
      window.location.assign(routePath('/login'));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!name) return <main className="grid min-h-screen place-items-center bg-slate-950 text-white">Checking owner access…</main>;
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white sm:p-10">
      <section className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-slate-900 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-300">Nasugbu Aquatica</p>
            <h1 className="mt-2 text-3xl font-semibold">Owner dashboard</h1>
            <p className="mt-3 text-slate-300">Welcome, {name}. This page is available only to owner accounts.</p>
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-950/70 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}
          <button className="rounded-xl border border-slate-600 px-4 py-2 hover:bg-white/5" onClick={logout} type="button">Log out</button>
        </div>
        <a className="mt-8 inline-block text-cyan-300 hover:text-cyan-200" href={routePath('/')}>Return to the public shop page</a>
      </section>
    </main>
  );
}
