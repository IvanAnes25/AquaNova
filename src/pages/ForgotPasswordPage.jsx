import { useState } from 'react';
import AuthLayout, { FormField, FormMessage, SubmitButton } from '../components/AuthLayout.jsx';
import { authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await authPost('/api/auth/forgot-password.php', { email });
      setMessage(result.message);
    } catch (requestError) {
      setError(true);
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password" footer={<a className="font-semibold text-cyan-300 hover:text-cyan-200" href={routePath('/login')}>Back to log in</a>}>
      <p className="mb-6 text-sm text-slate-300">Enter your AquaNova account email. If it matches an account, we will send a reset link.</p>
      <FormMessage error={error}>{message}</FormMessage>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormField autoComplete="email" label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        <SubmitButton busy={busy} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
