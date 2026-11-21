import { useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { Button, Field, SectionTitle } from '../components/UI.jsx';

const passwordMinLength = 8;
const passwordMaxLength = 1024;
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function PasswordChangeForm({ onChange }) {
  const [values, setValues] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const formRef = useRef(null);
  const submitLock = useRef(false);
  const passwordValid = values.password.length >= passwordMinLength
    && values.password.length <= passwordMaxLength;

  const update = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '', form: '' }));
    setSuccess('');
  };

  const focusError = (name) => {
    window.requestAnimationFrame(() => formRef.current?.querySelector(`[name="${name}"]`)?.focus());
  };

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;

    const validation = {};
    if (!values.currentPassword) validation.currentPassword = 'Enter your current password.';
    if (!passwordValid) validation.password = 'Use a password with 8 to 1,024 characters.';
    if (values.password && values.password === values.currentPassword) {
      validation.password = 'Choose a password different from your current password.';
    }
    if (values.confirmPassword !== values.password) validation.confirmPassword = 'Passwords do not match.';
    if (Object.keys(validation).length) {
      setErrors(validation);
      setSuccess('');
      focusError(Object.keys(validation)[0]);
      return;
    }

    submitLock.current = true;
    setBusy(true);
    setErrors({});
    setSuccess('');
    try {
      await onChange(values);
      setValues({ currentPassword: '', password: '', confirmPassword: '' });
      setVisible({});
      setSuccess('Your password has been changed. Other sessions have been signed out.');
    } catch (error) {
      const message = error.message || 'The password could not be changed.';
      const field = message.toLowerCase().includes('current password')
        ? 'currentPassword'
        : message.toLowerCase().includes('different from')
          ? 'password'
          : message.toLowerCase().includes('matching password')
            ? 'confirmPassword'
            : null;
      if (field) {
        setErrors({ [field]: message });
        focusError(field);
      } else {
        setErrors({ form: message });
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  const passwordField = (name, label, autoComplete) => (
    <label key={name}>
      <span>{label}</span>
      <span className="password-input-wrap">
        <input
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          aria-invalid={Boolean(errors[name])}
          autoComplete={autoComplete}
          className="input"
          name={name}
          onChange={(event) => update(name, event.target.value)}
          required
          type={visible[name] ? 'text' : 'password'}
          value={values[name]}
        />
        <button
          aria-label={`${visible[name] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={Boolean(visible[name])}
          className="password-visibility"
          onClick={() => setVisible((current) => ({ ...current, [name]: !current[name] }))}
          type="button"
        >
          <Icon name={visible[name] ? 'eyeOff' : 'eye'} size={18} />
        </button>
        <span aria-live="polite" style={visuallyHidden}>
          {label} is {visible[name] ? 'visible' : 'hidden'}.
        </span>
      </span>
      {errors[name] && <span className="inline-error" id={`${name}-error`} role="alert">{errors[name]}</span>}
    </label>
  );

  return <form className="panel form-panel account-password-form" onSubmit={submit} ref={formRef}>
    <div>
      <h2>Change password</h2>
      <p>Use your current password to set a new password for this account.</p>
    </div>
    {errors.form && <p className="inline-error" role="alert">{errors.form}</p>}
    {success && <p className="account-password-success" role="status">{success}</p>}
    {passwordField('currentPassword', 'Current password', 'current-password')}
    {passwordField('password', 'New password', 'new-password')}
    <ul className="password-rules" aria-label="Password requirements" aria-live="polite">
      <li className={passwordValid ? 'password-rule-met' : ''}>
        {passwordValid ? '✓' : '•'} 8 to 1,024 characters
      </li>
    </ul>
    {passwordField('confirmPassword', 'Confirm new password', 'new-password')}
    <Button type="submit" loading={busy}>Save new password</Button>
  </form>;
}

export default function AccountPage({
  customer,
  user,
  role,
  setCustomer,
  onSave,
  onChangePassword,
  onToast,
}) {
  const isCustomer = role === 'customer';
  const profile = isCustomer ? customer : user;
  return <>
    <SectionTitle eyebrow="YOUR AQUATICA PROFILE" title="My account" />
    <div className="account-layout">
      {isCustomer
        ? <section className="panel form-panel">
          <div className="profile-heading"><span className="profile-avatar">{(customer.name || 'A').slice(0, 1)}</span><div><h2>{customer.name}</h2><span>Customer account</span></div><Button variant="secondary" onClick={onSave}>Save profile</Button></div>
          <div className="form-grid" style={{ marginTop: 18 }}>
            <Field label="Full name"><input className="input" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></Field>
            <Field label="Phone number"><input className="input" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></Field>
            <Field label="Email"><input className="input" value={customer.email || ''} readOnly /></Field>
            <Field label="Default address"><input className="input" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></Field>
          </div>
          <div className="detail-block"><h3>Preferences</h3><div className="detail-info-row"><span>Order updates</span><button className="toggle-switch toggle-on" aria-label="Order updates enabled"><i /></button></div><div className="detail-info-row"><span>Occasional shop news</span><button className="toggle-switch" aria-label="Shop news disabled"><i /></button></div></div>
        </section>
        : <section className="panel form-panel">
          <div className="profile-heading"><span className="profile-avatar">{(profile?.name || 'A').slice(0, 1)}</span><div><h2>{profile?.name || 'Account'}</h2><span>Owner account</span></div></div>
          <div className="form-grid" style={{ marginTop: 18 }}>
            <Field label="Full name"><input className="input" value={profile?.name || ''} readOnly /></Field>
            <Field label="Email"><input className="input" value={profile?.email || ''} readOnly /></Field>
          </div>
        </section>}
      <PasswordChangeForm onChange={onChangePassword} />
      <section className="panel account-help"><div className="help-mark">?</div><h3>Need a hand?</h3><p>We’re a local shop, and we’re always happy to help with your fish, setup or order.</p><Button variant="secondary" onClick={() => onToast('Our team will be happy to help at the shop.')}>Get in touch</Button></section>
    </div>
  </>;
}
