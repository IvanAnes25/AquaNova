import { useState } from 'react';
import { authPost } from '../lib/authApi.js';

export default function FirstLoginPasswordPage({ onComplete }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await authPost('/api/v1/account/password', { currentPassword, password, confirmPassword });
      onComplete();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-loading">
    <form className="auth-password-form" onSubmit={submit}>
      <span className="auth-loading-mark">A</span>
      <h1>Change your temporary password</h1>
      <p>Set a new password before opening the owner workspace.</p>
      {message && <p className="inline-error" role="alert">{message}</p>}
      <label>Temporary password<input autoComplete="current-password" required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>New password<input autoComplete="new-password" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm new password<input autoComplete="new-password" minLength={8} required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  </main>;
}
