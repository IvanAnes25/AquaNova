import { useEffect, useState } from 'react';
import logo from '../assets/nasugbu-aquatica-logo.png';
import '../auth.css';

const emptyRegistration = {
  name: '',
  phone: '',
  email: '',
  address: '',
  password: '',
  confirm: '',
};

function AuthField({ id, label, type = 'text', value, onChange, autoComplete, placeholder, error }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        autoComplete={autoComplete}
        id={id}
        onChange={onChange}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
      {error && <span className="auth-field-error">{error}</span>}
    </div>
  );
}

function AuthPage({ onClose }) {
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registration, setRegistration] = useState(emptyRegistration);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function showMessage(text) {
    setMessage(text);
  }

  function handleLogin(event) {
    event.preventDefault();
    showMessage('Sign-in is not connected yet. Your details have not been sent or saved.');
  }

  function handleRegister(event) {
    event.preventDefault();
    if (registration.password.length < 8) {
      showMessage('Choose a password with at least 8 characters.');
      return;
    }
    if (registration.password !== registration.confirm) {
      showMessage('The passwords do not match.');
      return;
    }

    showMessage('Account creation is not connected yet. Your details have not been sent or saved.');
  }

  function switchView(nextView) {
    setMessage('');
    setView(nextView);
  }

  return (
    <div
      className="auth-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label="Account access"
        aria-modal="true"
        className={`auth-card ${view === 'register' ? 'auth-card-register' : ''}`}
        role="dialog"
      >
        <button aria-label="Close login" className="auth-close" onClick={onClose} type="button">×</button>
        <div className="auth-brand">
          <img alt="Nasugbu Aquatica logo" src={logo} />
          <span>Nasugbu Aquatica</span>
        </div>

        {view === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <header className="auth-heading">
              <h1>Log in</h1>
              <p>Welcome back to AquaNova.</p>
            </header>
            {message && <p className="auth-message" role="status">{message}</p>}
            <AuthField
              autoComplete="email"
              id="login-email"
              label="Email address"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  autoComplete="current-password"
                  id="login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  type="password"
                  value={password}
                />
              </div>
            </div>
            <button className="auth-primary" type="submit">Log in</button>
            <p className="auth-switch">
              New to AquaNova?{' '}
              <button className="auth-text-button" onClick={() => switchView('register')} type="button">Create account</button>
            </p>
          </form>
        ) : (
          <form className="auth-form auth-register-form" onSubmit={handleRegister}>
            <header className="auth-heading">
              <h1>Create account</h1>
              <p>Make an account to continue to the web app.</p>
            </header>
            {message && <p className="auth-message" role="alert">{message}</p>}
            <div className="auth-register-grid">
              <AuthField autoComplete="name" id="register-name" label="Full name" onChange={(event) => setRegistration((form) => ({ ...form, name: event.target.value }))} placeholder="Your name" value={registration.name} />
              <AuthField autoComplete="tel" id="register-phone" label="Mobile number" onChange={(event) => setRegistration((form) => ({ ...form, phone: event.target.value }))} placeholder="09xx xxx xxxx" type="tel" value={registration.phone} />
              <AuthField autoComplete="email" id="register-email" label="Email address" onChange={(event) => setRegistration((form) => ({ ...form, email: event.target.value }))} placeholder="you@example.com" type="email" value={registration.email} />
              <AuthField autoComplete="street-address" id="register-address" label="Delivery address" onChange={(event) => setRegistration((form) => ({ ...form, address: event.target.value }))} placeholder="Street, barangay, Nasugbu" value={registration.address} />
              <AuthField autoComplete="new-password" id="register-password" label="Password" onChange={(event) => setRegistration((form) => ({ ...form, password: event.target.value }))} placeholder="At least 8 characters" type="password" value={registration.password} />
              <AuthField autoComplete="new-password" id="register-confirm" label="Confirm password" onChange={(event) => setRegistration((form) => ({ ...form, confirm: event.target.value }))} placeholder="Repeat your password" type="password" value={registration.confirm} />
            </div>
            <button className="auth-primary" type="submit">Create account</button>
            <p className="auth-switch">
              Already have an account?{' '}
              <button className="auth-text-button" onClick={() => switchView('login')} type="button">Log in</button>
            </p>
          </form>
        )}

        <button className="auth-back-link" onClick={onClose} type="button">Back to home</button>
      </section>
    </div>
  );
}

export default AuthPage;
