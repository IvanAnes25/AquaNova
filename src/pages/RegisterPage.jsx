import { useState } from 'react';
import AuthLayout, { FormField, FormMessage, SubmitButton } from '../components/AuthLayout.jsx';
import { authPost } from '../lib/authApi.js';
import { routePath } from '../lib/paths.js';

export default function RegisterPage() {
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await authPost('/api/auth/register.php', values);
      window.location.assign(routePath('/verify-email'));
    } catch (error) {
      if (error.message.includes('already pending')) {
        window.location.assign(routePath('/verify-email'));
        return;
      }
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      lightTheme
      title="Create an account"
      footer={<>Already have an account? <a className="font-semibold text-cyan-300 hover:text-cyan-200" href={routePath('/login')}>Log in</a></>}
    >
      <p className="auth-description mb-6 text-sm text-slate-300">We will send a one-time verification code to your email.</p>
      <FormMessage error>{message}</FormMessage>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField autoComplete="name" label="Name" maxLength={120} onChange={update('name')} required value={values.name} />
        <FormField autoComplete="email" label="Email" maxLength={190} onChange={update('email')} required type="email" value={values.email} />
        <FormField autoComplete="tel" label="Phone number" maxLength={40} onChange={update('phone')} required type="tel" value={values.phone} />
        <div>
          <FormField
            autoComplete="new-password"
            label="Password"
            maxLength={1024}
            minLength={8}
            onChange={update('password')}
            required
            type="password"
            value={values.password}
          />
          <p className="auth-hint mt-1.5 text-xs text-slate-400">Create a new password for AquaNova. Do not use your email password.</p>
          <p className="auth-hint mt-1 text-xs text-slate-400">Use at least 8 characters. Long passwords and passphrases are allowed; no special character combinations are required.</p>
        </div>
        <FormField
          autoComplete="new-password"
          label="Confirm password"
          maxLength={1024}
          minLength={8}
          onChange={update('confirmPassword')}
          required
          type="password"
          value={values.confirmPassword}
        />
        <SubmitButton disabled={busy}>{busy ? 'Sending code…' : 'Create account'}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
