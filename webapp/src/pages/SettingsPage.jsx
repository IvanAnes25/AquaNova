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
      autoCancelHours: values.autoCancelHours === '' || values.autoCancelHours == null
        ? null
        : Number(values.autoCancelHours),
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
          <Field label="Delivery fee (PHP)"><input className="input" min="0" step="0.01" type="number" value={values.deliveryFee ?? 0} onChange={(event) => update('deliveryFee', event.target.value)} /></Field>
          <Field label="Auto-cancel pending orders (hours)"><input className="input" min="1" max="720" step="1" type="number" value={values.autoCancelHours ?? ''} onChange={(event) => update('autoCancelHours', event.target.value)} /><span className="field-hint">Unpaid orders expire after this many hours. Rejected orders expire this long after rejection. Proofs Under review are never auto-cancelled. Leave blank to disable.</span></Field>
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
