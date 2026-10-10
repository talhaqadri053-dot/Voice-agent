'use client';

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  CircleOff,
  Download,
  FileSpreadsheet,
  Layers3,
  MapPinned,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  attachModifierGroupsToItem,
  deleteDeliveryZone,
  deleteMenuItem,
  deleteModifierGroup,
  importMenuItems,
  saveDeliveryZone,
  saveMenuItem,
  saveModifierGroup,
  setDeliveryZoneActive,
  setMenuAvailability,
} from '@/app/(admin)/actions';
import { PageHeading } from '@/components/page-heading';
import { euro } from '@/lib/format';
import type { Database } from '@/lib/database.types';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

type MenuItem = Database['public']['Tables']['menu_items']['Row'];
type ModifierOption = Database['public']['Tables']['menu_modifier_options']['Row'];
type ModifierGroup = Database['public']['Tables']['menu_modifier_groups']['Row'] & {
  options: ModifierOption[];
  item_ids: string[];
};
type DeliveryZone = Database['public']['Tables']['delivery_zones']['Row'];

type ImportRow = {
  rowNumber: number;
  name: string;
  category: string;
  description: string;
  price: string;
  prep_minutes: string;
  available: string;
  valid: boolean;
  errors: string[];
  data: {
    name: string;
    category: string;
    description: string;
    price: number;
    prep_minutes: number;
    available: boolean;
  };
};

export function MenuManagement({
  initialItems,
  modifierGroups,
  deliveryZones,
  loadError,
}: {
  initialItems: MenuItem[];
  modifierGroups: ModifierGroup[];
  deliveryZones: DeliveryZone[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState(initialItems);
  const [editing, setEditing] = useState<MenuItem | null | 'new'>(null);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'upload' | 'modifiers' | 'delivery'>('items');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadRows, setUploadRows] = useState<ImportRow[]>([]);
  const [uploadNotice, setUploadNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modifierDraft, setModifierDraft] = useState({
    id: '',
    name: '',
    required: false,
    min_select: 0,
    max_select: 1,
    options: [{ id: '', name: '', extra_price: 0 }],
  });

  const categories = useMemo(() => Array.from(new Set(menuItems.map((item) => item.category))).sort(), [menuItems]);
  const availableCount = menuItems.filter((item) => item.available).length;

  useEffect(() => {
    setMenuItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel('menu-item-stock')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menu_items' }, ({ new: updated }) => {
        const item = updated as MenuItem;
        setMenuItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...item } : entry));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const selectedGroupIds = Array.from(formData.getAll('attached_group_ids')).map((value) => String(value));
    const result = await saveMenuItem(formData);
    setSaving(false);
    setMessage(result.message);

    if (result.ok) {
      const itemId = result.id ?? (editing !== 'new' && editing ? editing.id : '');
      if (itemId) {
        const assignmentForm = new FormData();
        assignmentForm.set('item_id', itemId);
        selectedGroupIds.forEach((groupId) => assignmentForm.append('group_ids', groupId));
        await attachModifierGroupsToItem(assignmentForm);
      }
      setEditing(null);
      router.refresh();
    }
  }

  async function remove(item: MenuItem) {
    if (!window.confirm(`Are you sure you want to delete ${item.name}?`)) return;
    setDeletingId(item.id);
    const result = await deleteMenuItem(item.id);
    setDeletingId(null);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  function updateModifierOption(index: number, field: 'name' | 'extra_price', value: string | number) {
    setModifierDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option,
      ),
    }));
  }

  function addModifierOption() {
    setModifierDraft((current) => ({
      ...current,
      options: [...current.options, { id: '', name: '', extra_price: 0 }],
    }));
  }

  function removeModifierOption(index: number) {
    setModifierDraft((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  async function submitModifierGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('options', JSON.stringify(modifierDraft.options.map((option) => ({
      id: option.id,
      name: option.name,
      extra_price: Number(option.extra_price ?? 0),
    }))));
    if (modifierDraft.id) formData.set('id', modifierDraft.id);
    const result = await saveModifierGroup(formData);
    setMessage(result.message);

    if (result.ok) {
      setModifierDraft({
        id: '',
        name: '',
        required: false,
        min_select: 0,
        max_select: 1,
        options: [{ id: '', name: '', extra_price: 0 }],
      });
      router.refresh();
    }
  }

  async function removeGroup(group: ModifierGroup) {
    if (!window.confirm(`Are you sure you want to delete ${group.name}?`)) return;
    const result = await deleteModifierGroup(group.id);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function saveZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await saveDeliveryZone(formData);
    setMessage(result.message);
    if (result.ok) {
      event.currentTarget.reset();
      setEditingZone(null);
      router.refresh();
    }
  }

  async function removeZone(zone: DeliveryZone) {
    if (!window.confirm(`Are you sure you want to delete ${zone.name}?`)) return;
    const result = await deleteDeliveryZone(zone.id);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function toggleZone(zone: DeliveryZone) {
    const result = await setDeliveryZoneActive(zone.id, !zone.active);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  function downloadTemplate() {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['name', 'category', 'description', 'price', 'prep_minutes', 'available'],
      ['Margherita Pizza', 'Pizza', 'Tomaat, basilicum, mozzarella', '12.50', '15', 'true'],
      ['Fries', 'Snacks', 'Verse friet', '4.50', '8', 'true'],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Menu');
    XLSX.writeFile(workbook, 'menu-template.xlsx');
  }

  function downloadErrorReport() {
    const report = uploadRows
      .filter((row) => !row.valid)
      .map((row) => ({ row: row.rowNumber, name: row.name, errors: row.errors.join('; ') }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report), 'Import errors');
    XLSX.writeFile(workbook, 'menu-import-errors.xlsx');
  }

  async function handleBulkUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '', raw: false });

      const parsedRows: ImportRow[] = rows.map((row, index) => {
        const record = row as Record<string, unknown>;
        const name = String(record.name ?? record.item_name ?? '').trim();
        const category = String(record.category ?? '').trim();
        const description = String(record.description ?? '').trim();
        const priceValue = Number(record.price ?? record.price_eur ?? 0);
        const prepValue = Number(record.prep_minutes ?? record['prep minutes'] ?? record.prepMinutes ?? 0);
        const availableValue = String(record.available ?? 'true');
        const errors: string[] = [];

        if (!name) errors.push('Name is required');
        if (!category) errors.push('Category is required');
        if (!Number.isFinite(priceValue) || priceValue < 0) errors.push('Price is invalid');
        if (!Number.isFinite(prepValue) || prepValue < 0) errors.push('Preparation time is invalid');

        return {
          rowNumber: index + 2,
          name,
          category,
          description,
          price: Number.isFinite(priceValue) ? String(priceValue) : '',
          prep_minutes: Number.isFinite(prepValue) ? String(prepValue) : '',
          available: availableValue,
          valid: errors.length === 0,
          errors,
          data: {
            name,
            category,
            description,
            price: Number.isFinite(priceValue) ? Number(priceValue.toFixed(2)) : 0,
            prep_minutes: Number.isFinite(prepValue) ? Math.max(0, Math.round(prepValue)) : 0,
            available: !(availableValue === 'false' || availableValue === '0' || availableValue === 'no' || availableValue === 'out'),
          },
        };
      });

      setUploadRows(parsedRows);
      const invalidCount = parsedRows.filter((row) => !row.valid).length;
      setUploadNotice({
        type: invalidCount > 0 ? 'error' : 'success',
        text: invalidCount > 0 ? `${invalidCount} row(s) have validation issues.` : `${parsedRows.length} row(s) ready to import.`,
      });
    } catch (error) {
      setUploadNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'The file could not be read.',
      });
    }

    event.target.value = '';
  }

  async function commitUpload() {
    const validRows = uploadRows.filter((row) => row.valid).map((row) => row.data);
    if (!validRows.length) {
      setUploadNotice({ type: 'error', text: 'There are no valid rows to import.' });
      return;
    }

    const formData = new FormData();
    formData.set('rows', JSON.stringify(validRows));
    const result = await importMenuItems(formData);
    setUploadNotice({ type: result.ok ? 'success' : 'error', text: result.message });
    if (result.ok) {
      setUploadRows([]);
      router.refresh();
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="CATALOG / 04"
        title="Menu"
        description="Manage menu items, stock, bulk imports, modifiers, and delivery zones."
        action={
          <div className="menu-heading-actions">
            <span className="count-stamp"><Utensils size={16} /> {availableCount} available</span>
            <button type="button" className="primary-command" onClick={() => { setMessage(''); setEditing('new'); }}>
              <Plus size={16} /> Add item
            </button>
          </div>
        }
      />

      <div className="menu-tabs">
        {[
          { key: 'items', label: 'Items' },
          { key: 'upload', label: 'Bulk import' },
          { key: 'modifiers', label: 'Modifiers' },
          { key: 'delivery', label: 'Delivery zones' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`menu-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && <p className="menu-feedback" role="status">{message}</p>}

      {activeTab === 'items' && (
        <section className="panel data-panel">
          {loadError ? (
            <div className="load-error">The menu could not be loaded. Check your Supabase configuration.</div>
          ) : menuItems.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Preparation</th>
                    <th className="align-right">Price</th>
                    <th>Availability</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="table-primary">{item.name}</span>
                        <small>{item.description}</small>
                      </td>
                      <td><span className="category-label">{item.category}</span></td>
                      <td>{item.prep_minutes} min</td>
                      <td className="align-right table-primary">{euro(item.price)}</td>
                      <td>
                        <form action={setMenuAvailability}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="available" value={String(!item.available)} />
                          <button className={`availability-button${item.available ? ' is-available' : ''}`} type="submit">
                            {item.available ? <><Check size={14} /> Available</> : <><CircleOff size={14} /> Out of stock</>}
                          </button>
                        </form>
                      </td>
                      <td>
                        <div className="menu-row-actions">
                          <button type="button" className="icon-command" title={`Edit ${item.name}`} aria-label={`Edit ${item.name}`} onClick={() => { setMessage(''); setEditing(item); }}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-command danger-command" title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`} disabled={deletingId === item.id} onClick={() => void remove(item)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <Utensils size={20} />
              <span>Your menu is empty.</span>
              <button type="button" className="text-link" onClick={() => setEditing('new')}>Add the first item</button>
            </div>
          )}
        </section>
      )}

      {activeTab === 'upload' && (
        <section className="panel settings-section">
          <div className="settings-section-heading">
            <span className="setting-icon"><Upload size={17} /></span>
            <div>
              <h2>Bulk import</h2>
              <p>Upload CSV or Excel files. Existing items are matched by name.</p>
            </div>
          </div>

          <div className="bulk-upload-actions">
            <label className="primary-command file-input-label">
              <FileSpreadsheet size={15} /> Choose file
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleBulkUpload} />
            </label>
            <button type="button" className="secondary-command" onClick={downloadTemplate}>
              <Download size={15} /> Download template
            </button>
            {uploadRows.length > 0 && (
              <button type="button" className="primary-command" onClick={() => void commitUpload()}>
                <Upload size={15} /> Import rows
              </button>
            )}
            {uploadRows.some((row) => !row.valid) && (
              <button type="button" className="secondary-command" onClick={downloadErrorReport}>
                <Download size={15} /> Download error report
              </button>
            )}
          </div>

          {uploadNotice && (
            <p className={uploadNotice.type === 'success' ? 'settings-success' : 'settings-error'} role="status">
              {uploadNotice.text}
            </p>
          )}

          {uploadRows.length > 0 && (
            <div className="table-scroll upload-preview">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Preparation</th>
                    <th>Available</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.name}`} className={row.valid ? '' : 'invalid-row'}>
                      <td>{row.rowNumber}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.category || '—'}</td>
                      <td>{row.price || '—'}</td>
                      <td>{row.prep_minutes || '—'}</td>
                      <td>{row.available || 'true'}</td>
                      <td>{row.valid ? 'Valid' : 'Invalid'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {uploadRows.some((row) => !row.valid) && (
            <div className="upload-errors">
              <h3>Validation errors</h3>
              <ul>
                {uploadRows
                  .filter((row) => !row.valid)
                  .flatMap((row) => row.errors.map((error) => ({ rowNumber: row.rowNumber, error })))
                  .map((item) => (
                    <li key={`${item.rowNumber}-${item.error}`}>Row {item.rowNumber}: {item.error}</li>
                  ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {activeTab === 'modifiers' && (
        <section className="panel settings-section">
          <div className="settings-section-heading">
            <span className="setting-icon"><Layers3 size={17} /></span>
            <div>
              <h2>Modifier groups</h2>
              <p>Create extra options such as toppings, sauces, or dietary choices.</p>
            </div>
          </div>

          <form className="modifier-form" onSubmit={(event) => void submitModifierGroup(event)}>
            {modifierDraft.id && <input type="hidden" name="id" value={modifierDraft.id} />}
            <label>
              Group name
              <input
                value={modifierDraft.name}
                onChange={(event) => setModifierDraft((current) => ({ ...current, name: event.target.value }))}
                name="name"
                required
                maxLength={120}
              />
            </label>

            <div className="menu-number-fields">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="required"
                  checked={modifierDraft.required}
                  onChange={(event) => setModifierDraft((current) => ({ ...current, required: event.target.checked }))}
                />
                Required
              </label>
              <label>
                Minimum selections
                <input
                  type="number"
                  min="0"
                  value={modifierDraft.min_select}
                  onChange={(event) => setModifierDraft((current) => ({ ...current, min_select: Number(event.target.value) }))}
                  name="min_select"
                />
              </label>
              <label>
                Maximum selections
                <input
                  type="number"
                  min="1"
                  value={modifierDraft.max_select}
                  onChange={(event) => setModifierDraft((current) => ({ ...current, max_select: Number(event.target.value) }))}
                  name="max_select"
                />
              </label>
            </div>

            <div className="modifier-options-list">
              <div className="modifier-option-header">
                <b>Opties</b>
                <button type="button" className="secondary-command" onClick={addModifierOption}>
                  <Plus size={14} /> Add option
                </button>
              </div>

              {modifierDraft.options.map((option, index) => (
                <div key={`${option.id || 'new'}-${index}`} className="modifier-option-row">
                  <input
                    type="text"
                    placeholder="Option name"
                    value={option.name}
                    onChange={(event) => updateModifierOption(index, 'name', event.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Extra price (€)"
                    value={option.extra_price}
                    onChange={(event) => updateModifierOption(index, 'extra_price', Number(event.target.value))}
                  />
                  {modifierDraft.options.length > 1 && (
                    <button type="button" className="icon-command danger-command" onClick={() => removeModifierOption(index)} aria-label="Remove option">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="menu-editor-footer">
              <button
                type="button"
                className="secondary-command"
                onClick={() => setModifierDraft({ id: '', name: '', required: false, min_select: 0, max_select: 1, options: [{ id: '', name: '', extra_price: 0 }] })}
              >
                Reset
              </button>
              <button type="submit" className="primary-command">
                {modifierDraft.id ? 'Save group' : 'Create group'}
              </button>
            </div>
          </form>

          <div className="modifier-groups-list">
            {modifierGroups.length ? (
              modifierGroups.map((group) => (
                <div key={group.id} className="modifier-group-card">
                  <div className="modifier-group-header">
                    <div>
                      <strong>{group.name}</strong>
                      <small>{group.required ? 'Required' : 'Optional'} · {group.min_select} - {group.max_select}</small>
                    </div>
                    <div className="menu-row-actions">
                      <button
                        type="button"
                        className="icon-command"
                        onClick={() => setModifierDraft({
                          id: group.id,
                          name: group.name,
                          required: group.required,
                          min_select: group.min_select,
                          max_select: group.max_select,
                          options: group.options.map((option) => ({ id: option.id, name: option.name, extra_price: Number(option.extra_price) })),
                        })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="icon-command danger-command" onClick={() => void removeGroup(group)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="modifier-chip-row">
                    {group.options.map((option) => (
                      <span key={option.id} className="modifier-chip">
                        {option.name} {option.extra_price > 0 ? `(+€${Number(option.extra_price).toFixed(2)})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Layers3 size={20} />
                <span>No modifier groups have been created yet.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'delivery' && (
        <section className="panel settings-section">
          <div className="settings-section-heading">
            <span className="setting-icon"><MapPinned size={17} /></span>
            <div>
              <h2>Delivery zones</h2>
              <p>Manage postcodes, fees, and minimum order values.</p>
            </div>
          </div>

          <form key={editingZone?.id ?? 'new-zone'} className="delivery-zone-form" onSubmit={(event) => void saveZone(event)}>
            {editingZone && <input type="hidden" name="id" value={editingZone.id} />}
            <label>
              Zone name
              <input name="name" required maxLength={120} placeholder="For example, Central" defaultValue={editingZone?.name ?? ''} />
            </label>
            <label>
              Postcodes
              <textarea name="postcodes" rows={3} required placeholder="1000, 1001, 1002" defaultValue={editingZone?.postcodes.join(', ') ?? ''} />
            </label>
            <div className="menu-number-fields">
              <label>
                Delivery fee (€)
                <input type="number" min="0" step="0.01" name="fee" required defaultValue={editingZone?.fee ?? 0} />
              </label>
              <label>
                Minimum order (€)
                <input type="number" min="0" step="0.01" name="minimum_order" required defaultValue={editingZone?.minimum_order ?? 0} />
              </label>
              <label>
                Status
                <select name="active" defaultValue={String(editingZone?.active ?? true)}>
                  <option value="true">Active</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
            </div>
            <div className="menu-editor-footer">
              {editingZone && (
                <button type="button" className="secondary-command" onClick={() => setEditingZone(null)}>Cancel</button>
              )}
              <button type="submit" className="primary-command">{editingZone ? 'Save changes' : 'Save zone'}</button>
            </div>
          </form>

          <div className="delivery-zones-list">
            {deliveryZones.length ? (
              deliveryZones.map((zone) => (
                <div key={zone.id} className="modifier-group-card">
                  <div className="modifier-group-header">
                    <div>
                      <strong>{zone.name}</strong>
                      <small>{zone.postcodes.join(', ')}</small>
                    </div>
                    <div className="menu-row-actions">
                      <button type="button" className={`promo-toggle${zone.active ? ' is-on' : ''}`} aria-pressed={zone.active} onClick={() => void toggleZone(zone)}>
                        {zone.active ? 'Active' : 'Off'}
                      </button>
                      <button type="button" className="icon-command" title={`Edit ${zone.name}`} aria-label={`Edit ${zone.name}`} onClick={() => setEditingZone(zone)}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="icon-command danger-command" onClick={() => void removeZone(zone)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="modifier-chip-row">
                    <span className="modifier-chip">€{Number(zone.fee).toFixed(2)}</span>
                    <span className="modifier-chip">Min. €{Number(zone.minimum_order).toFixed(2)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <MapPinned size={20} />
                <span>No delivery zones have been set up.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {editing && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <aside className="order-drawer menu-editor" role="dialog" aria-modal="true" aria-labelledby="menu-editor-title">
            <div className="drawer-heading">
              <div>
                <p className="eyebrow">MENU</p>
                <h2 id="menu-editor-title">{editing === 'new' ? 'New item' : 'Edit item'}</h2>
              </div>
              <button type="button" className="drawer-close" title="Close window" aria-label="Close window" onClick={() => setEditing(null)}>
                <X size={18} />
              </button>
            </div>

            <form className="menu-editor-form" onSubmit={(event) => void save(event)}>
              {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
              <label>
                Name
                <input name="name" required maxLength={120} defaultValue={editing === 'new' ? '' : editing.name} autoFocus />
              </label>
              <label>
                Description
                <textarea name="description" rows={3} maxLength={500} defaultValue={editing === 'new' ? '' : editing.description} />
              </label>
              <label>
                Category
                <input name="category" list="menu-categories" required maxLength={80} defaultValue={editing === 'new' ? '' : editing.category} />
                <datalist id="menu-categories">
                  {categories.map((category) => <option value={category} key={category} />)}
                </datalist>
              </label>
              <div className="menu-number-fields">
                <label>
                  Price (EUR)
                  <input name="price" type="number" min="0" step="0.01" required defaultValue={editing === 'new' ? '' : editing.price} />
                </label>
                <label>
                  Preparation (min)
                  <input name="prep_minutes" type="number" min="0" step="1" required defaultValue={editing === 'new' ? '' : editing.prep_minutes} />
                </label>
              </div>

              <div className="modifier-attach-box">
                <label>Attached modifier groups</label>
                <div className="modifier-check-list">
                  {modifierGroups.map((group) => {
                    const checked = editing !== 'new' && group.item_ids.includes(editing.id);
                    return (
                      <label key={group.id} className="modifier-check-item">
                        <input type="checkbox" name="attached_group_ids" value={group.id} defaultChecked={checked} />
                        <span>{group.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="menu-editor-footer">
                <button type="button" className="secondary-command" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-command" disabled={saving}>
                  {saving ? 'Saving…' : 'Save item'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
