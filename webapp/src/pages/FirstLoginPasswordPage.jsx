import { useRef, useState } from 'react';
import { authPost } from '../lib/authApi.js';
import Icon from '../Icon.jsx';

export default function FirstLoginPasswordPage({ onComplete }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const passwordValid = password.length >= 8;

  async function submit(event) {
    event.preventDefault();
    const validation = {};
    if (!currentPassword) validation.currentPassword = 'Enter your temporary password.';
    if (!passwordValid) validation.password = 'Use at least 8 characters.';
    if (password && password === currentPassword) validation.password = 'Choose a password different from your temporary password.';
    if (confirmPassword !== password) validation.confirmPassword = 'Passwords do not match.';
    if (Object.keys(validation).length) {
      setErrors(validation);
      window.requestAnimationFrame(() => formRef.current?.querySelector(`[name="${Object.keys(validation)[0]}"]`)?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await authPost('/api/v1/account/password', { currentPassword, password, confirmPassword });
      onComplete();
    } catch (error) {
      const message = error.message || 'The password could not be changed.';
      if (message.toLowerCase().includes('current password')) {
        setErrors({ currentPassword: message });
        window.requestAnimationFrame(() => formRef.current?.querySelector('[name="currentPassword"]')?.focus());
      } else if (message.toLowerCase().includes('different from')) {
        setErrors({ password: message });
        window.requestAnimationFrame(() => formRef.current?.querySelector('[name="password"]')?.focus());
      } else if (message.toLowerCase().includes('matching password')) {
        setErrors({ confirmPassword: message });
        window.requestAnimationFrame(() => formRef.current?.querySelector('[name="confirmPassword"]')?.focus());
      } else {
        setErrors({ form: message });
      }
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (name, label, value, onChange, autoComplete) => (
    <label key={name}>
      {label}
      <span className="password-input-wrap">
        <input
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          aria-invalid={Boolean(errors[name])}
          autoComplete={autoComplete}
          name={name}
          onChange={onChange}
          required
          type={visible[name] ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible[name] ? 'Hide password' : 'Show password'}
          aria-pressed={Boolean(visible[name])}
          className="password-visibility"
          onClick={() => setVisible((current) => ({ ...current, [name]: !current[name] }))}
          type="button"
        >
          <Icon name={visible[name] ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </span>
      {errors[name] && <span className="inline-error" id={`${name}-error`} role="alert">{errors[name]}</span>}
    </label>
  );

  return <main className="auth-loading">
    <form className="auth-password-form" onSubmit={submit} ref={formRef}>
      <span className="auth-loading-mark">A</span>
      <h1>Change your temporary password</h1>
      <p>Set a new password before opening the owner workspace.</p>
      {errors.form && <p className="inline-error" role="alert">{errors.form}</p>}
      {passwordField('currentPassword', 'Temporary password', currentPassword, (event) => setCurrentPassword(event.target.value), 'current-password')}
      {passwordField('password', 'New password', password, (event) => setPassword(event.target.value), 'new-password')}
      <ul className="password-rules" aria-label="Password requirements">
        <li className={passwordValid ? 'password-rule-met' : ''}>{passwordValid ? '✓' : '•'} At least 8 characters</li>
      </ul>
      {passwordField('confirmPassword', 'Confirm new password', confirmPassword, (event) => setConfirmPassword(event.target.value), 'new-password')}
      <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  </main>;
}
