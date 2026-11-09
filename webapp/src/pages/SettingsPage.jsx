import { Button, Field, SectionTitle } from '../components/UI.jsx';

export default function SettingsPage({ onToast }) {
  return <>
    <SectionTitle eyebrow="MAKE IT YOUR SHOP" title="Settings" action={<Button onClick={() => onToast('Settings saved.')}>Save changes</Button>} />
    <div className="settings-layout"><nav className="panel settings-nav"><button className="settings-nav-active">Shop profile</button><button onClick={() => onToast('Payment settings are ready to configure.')}>Payment details</button><button onClick={() => onToast('Delivery settings are ready to configure.')}>Delivery & pickup</button><button onClick={() => onToast('Notification preferences are up to date.')}>Notifications</button></nav>
      <section className="panel form-panel settings-main"><div className="panel-heading"><span className="settings-avatar">A</span><div><h2>Shop profile</h2><p>These details are shown to your customers.</p></div></div>
        <div className="form-grid"><Field label="Shop name"><input className="input" defaultValue="Aquatica Nasugbu" /></Field><Field label="Contact number"><input className="input" defaultValue="+63 917 555 0142" /></Field><Field label="Shop address" className="field-full"><input className="input" defaultValue="Nasugbu, Batangas, Philippines" /></Field><Field label="About your shop" className="field-full"><textarea className="input textarea" defaultValue="Your local home for ornamental fish and everything your aquarium needs." /></Field></div>
        <div className="settings-hours"><h3>Shop hours</h3>{[['Monday – Friday', '9:00 AM – 6:00 PM'], ['Saturday', '9:00 AM – 5:00 PM'], ['Sunday', '10:00 AM – 4:00 PM']].map(([day, hours]) => <div className="hours-row" key={day}><span>{day}</span><b>{hours}</b></div>)}</div>
      </section>
    </div>
  </>;
}
