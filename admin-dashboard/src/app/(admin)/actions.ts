'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { BookingStatus, Json, OrderStatus } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return supabase;
}

export async function updateOrderStatus(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as OrderStatus;
  const allowed: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled'];
  if (!id || !allowed.includes(status)) throw new Error('Invalid order status.');

  const supabase = await authenticatedClient();
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw new Error('Could not update order status.');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard');
}

export async function updateBookingStatus(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as BookingStatus;
  const allowed: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  if (!id || !allowed.includes(status)) throw new Error('Invalid reservation status.');

  const supabase = await authenticatedClient();
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
  if (error) throw new Error('Could not update reservation status.');
  revalidatePath('/dashboard/bookings');
  revalidatePath('/dashboard');
}

export async function setMenuAvailability(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const available = String(formData.get('available')) === 'true';
  if (!id) throw new Error('Menu item is missing.');

  const supabase = await authenticatedClient();
  const { error } = await supabase.from('menu_items').update({ available }).eq('id', id);
  if (error) throw new Error('Could not update availability.');
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard');
}

export async function saveMenuItem(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const price = Number(formData.get('price'));
  const prepMinutes = Number(formData.get('prep_minutes'));

  if (!name || !category || !Number.isFinite(price) || price < 0 || !Number.isInteger(prepMinutes) || prepMinutes < 0) {
    return { ok: false, message: 'Enter a name, category, valid price, and preparation time.' };
  }

  const supabase = await authenticatedClient();
  const values = { name, description, category, price, prep_minutes: prepMinutes };
  if (id) {
    const { error } = await supabase.from('menu_items').update(values).eq('id', id);
    if (error) return { ok: false, message: `Could not save menu item: ${error.message}` };
  } else {
    const newId = randomUUID();
    const { error } = await supabase.from('menu_items').insert({ id: newId, ...values });
    if (error) return { ok: false, message: `Could not save menu item: ${error.message}` };
    revalidatePath('/dashboard/menu');
    revalidatePath('/dashboard');
    return { ok: true, id: newId, message: 'Menu item saved.' };
  }

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard');
  return { ok: true, id, message: 'Menu item saved.' };
}

export async function deleteMenuItem(id: string) {
  if (!id) return { ok: false, message: 'Menu item is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) return { ok: false, message: 'Could not delete menu item.' };
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Menu item deleted.' };
}

export async function importMenuItems(formData: FormData) {
  const rawRows = String(formData.get('rows') ?? '[]');
  let rows: unknown[];

  try {
    rows = JSON.parse(rawRows);
  } catch {
    return { ok: false, message: 'Could not parse the bulk import.' };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, message: 'No valid product rows were found for import.' };
  }

  const supabase = await authenticatedClient();
  const normalized: Array<{ name: string; description: string; price: number; category: string; available: boolean; prep_minutes: number }> = [];
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((row, index) => {
    const record = row as Record<string, unknown>;
    const name = String(record.name ?? record['item_name'] ?? '').trim();
    const category = String(record.category ?? '').trim();
    const description = String(record.description ?? '').trim();
    const priceValue = Number(record.price ?? record['price_eur'] ?? 0);
    const prepValue = Number(record.prep_minutes ?? record['prep minutes'] ?? record['prepMinutes'] ?? 0);
    const availableFlag = String(record.available ?? 'true').toLowerCase();

    if (!name) {
      errors.push({ row: index + 2, message: 'Name is missing.' });
      return;
    }
    if (!category) {
      errors.push({ row: index + 2, message: 'Category is missing.' });
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      errors.push({ row: index + 2, message: 'Price is invalid.' });
      return;
    }
    if (!Number.isFinite(prepValue) || prepValue < 0) {
      errors.push({ row: index + 2, message: 'Preparation time is invalid.' });
      return;
    }

    normalized.push({
      name,
      description,
      price: Number(priceValue.toFixed(2)),
      category,
      available: !(availableFlag === 'false' || availableFlag === '0' || availableFlag === 'no' || availableFlag === 'out'),
      prep_minutes: Math.round(prepValue),
    });
  });

  if (errors.length) {
    return { ok: false, message: `Import failed: ${errors.length} invalid row(s).`, errors };
  }

  const { error } = await supabase.from('menu_items').upsert(normalized, { onConflict: 'name' });
  if (error) {
    return { ok: false, message: `Import failed: ${error.message}` };
  }

  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard');
  return { ok: true, message: `${normalized.length} items imported successfully.` };
}

export async function saveModifierGroup(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const required = formData.get('required') === 'on';
  const minSelect = Number(formData.get('min_select') ?? 0);
  const maxSelect = Number(formData.get('max_select') ?? 1);
  const options = JSON.parse(String(formData.get('options') ?? '[]')) as Array<{ id?: string; name: string; extra_price: number }>;

  if (!name) return { ok: false, message: 'Enter a modifier group name.' };
  if (!Number.isFinite(minSelect) || minSelect < 0) return { ok: false, message: 'Minimum selections are invalid.' };
  if (!Number.isFinite(maxSelect) || maxSelect < 1) return { ok: false, message: 'Maximum selections are invalid.' };

  const parsedOptions = options
    .map((option) => ({ name: String(option.name ?? '').trim(), extra_price: Number(option.extra_price ?? 0) }))
    .filter((option) => option.name && Number.isFinite(option.extra_price) && option.extra_price >= 0);

  if (!parsedOptions.length) return { ok: false, message: 'Add at least one option to the group.' };

  const supabase = await authenticatedClient();
  const payload = { name, required, min_select: Math.round(minSelect), max_select: Math.round(maxSelect) };

  let groupId = id;
  if (id) {
    const { error } = await supabase.from('menu_modifier_groups').update(payload).eq('id', id);
    if (error) return { ok: false, message: 'Could not update modifier group.' };
  } else {
    const { data, error } = await supabase.from('menu_modifier_groups').insert(payload).select('id').single();
    if (error || !data) return { ok: false, message: 'Could not create modifier group.' };
    groupId = data.id;
  }

  await supabase.from('menu_modifier_options').delete().eq('group_id', groupId);
  const { error: optionError } = await supabase.from('menu_modifier_options').insert(
    parsedOptions.map((option) => ({ group_id: groupId, name: option.name, extra_price: Number(option.extra_price.toFixed(2)) })),
  );

  if (optionError) return { ok: false, message: 'Could not save modifier options.' };

  revalidatePath('/dashboard/menu');
  return { ok: true, message: 'Modifier group saved.' };
}

export async function attachModifierGroupsToItem(formData: FormData) {
  const itemId = String(formData.get('item_id') ?? '').trim();
  const selected = formData.getAll('group_ids').map((value) => String(value));

  if (!itemId) return { ok: false, message: 'No item selected.' };

  const supabase = await authenticatedClient();
  const { error: deleteError } = await supabase.from('menu_item_modifier_groups').delete().eq('menu_item_id', itemId);
  if (deleteError) return { ok: false, message: 'Could not reset attached modifiers.' };

  if (!selected.length) {
    revalidatePath('/dashboard/menu');
    return { ok: true, message: 'Modifier groups removed from this item.' };
  }

  const rows = selected.map((groupId) => ({ menu_item_id: itemId, modifier_group_id: groupId }));
  const { error } = await supabase.from('menu_item_modifier_groups').insert(rows);
  if (error) return { ok: false, message: 'Could not attach modifier groups.' };

  revalidatePath('/dashboard/menu');
  return { ok: true, message: 'Modifier groups attached.' };
}

export async function deleteModifierGroup(id: string) {
  if (!id) return { ok: false, message: 'Modifier group is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('menu_modifier_groups').delete().eq('id', id);
  if (error) return { ok: false, message: 'Could not delete modifier group.' };
  revalidatePath('/dashboard/menu');
  return { ok: true, message: 'Modifier group deleted.' };
}

export async function saveDeliveryZone(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const rawPostcodes = String(formData.get('postcodes') ?? '').trim();
  const fee = Number(formData.get('fee') ?? 0);
  const minimumOrder = Number(formData.get('minimum_order') ?? 0);
  const active = formData.get('active') !== 'false';

  if (!name) return { ok: false, message: 'Enter a zone name.' };
  if (!rawPostcodes) return { ok: false, message: 'Enter at least one postcode.' };
  if (!Number.isFinite(fee) || fee < 0) return { ok: false, message: 'Delivery fee is invalid.' };
  if (!Number.isFinite(minimumOrder) || minimumOrder < 0) return { ok: false, message: 'Minimum order is invalid.' };

  const postcodes = rawPostcodes
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/\s+/g, ''));

  if (!postcodes.length) return { ok: false, message: 'Enter valid postcodes.' };

  const supabase = await authenticatedClient();
  const payload = {
    name,
    postcodes,
    fee: Number(fee.toFixed(2)),
    minimum_order: Number(minimumOrder.toFixed(2)),
    active,
  };

  if (id) {
    const { error } = await supabase.from('delivery_zones').update(payload).eq('id', id);
    if (error) return { ok: false, message: 'Could not update zone.' };
  } else {
    const { error } = await supabase.from('delivery_zones').insert(payload);
    if (error) return { ok: false, message: 'Could not create zone.' };
  }

  revalidatePath('/dashboard/menu');
  return { ok: true, message: 'Delivery zone saved.' };
}

export async function deleteDeliveryZone(id: string) {
  if (!id) return { ok: false, message: 'Zone is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
  if (error) return { ok: false, message: 'Could not delete zone.' };
  revalidatePath('/dashboard/menu');
  return { ok: true, message: 'Zone deleted.' };
}

export async function setDeliveryZoneActive(id: string, active: boolean) {
  if (!id) return { ok: false, message: 'Zone is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('delivery_zones').update({ active }).eq('id', id);
  if (error) return { ok: false, message: 'Could not update zone status.' };
  revalidatePath('/dashboard/menu');
  return { ok: true, message: active ? 'Delivery zone enabled.' : 'Delivery zone disabled.' };
}

export async function savePromotion(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const promoType = String(formData.get('promo_type') ?? '');
  const rawValue = String(formData.get('discount_value') ?? '');
  const freeItem = String(formData.get('free_item') ?? '').trim();
  const promoCode = String(formData.get('promo_code') ?? '').trim();
  const minimumOrder = Number(formData.get('minimum_order'));
  const startsAt = new Date(String(formData.get('starts_at') ?? ''));
  const endsAt = new Date(String(formData.get('ends_at') ?? ''));
  const days = Array.from(new Set(formData.getAll('days_of_week').map(Number)));

  if (!name) return { ok: false, message: 'Enter a promotion name.' };
  if (!['percentage', 'flat_amount', 'free_item'].includes(promoType)) return { ok: false, message: 'Choose a valid promotion type.' };
  if (!Number.isFinite(minimumOrder) || minimumOrder < 0) return { ok: false, message: 'Minimum order amount is invalid.' };
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return { ok: false, message: 'Check the start and end times.' };
  }
  if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    return { ok: false, message: 'Select at least one valid weekday.' };
  }

  const discountValue = rawValue ? Number(rawValue) : null;
  if (promoType === 'percentage' && (discountValue === null || !Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100)) {
    return { ok: false, message: 'The percentage discount must be greater than 0 and no more than 100.' };
  }
  if (promoType === 'flat_amount' && (discountValue === null || !Number.isFinite(discountValue) || discountValue <= 0)) {
    return { ok: false, message: 'The discount amount must be greater than 0.' };
  }
  if (promoType === 'free_item' && !freeItem) return { ok: false, message: 'Enter the free item.' };

  const supabase = await authenticatedClient();
  const values = {
    name,
    promo_type: promoType as 'percentage' | 'flat_amount' | 'free_item',
    discount_value: promoType === 'free_item' ? null : discountValue,
    free_item: promoType === 'free_item' ? freeItem : null,
    promo_code: promoCode || null,
    minimum_order: Number(minimumOrder.toFixed(2)),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    days_of_week: days.sort((left, right) => left - right),
    is_active: formData.get('is_active') === 'on',
  };

  const result = id
    ? await supabase.from('promotions').update(values).eq('id', id)
    : await supabase.from('promotions').insert(values);
  if (result.error) return { ok: false, message: `Could not save promotion: ${result.error.message}` };

  revalidatePath('/dashboard/promotions');
  return { ok: true, message: 'Promotion saved.' };
}

export async function setPromotionActive(id: string, isActive: boolean) {
  if (!id) return { ok: false, message: 'Promotion is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('promotions').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, message: `Could not update promotion status: ${error.message}` };
  revalidatePath('/dashboard/promotions');
  return { ok: true, message: isActive ? 'Promotion enabled.' : 'Promotion paused.' };
}

export async function deletePromotion(id: string) {
  if (!id) return { ok: false, message: 'Promotion is missing.' };
  const supabase = await authenticatedClient();
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) return { ok: false, message: `Could not delete promotion: ${error.message}` };
  revalidatePath('/dashboard/promotions');
  return { ok: true, message: 'Promotion deleted.' };
}

export async function saveBusinessSettings(formData: FormData) {
  const weekdayKeys = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;
  const weekdayLabels: Record<(typeof weekdayKeys)[number], string> = {
    maandag: 'Monday', dinsdag: 'Tuesday', woensdag: 'Wednesday', donderdag: 'Thursday',
    vrijdag: 'Friday', zaterdag: 'Saturday', zondag: 'Sunday',
  };
  const openingHours: Record<string, Json> = {};
  const businessName = String(formData.get('business_name') ?? '').trim();
  if (!businessName) return { ok: false, message: 'Enter a business name.' };

  for (const day of weekdayKeys) {
    if (formData.get(`closed_${day}`) === 'on') {
      openingHours[day] = 'gesloten';
      continue;
    }
    const open = String(formData.get(`open_${day}`) ?? '');
    const close = String(formData.get(`close_${day}`) ?? '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) || close <= open) {
      return { ok: false, message: `Check the opening hours for ${weekdayLabels[day]}.` };
    }
    openingHours[day] = `${open}-${close}`;
  }

  const basePrep = Number(formData.get('base_prep_minutes'));
  const deliveryFee = Number(formData.get('delivery_fee_eur'));
  const bookingCapacity = Number(formData.get('booking_slot_capacity'));
  const smsTemplate = String(formData.get('sms_template_nl') ?? '').trim();
  if (!Number.isInteger(basePrep) || basePrep < 0 || !Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isInteger(bookingCapacity) || bookingCapacity < 1 || !smsTemplate) {
    return { ok: false, message: 'Check preparation time, delivery fee, booking capacity, and the SMS template.' };
  }

  const supabase = await authenticatedClient();
  const { error } = await supabase.from('settings').upsert([
    { key: 'business_name', value: businessName },
    { key: 'opening_hours', value: openingHours },
    { key: 'base_prep_minutes', value: basePrep },
    { key: 'delivery_fee_eur', value: deliveryFee },
    { key: 'sms_template_nl', value: smsTemplate },
    { key: 'booking_slot_capacity', value: bookingCapacity },
  ], { onConflict: 'key' });

  if (error) return { ok: false, message: 'Could not save settings.' };
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Settings saved.' };
}

export async function resendCallSms(callId: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const sender = process.env.TWILIO_FROM;
  if (!accountSid || !authToken || !sender) {
    return { ok: false, message: 'Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM server-side.' };
  }

  const supabase = await authenticatedClient();
  const { data: call, error: callError } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle();
  if (callError || !call?.phone) return { ok: false, message: 'No phone number is available for this call.' };

  let order = null;
  let booking = null;
  const { data: linkedOrder } = await supabase.from('orders').select('*').eq('call_id', call.id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle();
  order = linkedOrder;
  const { data: linkedBooking } = await supabase.from('bookings').select('*').eq('call_id', call.id).not('status', 'in', '(cancelled,no_show)').order('created_at', { ascending: false }).limit(1).maybeSingle();
  booking = linkedBooking;

  if (!order && !booking) {
    const callTime = new Date(call.created_at).getTime();
    const from = new Date(callTime - 32 * 60_000).toISOString();
    const until = new Date(callTime + 5 * 60_000).toISOString();
    const [{ data: recentOrder }, { data: recentBooking }] = await Promise.all([
      supabase.from('orders').select('*').eq('customer_phone', call.phone).neq('status', 'cancelled').gte('created_at', from).lte('created_at', until).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bookings').select('*').eq('customer_phone', call.phone).not('status', 'in', '(cancelled,no_show)').gte('created_at', from).lte('created_at', until).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    order = recentOrder;
    booking = recentBooking;
  }

  if (!order && !booking) return { ok: false, message: 'No order or reservation is linked to this call.' };

  const { data: businessSetting } = await supabase.from('settings').select('value').eq('key', 'business_name').maybeSingle();
  const business = (typeof businessSetting?.value === 'string' ? businessSetting.value : 'Restaurant').trim().slice(0, 25);
  const parts: string[] = [];
  let orderItems = '';
  if (order) {
    const { data: items } = await supabase.from('order_items').select('item_name, quantity').eq('order_id', order.id).order('created_at', { ascending: true });
    orderItems = (items ?? []).map((item) => `${item.quantity}x ${item.item_name}`).join(', ');
    parts.push(`Bestelling ${orderItems || 'ontvangen'}`);
    parts.push(`Totaal EUR ${Number(order.total).toFixed(2).replace('.', ',')}`);
    parts.push(`${order.order_type === 'delivery' ? 'Bezorgen' : 'Afhalen'} ca. ${order.eta_minutes ?? '?'} min`);
  }
  if (booking) parts.push(`Reservering ${booking.service} ${booking.date} ${booking.time.slice(0, 5)}, ${booking.people_count} pers.`);

  const fixed = [
    order ? `Totaal EUR ${Number(order.total).toFixed(2).replace('.', ',')}. ${order.order_type === 'delivery' ? 'Bezorgen' : 'Afhalen'} ca. ${order.eta_minutes ?? '?'} min.` : '',
    booking ? `Res. ${booking.date} ${booking.time.slice(0, 5)} ${booking.people_count}p.` : '',
  ].filter(Boolean).join(' ');
  const prefix = `${business}: `;
  let body = `${prefix}${parts.join('. ')}.`;
  if (body.length > 160) {
    const summary = parts[0] ?? 'Thank you for contacting us';
    const summaryRoom = Math.max(0, 160 - prefix.length - fixed.length - 2);
    body = `${prefix}${summary.slice(0, summaryRoom)}. ${fixed}`.slice(0, 160);
  }

  let smsStatus: 'sent' | 'failed' = 'failed';
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: call.phone, From: sender, Body: body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Twilio rejected the SMS.');
    smsStatus = 'sent';
  } catch {
    await supabase.from('calls').update({ sms_status: 'failed' }).eq('id', call.id);
    revalidatePath('/dashboard/calls');
    return { ok: false, message: 'Could not send SMS. Check Twilio and try again.' };
  }

  const { error: updateError } = await supabase.from('calls').update({ sms_status: smsStatus }).eq('id', call.id);
  if (updateError) return { ok: false, message: 'SMS was sent, but its status could not be updated.' };
  revalidatePath('/dashboard/calls');
  return { ok: true, message: 'SMS resent.' };
}

export async function updateSetting(formData: FormData) {
  const key = String(formData.get('key') ?? '');
  const rawValue = String(formData.get('value') ?? '');
  if (!key) throw new Error('Setting key is missing.');

  let value: Json;
  try {
    value = JSON.parse(rawValue);
  } catch {
    throw new Error('Enter valid JSON.');
  }

  const supabase = await authenticatedClient();
  const { error } = await supabase.from('settings').update({ value }).eq('key', key);
  if (error) throw new Error('Could not save setting.');
  revalidatePath('/dashboard/settings');
}