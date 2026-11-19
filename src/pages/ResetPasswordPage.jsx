import { useEffect, useState } from 'react';
import AuthLayout, { FormField, FormMessage, PasswordField, SubmitButton } from '../components/AuthLayout.jsx';
import { authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await authPost('/api/auth/reset-password.php', { token, password, confirmPassword });
      setMessage(result.message);
      window.setTimeout(() => window.location.assign(routePath('/login')), 1200);
    } catch (requestError) {
      setError(true);
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" footer={<a className="font-semibold text-cyan-300 hover:text-cyan-200" href={routePath('/forgot-password')}>Request another reset link</a>}>
      <p className="mb-6 text-sm text-slate-300">Choose a new AquaNova password. Use at least 8 characters.</p>
      <FormMessage error={error}>{message || (!token ? 'Open the reset link from your email to continue.' : '')}</FormMessage>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <PasswordField autoComplete="new-password" label="New password" maxLength={1024} minLength={8} onChange={(event) => setPassword(event.target.value)} required value={password} />
        <PasswordField autoComplete="new-password" label="Confirm new password" maxLength={1024} minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required value={confirmPassword} />
        <SubmitButton busy={busy} disabled={busy || !token}>{busy ? 'Saving…' : 'Change password'}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
