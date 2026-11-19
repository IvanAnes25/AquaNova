import { useEffect, useState } from 'react';
import AuthLayout, { FormField, FormMessage, PasswordField, SubmitButton } from '../components/AuthLayout.jsx';
import { authGet, authPost } from '../lib/authApi.js';
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
      footer={<>Already have an account? <a className="font-semibold text-cyan-800 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700" href={routePath('/login')}>Log in</a></>}
    >
      <p className="auth-description mb-6 text-sm text-slate-300">We will send a one-time verification code to your email.</p>
      <FormMessage error>{message}</FormMessage>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField autoComplete="name" label="Name" maxLength={120} onChange={update('name')} required value={values.name} />
        <FormField autoComplete="email" label="Email" maxLength={190} onChange={update('email')} required type="email" value={values.email} />
        <FormField autoComplete="tel" label="Phone number" maxLength={40} onChange={update('phone')} required type="tel" value={values.phone} />
        <div>
          <PasswordField
            autoComplete="new-password"
            label="Password"
            maxLength={1024}
            minLength={8}
            onChange={update('password')}
            required
            value={values.password}
          />
          <p className="auth-hint mt-1.5 text-xs text-slate-400">Create a new password for AquaNova. Do not use your email password.</p>
          <p className="auth-hint mt-1 text-xs text-slate-400">Use at least 8 characters. Long passwords and passphrases are allowed; no special character combinations are required.</p>
        </div>
        <PasswordField
          autoComplete="new-password"
          label="Confirm password"
          maxLength={1024}
          minLength={8}
          onChange={update('confirmPassword')}
          required
          value={values.confirmPassword}
        />
        <SubmitButton busy={busy} disabled={busy}>{busy ? 'Sending code…' : 'Create account'}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
