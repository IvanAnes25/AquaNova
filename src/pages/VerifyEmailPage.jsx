import { useEffect, useState } from 'react';
import AuthLayout, { FormField, FormMessage, SubmitButton } from '../components/AuthLayout.jsx';
import { authGet, authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authGet('/api/auth/pending.php')
      .then((result) => {
        setEmail(result.email);
        setSeconds(result.resendAfterSeconds);
      })
      .catch((requestError) => {
        setError(true);
        setMessage(requestError.message);
      });
  }, []);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function handleVerify(event) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await authPost('/api/auth/verify.php', { code });
      setMessage(result.message);
      window.setTimeout(() => window.location.assign(routePath('/login')), 1200);
    } catch (requestError) {
      setError(true);
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await authPost('/api/auth/resend.php');
      setMessage(result.message);
      setSeconds(60);
    } catch (requestError) {
      setError(true);
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      lightTheme
      title="Verify your email"
      footer={<>Need to start again? <a className="font-semibold text-cyan-300 hover:text-cyan-200" href={routePath('/register')}>Back to sign-up</a></>}
    >
      <p className="auth-description mb-6 text-sm text-slate-300">
        Enter the six-digit code sent to {email || 'your email address'}. The code expires in 10 minutes.
      </p>
      <FormMessage error={error}>{message}</FormMessage>
      <form className="space-y-5" onSubmit={handleVerify}>
        <FormField
          autoComplete="one-time-code"
          inputMode="numeric"
          label="Verification code"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          pattern="[0-9]{6}"
          required
          value={code}
        />
        <SubmitButton disabled={busy || !email}>{busy ? 'Checking code…' : 'Verify and create account'}</SubmitButton>
      </form>
      <button
        className="auth-resend mt-4 w-full rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || !email || seconds > 0}
        onClick={handleResend}
        type="button"
      >
        {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
      </button>
    </AuthLayout>
  );
}
