import { useEffect, useState } from 'react';
import AuthLayout, { FormField, FormMessage, PasswordField, SubmitButton } from '../components/AuthLayout.jsx';
import { authGet, authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authGet('/api/auth/session.php')
      .then((session) => {
        if (active && session.user) window.location.replace(routePath('/webapp/'));
      })
      .catch((error) => {
        if (active) setMessage(`Could not check your current session: ${error.message}`);
      });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await authPost('/api/auth/login.php', { email, password });
      window.location.replace(routePath('/webapp/'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      lightTheme
      title="Log in"
      footer={<>New to the shop? <a className="font-semibold text-cyan-800 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700" href={routePath('/register')}>Create an account</a></>}
    >
      <p className="auth-description mb-6 text-sm text-slate-300">Use your AquaNova account email and password.</p>
      <FormMessage error>{message}</FormMessage>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormField
          autoComplete="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <PasswordField
          autoComplete="current-password"
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
        <div className="-mt-2 text-right">
          <a className="auth-form-link text-sm text-cyan-800 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700" href={routePath('/forgot-password')}>Forgot password?</a>
        </div>
        <SubmitButton disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
