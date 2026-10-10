'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { CalendarDays, Gift, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { deletePromotion, savePromotion, setPromotionActive } from '@/app/(admin)/actions';
import { PageHeading } from '@/components/page-heading';
import { dateTime, euro } from '@/lib/format';
import { getPromotionStatus, promotionWeekdays, type Promotion } from '@/lib/promotions';

const statusLabels = { scheduled: 'Scheduled', active: 'Active', expired: 'Expired' };

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PromotionsManagement({
  initialPromotions,
  initialNow,
  promptText,
  loadError,
  promptError,
}: {
  initialPromotions: Promotion[];
  initialNow: string;
  promptText: string | null;
  loadError: string | null;
  promptError: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [promoType, setPromoType] = useState<Promotion['promo_type']>('percentage');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [now, setNow] = useState(() => new Date(initialNow));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      router.refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  function resetForm() {
    setEditing(null);
    setPromoType('percentage');
    setSelectedDays([1, 2, 3, 4, 5, 6, 7]);
  }

  function editPromotion(promotion: Promotion) {
    setEditing(promotion);
    setPromoType(promotion.promo_type);
    setSelectedDays(promotion.days_of_week);
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      formData.set('starts_at', new Date(String(formData.get('starts_local'))).toISOString());
      formData.set('ends_at', new Date(String(formData.get('ends_local'))).toISOString());
    } catch {
      setMessage('Check the start and end times.');
      setSaving(false);
      return;
    }
    const result = await savePromotion(formData);
    setMessage(result.message);
    setSaving(false);
    if (result.ok) {
      form.reset();
      resetForm();
      router.refresh();
    }
  }

  async function toggle(promotion: Promotion) {
    setBusyId(promotion.id);
    const result = await setPromotionActive(promotion.id, !promotion.is_active);
    setBusyId(null);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function remove(promotion: Promotion) {
    if (!window.confirm(`Delete promotion "${promotion.name}"?`)) return;
    setBusyId(promotion.id);
    const result = await deletePromotion(promotion.id);
    setBusyId(null);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <>
      <PageHeading
        eyebrow="OFFERS / PROMOTIONS"
        title="Promotions"
        description="Schedule offers and preview what the voice assistant receives today."
        action={<span className="count-stamp"><Gift size={16} /> {initialPromotions.length} promotions</span>}
      />

      <section className="panel promo-preview-panel">
        <div className="promo-section-heading">
          <span className="setting-icon"><Tag size={17} /></span>
          <div><h2>What the AI hears today</h2><p>Exact promotion text returned by the active menu tool.</p></div>
        </div>
        {promptError ? <p className="settings-error" role="status">{promptError}</p> : (
          <pre className="promo-prompt-preview">{promptText ?? 'There are no active offers today.'}</pre>
        )}
      </section>

      <section className="panel promo-form-panel">
        <div className="promo-section-heading">
          <span className="setting-icon"><CalendarDays size={17} /></span>
          <div><h2>{editing ? 'Edit promotion' : 'Create promotion'}</h2><p>Set the offer, date range, and recurring weekdays.</p></div>
        </div>
        <form key={editing?.id ?? 'new-promotion'} className="promo-form" onSubmit={(event) => void submit(event)}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="promo-form-grid">
            <label className="promo-field promo-field-wide">Name
              <input name="name" required maxLength={120} defaultValue={editing?.name ?? ''} placeholder="For example, Tuesday pizza deal" />
            </label>
            <label className="promo-field">Type
              <select name="promo_type" value={promoType} onChange={(event) => setPromoType(event.target.value as Promotion['promo_type'])}>
                <option value="percentage">Percentage discount</option>
                <option value="flat_amount">Fixed amount</option>
                <option value="free_item">Free item</option>
              </select>
            </label>
            {promoType === 'free_item' ? (
              <label className="promo-field">Free item
                <input name="free_item" required maxLength={120} defaultValue={editing?.free_item ?? ''} placeholder="For example, side of fries" />
              </label>
            ) : (
              <label className="promo-field">{promoType === 'percentage' ? 'Discount (%)' : 'Discount (€)'}
                <input name="discount_value" type="number" min="0.01" max={promoType === 'percentage' ? 100 : undefined} step={promoType === 'percentage' ? '0.1' : '0.01'} required defaultValue={editing?.discount_value ?? ''} />
              </label>
            )}
            <label className="promo-field">Promo code <span className="promo-optional">optional</span>
              <input name="promo_code" maxLength={40} defaultValue={editing?.promo_code ?? ''} placeholder="BIJV. LUNCH20" />
            </label>
            <label className="promo-field">Minimum order (€)
              <input name="minimum_order" type="number" min="0" step="0.01" required defaultValue={editing?.minimum_order ?? 0} />
            </label>
            <label className="promo-field">Start date and time
              <input name="starts_local" type="datetime-local" required defaultValue={editing ? localDateTime(editing.starts_at) : ''} />
            </label>
            <label className="promo-field">End date and time
              <input name="ends_local" type="datetime-local" required defaultValue={editing ? localDateTime(editing.ends_at) : ''} />
            </label>
          </div>

          <fieldset className="promo-weekdays">
            <legend>Valid on</legend>
            <div className="promo-weekday-options">
              {promotionWeekdays.map((day) => (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    name="days_of_week"
                    value={day.value}
                    checked={selectedDays.includes(day.value)}
                    onChange={(event) => setSelectedDays((days) => event.target.checked ? [...days, day.value].sort() : days.filter((value) => value !== day.value))}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="promo-active-toggle">
            <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
            <span><b>Promotion enabled</b><small>Only during the date range and selected weekdays</small></span>
          </label>

          {message && <p className="promo-feedback" role="status">{message}</p>}
          <div className="promo-form-actions">
            {editing && <button type="button" className="secondary-command" onClick={() => { resetForm(); setMessage(''); }}>Cancel</button>}
            <button type="submit" className="primary-command" disabled={saving}><Plus size={15} /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Save promotion'}</button>
          </div>
        </form>
      </section>

      <section className="panel data-panel promo-list-panel">
        <div className="promo-list-heading"><h2>Scheduled and active offers</h2><span>{initialPromotions.length} total</span></div>
        {loadError ? <div className="load-error">{loadError}</div> : initialPromotions.length ? (
          <div className="table-scroll">
            <table className="promo-table">
              <thead><tr><th>Offer</th><th>Code / minimum</th><th>Period</th><th>Weekdays</th><th>Status</th><th>Enabled</th><th>Actions</th></tr></thead>
              <tbody>{initialPromotions.map((promotion) => {
                const status = getPromotionStatus(promotion, now);
                return (
                  <tr key={promotion.id}>
                    <td><span className="table-primary">{promotion.name}</span><small>{promotion.promo_type === 'free_item' ? `Free ${promotion.free_item}` : promotion.promo_type === 'percentage' ? `${promotion.discount_value}% off` : `${euro(promotion.discount_value)} off`}</small></td>
                    <td>{promotion.promo_code || 'No code'}<small>Min. {euro(promotion.minimum_order)}</small></td>
                    <td>{dateTime(promotion.starts_at)}<small>to {dateTime(promotion.ends_at)}</small></td>
                    <td>{promotionWeekdays.filter((day) => promotion.days_of_week.includes(day.value)).map((day) => day.label).join(', ')}</td>
                    <td><span className={`promo-status promo-status-${status}`}>{statusLabels[status]}</span></td>
                    <td><button type="button" className={`promo-toggle${promotion.is_active ? ' is-on' : ''}`} aria-pressed={promotion.is_active} disabled={busyId === promotion.id} onClick={() => void toggle(promotion)}>{promotion.is_active ? 'On' : 'Off'}</button></td>
                    <td><div className="menu-row-actions">
                      <button type="button" className="icon-command" title="Edit promotion" aria-label="Edit promotion" onClick={() => editPromotion(promotion)}><Pencil size={14} /></button>
                      <button type="button" className="icon-command danger-command" title="Delete promotion" aria-label="Delete promotion" disabled={busyId === promotion.id} onClick={() => void remove(promotion)}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><Gift size={20} /><span>No promotions have been set up yet.</span></div>}
      </section>
    </>
  );
}