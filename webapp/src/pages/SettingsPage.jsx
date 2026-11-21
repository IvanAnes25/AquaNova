import { useEffect, useRef, useState } from 'react';
import { Button, Field, SectionTitle } from '../components/UI.jsx';
import { commercePath } from '../lib/commerceApi.js';

export default function SettingsPage({ settings, onSave }) {
  const [values, setValues] = useState(settings);
  const [qrFile, setQrFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  useEffect(() => setValues(settings), [settings]);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const updateDay = (day, key, value) => setValues((current) => {
    const shopHours = current.shopHours || settings.shopHours || {};
    return {
      ...current,
      shopHours: {
        ...shopHours,
        [day]: { ...shopHours[day], [key]: value },
      },
    };
  });
  const setDayClosed = (day, closed) => setValues((current) => {
    const shopHours = current.shopHours || settings.shopHours || {};
    const previous = shopHours[day] || {};
    return {
      ...current,
      shopHours: {
        ...shopHours,
        [day]: {
          closed,
          open: closed ? null : (previous.open || '07:00'),
          close: closed ? null : (previous.close || '17:00'),
        },
      },
    };
  });

  async function submit(event) {
    event.preventDefault();
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try {
      await onSave({
      shopName: values.shopName,
      shopPhone: values.shopPhone,
      shopAddress: values.shopAddress,
      about: values.about,
      deliveryFee: Number(values.deliveryFee),
      gcashName: values.gcashName,
      gcashNumber: values.gcashNumber,
      gcashEnabled: values.gcashEnabled !== false,
      codEnabled: values.codEnabled !== false,
      cashPickupEnabled: values.cashPickupEnabled !== false,
      shopHours: values.shopHours || settings.shopHours,
      shopOpenOverride: values.shopOpenOverride || 'scheduled',
      shopClosedMessage: values.shopClosedMessage || '',
      acceptOrdersWhenClosed: values.acceptOrdersWhenClosed !== false,
      autoCancelHours: values.autoCancelHours === '' || values.autoCancelHours == null
        ? null
        : Number(values.autoCancelHours),
      largeChangeThreshold: Number(values.largeChangeThreshold ?? 20),
      }, qrFile);
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return <>
    <SectionTitle eyebrow="MAKE IT YOUR SHOP" title="Settings" />
    <div className="settings-layout settings-layout-single">
      <form className="panel form-panel settings-main" onSubmit={submit}><div className="panel-heading"><span className="settings-avatar">A</span><div><h2>Shop profile and checkout</h2><p>These details are shown to customers and used to calculate checkout totals.</p></div></div>
        <div className="form-grid">
          <Field label="Shop name"><input className="input" required value={values.shopName || ''} onChange={(event) => update('shopName', event.target.value)} /></Field>
          <Field label="Contact number"><input className="input" value={values.shopPhone || ''} onChange={(event) => update('shopPhone', event.target.value)} /></Field>
          <Field label="Shop address" className="field-full"><input className="input" value={values.shopAddress || ''} onChange={(event) => update('shopAddress', event.target.value)} /></Field>
          <Field label="About your shop" className="field-full"><textarea className="input textarea" value={values.about || ''} onChange={(event) => update('about', event.target.value)} /></Field>
          <Field label="Shop status" className="field-full">
            <div className="shop-override-control">
              <span>{values.shopOpenOverride === 'scheduled'
                ? `Following weekday hours (${settings.shopStatus?.isOpen ? 'currently open' : 'currently closed'})`
                : `Manual override: ${values.shopOpenOverride === 'open' ? 'Open' : 'Closed'}`}</span>
              <label className="shop-override-switch">
                <span>Open</span>
                <button
                  type="button"
                  className={`toggle-switch ${(values.shopOpenOverride === 'scheduled'
                    ? Boolean(settings.shopStatus?.isOpen)
                    : values.shopOpenOverride === 'open') ? 'toggle-on' : ''}`}
                  role="switch"
                  aria-label="Manual shop open override"
                  aria-checked={values.shopOpenOverride === 'scheduled'
                    ? Boolean(settings.shopStatus?.isOpen)
                    : values.shopOpenOverride === 'open'}
                  onClick={() => {
                    const currentlyOpen = values.shopOpenOverride === 'scheduled'
                      ? Boolean(settings.shopStatus?.isOpen)
                      : values.shopOpenOverride === 'open';
                    update('shopOpenOverride', currentlyOpen ? 'closed' : 'open');
                  }}
                ><i /></button>
              </label>
              {values.shopOpenOverride !== 'scheduled'
                && <Button type="button" variant="secondary" onClick={() => update('shopOpenOverride', 'scheduled')}>Follow weekday hours</Button>}
            </div>
            <span className="field-hint">A manual Open/Closed setting overrides the schedule until you choose Follow weekday hours.</span>
          </Field>
          <Field label="Opening hours (Asia/Manila)" className="field-full">
            <div className="shop-hours-list">
              {[
                ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
                ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'],
              ].map(([day, label]) => {
                const hours = values.shopHours?.[day] || settings.shopHours?.[day] || { closed: true, open: '', close: '' };
                return <div className="shop-hours-row" key={day}>
                  <b>{label}</b>
                  <label><input type="checkbox" checked={Boolean(hours.closed)} onChange={(event) => setDayClosed(day, event.target.checked)} /> Closed</label>
                  <input className="input" aria-label={`${label} opens`} type="time" value={hours.open || ''} disabled={hours.closed} onChange={(event) => updateDay(day, 'open', event.target.value)} />
                  <span>to</span>
                  <input className="input" aria-label={`${label} closes`} type="time" value={hours.close || ''} disabled={hours.closed} onChange={(event) => updateDay(day, 'close', event.target.value)} />
                </div>;
              })}
            </div>
          </Field>
          <Field label="Message when closed" className="field-full">
            <textarea className="input textarea" maxLength="500" value={values.shopClosedMessage || ''} onChange={(event) => update('shopClosedMessage', event.target.value)} />
            <span className="field-hint">Optional message shown to customers while the shop is closed.</span>
          </Field>
          <Field label="Accept orders when closed" className="field-full">
            <label className="shop-accept-closed"><input type="checkbox" checked={values.acceptOrdersWhenClosed !== false} onChange={(event) => update('acceptOrdersWhenClosed', event.target.checked)} /> Accept orders when closed; process them when the shop opens</label>
          </Field>
          <Field label="Delivery fee (PHP)"><input className="input" min="0" step="0.01" type="number" value={values.deliveryFee ?? 0} onChange={(event) => update('deliveryFee', event.target.value)} /></Field>
          <Field label="Auto-cancel pending orders (hours)"><input className="input" min="1" max="720" step="1" type="number" value={values.autoCancelHours ?? ''} onChange={(event) => update('autoCancelHours', event.target.value)} /><span className="field-hint">Unpaid orders expire after this many hours. Rejected orders expire this long after rejection. Proofs Under review are never auto-cancelled. Leave blank to disable.</span></Field>
          <Field label="Large stock-change threshold (units)"><input className="input" type="number" min="1" max="100000" step="1" required value={values.largeChangeThreshold ?? 20} onChange={(event) => update('largeChangeThreshold', event.target.value)} /><span className="field-hint">A stock change is large at this amount or 50% of current stock, whichever is smaller.</span></Field>
          <Field label="GCash recipient name"><input className="input" value={values.gcashName || ''} onChange={(event) => update('gcashName', event.target.value)} /></Field>
          <Field label="GCash number"><input className="input" value={values.gcashNumber || ''} onChange={(event) => update('gcashNumber', event.target.value)} /></Field>
          <Field label="Payment options" className="field-full">
            <div className="settings-payment-options">
              <label><input type="checkbox" checked={values.gcashEnabled !== false} onChange={(event) => update('gcashEnabled', event.target.checked)} /> GCash</label>
              <label><input type="checkbox" checked={values.codEnabled !== false} onChange={(event) => update('codEnabled', event.target.checked)} /> Cash on delivery</label>
              <label><input type="checkbox" checked={values.cashPickupEnabled !== false} onChange={(event) => update('cashPickupEnabled', event.target.checked)} /> Cash at the shop</label>
            </div>
          </Field>
          <Field label="GCash QR image (raster image, max 2 MB)" className="field-full">
            <input className="input" type="file" accept="image/*" onChange={(event) => setQrFile(event.target.files?.[0] || null)} />
            {values.gcashQrUrl && <img className="settings-qr-preview" src={commercePath(values.gcashQrUrl)} alt="Configured shop GCash QR" />}
            <span className="field-hint">{values.gcashReady ? 'GCash checkout is enabled.' : 'GCash checkout remains unavailable until recipient name, number, and QR are configured.'}</span>
          </Field>
        </div>
        <div className="settings-actions"><Button type="submit" aria-label="Save settings" loading={saving}>Save settings</Button></div>
      </form>
    </div>
  </>;
}
