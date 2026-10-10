import { BookingsLiveTable } from '@/components/bookings-live-table';
import { createClient } from '@/lib/supabase/server';

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('bookings').select('*').order('date', { ascending: false }).order('time', { ascending: true }).limit(100);
  return <BookingsLiveTable initialBookings={data ?? []} />;
}