'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Clock3, Save, Settings2 } from 'lucide-react';
import { saveBusinessSettings } from '@/app/(admin)/actions';
import type { Database, Json } from '@/lib/database.types';
import { PageHeading } from '@/components/page-heading';

type Setting = Database['public']['Tables']['settings']['Row'];
const weekdays = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;
const weekdayLabels: Record<(typeof weekdays)[number], string> = {
  maandag: 'Monday', dinsdag: 'Tuesday', woensdag: 'Wednesday', donderdag: 'Thursday',
  vrijdag: 'Friday', zaterdag: 'Saturday', zondag: 'Sunday',
};
const defaultHours: Record<(typeof weekdays)[number], string> = {
  maandag: 'gesloten', dinsdag: '10:00-22:00', woensdag: '10:00-22:00', donderdag: '10:00-22:00',
  vrijdag: '10:00-23:00', zaterdag: '10:00-23:00', zondag: '11:00-21:00',
};

function asRecord(value: Json | undefined): Record<string, Json | undefined> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

export function SettingsManagement({ initialSettings, loadError }: { initialSettings: Setting[]; loadError: string | null }) {
  const values = useMemo(() => Object.fromEntries(initialSettings.map((setting) => [setting.key, setting.value])), [initialSettings]);
  const storedHours = asRecord(values.opening_hours);
  const initialHours = Object.fromEntries(weekdays.map((day) => [day, typeof storedHours[day] === 'string' ? storedHours[day] as string : defaultHours[day]])) as Record<(typeof weekdays)[number], string>;
  const [closedDays, setClosedDays] = useState(() => new Set(weekdays.filter((day) => initialHours[day] === 'gesloten')));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [smsPreview, setSmsPreview] = useState('');

  const basePrep = typeof values.base_prep_minutes === 'number' ? values.base_prep_minutes : 20;
  const businessName = typeof values.business_name === 'string' ? values.business_name : 'Restaurant';
  const deliveryFee = typeof values.delivery_fee_eur === 'number' ? values.delivery_fee_eur : 3.5;
  const smsTemplate = typeof values.sms_template_nl === 'string'
    ? values.sms_template_nl
    : 'Bedankt voor uw bestelling! We bereiden deze nu en verwachten u over ongeveer {{eta_minutes}} minuten. Tot snel!';
  const bookingCapacity = typeof values.booking_slot_capacity === 'number' ? values.booking_slot_capacity : 20;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const result = await saveBusinessSettings(new FormData(event.currentTarget));
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(false);
  }

  function toggleClosed(day: (typeof weekdays)[number], checked: boolean) {
    setClosedDays((current) => {
      const next = new Set(current);
      if (checked) next.add(day);
      else next.delete(day);
      return next;
    });
  }

  return (
    <>
      <PageHeading eyebrow="CONFIGURATION / 05" title="Settings" description="Opening hours, preparation, delivery, and customer messages." action={<span className="count-stamp"><Settings2 size={16} /> Business profile</span>} />
      {loadError ? <section className="panel"><div className="load-error">Settings could not be loaded. Check your Supabase configuration.</div></section> : (
        <form className="business-settings-form" onSubmit={(event) => void save(event)}>
          <section className="panel settings-section">
            <div className="settings-section-heading"><span className="setting-icon"><Settings2 size={17} /></span><div><h2>Business name</h2><p>Shown throughout the admin dashboard.</p></div></div>
            <label>Business name<input type="text" name="business_name" required maxLength={120} defaultValue={businessName} /></label>
          </section>
          <section className="panel settings-section">
            <div className="settings-section-heading"><span className="setting-icon"><Clock3 size={17} /></span><div><h2>Opening hours</h2><p>Local time, by day of the week.</p></div></div>
            <div className="hours-grid"><div className="hours-header"><span>Day</span><span>Opens</span><span>Closes</span><span>Closed</span></div>
              {weekdays.map((day) => {
                const [open, close] = (initialHours[day] === 'gesloten' ? defaultHours[day] : initialHours[day]).split('-');
                const isClosed = closedDays.has(day);
                return <div className={`hours-row${isClosed ? ' hours-closed' : ''}`} key={day}>
                  <b>{weekdayLabels[day]}</b>
                  <input type="time" name={`open_${day}`} aria-label={`${weekdayLabels[day]} opening time`} defaultValue={open} disabled={isClosed} />
                  <input type="time" name={`close_${day}`} aria-label={`${weekdayLabels[day]} closing time`} defaultValue={close} disabled={isClosed} />
                  <label className="closed-toggle"><input type="checkbox" name={`closed_${day}`} checked={isClosed} onChange={(event) => toggleClosed(day, event.target.checked)} /><span>Closed</span></label>
                </div>;
              })}
            </div>
          </section>

          <section className="panel settings-section">
            <div className="settings-section-heading"><span className="setting-icon"><Clock3 size={17} /></span><div><h2>Preparation & delivery</h2><p>Used for order totals and estimated times.</p></div></div>
            <div className="settings-number-grid">
              <label>Base preparation time<span>Minutes</span><div className="settings-input-suffix"><input type="number" name="base_prep_minutes" min="0" step="1" required defaultValue={basePrep} /><i>min</i></div></label>
              <label>Delivery fee<span>EUR per order</span><div className="settings-input-suffix"><i>€</i><input type="number" name="delivery_fee_eur" min="0" step="0.01" required defaultValue={deliveryFee} /></div></label>
              <label>Booking capacity<span>People per time slot</span><div className="settings-input-suffix"><input type="number" name="booking_slot_capacity" min="1" step="1" required defaultValue={bookingCapacity} /><i>people</i></div></label>
            </div>
          </section>

          <section className="panel settings-section">
            <div className="settings-section-heading"><span className="setting-icon"><Settings2 size={17} /></span><div><h2>Dutch SMS template</h2><p>Use {'{{eta_minutes}}'} for the estimated preparation time.</p></div></div>
            <label className="sms-template-field"><span>Customer message</span><textarea name="sms_template_nl" rows={4} maxLength={500} required defaultValue={smsTemplate} onChange={(event) => setSmsPreview(event.target.value)} /></label>
            <div className="sms-live-preview" aria-live="polite"><b>Live preview</b><p>{(smsPreview || smsTemplate).replaceAll('{{eta_minutes}}', '25')}</p></div>
          </section>

          <div className="settings-submit-row">{message && <p className={success ? 'settings-success' : 'settings-error'} role="status">{message}</p>}<button type="submit" className="primary-command" disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save settings'}</button></div>
        </form>
      )}
    </>
  );
}