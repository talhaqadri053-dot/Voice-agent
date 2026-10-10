import type { Database } from '@/lib/database.types';

export type Promotion = Database['public']['Tables']['promotions']['Row'];
export type PromotionStatus = 'scheduled' | 'active' | 'expired';

export const promotionWeekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
] as const;

export function getPromotionStatus(promotion: Promotion, now: Date): PromotionStatus {
  const start = new Date(promotion.starts_at).getTime();
  const end = new Date(promotion.ends_at).getTime();
  const current = now.getTime();
  if (current >= end) return 'expired';
  if (current < start || !promotion.is_active) return 'scheduled';

  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).format(now);
  const weekdayNumbers: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return promotion.days_of_week.includes(weekdayNumbers[weekday] ?? 0) ? 'active' : 'scheduled';
}

export function formatPromotionValue(promotion: Pick<Promotion, 'promo_type' | 'discount_value' | 'free_item'>) {
  if (promotion.promo_type === 'percentage') return `${Number(promotion.discount_value).toLocaleString('en-GB')}% off`;
  if (promotion.promo_type === 'flat_amount') return `${new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(Number(promotion.discount_value))} off`;
  return `Free ${promotion.free_item}`;
}