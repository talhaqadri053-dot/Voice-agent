import { OrdersLiveTable } from '@/components/orders-live-table';
import { createClient } from '@/lib/supabase/server';

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
  const callIds = Array.from(new Set((data ?? []).map((order) => order.call_id).filter((id): id is string => Boolean(id))));
  const { data: calls } = callIds.length
    ? await supabase.from('calls').select('id, sms_status').in('id', callIds)
    : { data: [] as { id: string; sms_status: string }[] };
  const smsStatuses = Object.fromEntries((calls ?? []).map((call) => [call.id, call.sms_status]));
  return <OrdersLiveTable initialOrders={data ?? []} initialSmsStatuses={smsStatuses} />;
}