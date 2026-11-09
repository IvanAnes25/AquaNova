import { Button, Field, SectionTitle } from '../components/UI.jsx';

export default function AccountPage({ customer, setCustomer, onToast }) {
  return <>
    <SectionTitle eyebrow="YOUR AQUATICA PROFILE" title="My account" />
    <div className="account-layout"><section className="panel form-panel">
      <div className="profile-heading"><span className="profile-avatar">MR</span><div><h2>{customer.name}</h2><span>Customer since 2025</span></div><Button variant="secondary" onClick={() => onToast('Profile saved (demo).')}>Save profile</Button></div>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <Field label="Full name"><input className="input" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></Field>
        <Field label="Phone number"><input className="input" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></Field>
        <Field label="Email"><input className="input" value="mika.reyes@example.com" readOnly /></Field>
        <Field label="Default address"><input className="input" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></Field>
      </div>
      <div className="detail-block"><h3>Preferences</h3><div className="detail-info-row"><span>Order updates</span><button className="toggle-switch toggle-on" aria-label="Order updates enabled"><i /></button></div><div className="detail-info-row"><span>Occasional shop news</span><button className="toggle-switch" aria-label="Shop news disabled"><i /></button></div></div>
    </section>
    <section className="panel account-help"><div className="help-mark">?</div><h3>Need a hand?</h3><p>We’re a local shop, and we’re always happy to help with your fish, setup or order.</p><Button variant="secondary" onClick={() => onToast('Our team will be happy to help at the shop.')}>Get in touch</Button></section></div>
  </>;
}
