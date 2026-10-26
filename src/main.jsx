import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [backend, setBackend] = useState({ state: 'checking', message: 'Checking PHP...' });

  useEffect(() => {
    fetch('/api/health.php')
      .then((response) => {
        if (!response.ok) throw new Error('PHP endpoint is unavailable.');
        return response.json();
      })
      .then((data) => setBackend({ state: 'connected', message: data.message }))
      .catch(() => setBackend({ state: 'error', message: 'Start Apache in XAMPP to connect to PHP.' }));
  }, []);

  return (
    <main className="min-h-screen px-6 py-12 text-[#19352e] sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-[#19352e]/15 pb-5">
          <a className="font-bold tracking-[0.12em]" href="/">AQUANOVA</a>
          <span className="text-sm text-[#527067]">School project workspace</span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#16836d]">Project environment ready</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] sm:text-6xl">A good place to start building.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[#527067]">
              React and Tailwind power the interface. Plain PHP handles the backend, served locally through XAMPP.
            </p>
          </div>

          <aside className="border-l-2 border-[#16836d] bg-white/70 p-6 shadow-[0_18px_50px_-35px_rgba(25,53,46,0.45)]">
            <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[#527067]">Backend connection</p>
            <div className="mt-5 flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${backend.state === 'connected' ? 'bg-[#16836d]' : backend.state === 'error' ? 'bg-[#bd5138]' : 'animate-pulse bg-[#d49a32]'}`} />
              <span className="font-semibold">{backend.state === 'connected' ? 'Connected' : backend.state === 'error' ? 'Not connected' : 'Checking'}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#527067]" role="status">{backend.message}</p>
          </aside>
        </section>

        <footer className="border-t border-[#19352e]/15 pt-5 text-sm text-[#527067]">
          PHP · React · Tailwind CSS · JavaScript
        </footer>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);