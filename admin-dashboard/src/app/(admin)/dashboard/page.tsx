import Link from 'next/link';
import { ArrowRight, CalendarCheck2, CircleDollarSign, Clock3, Headphones, ShoppingBag, Utensils } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { PageHeading } from '@/components/page-heading';
import { StatusPill } from '@/components/status-pill';
import { AMSTERDAM_TIME_ZONE, dateKeyInTimeZone, dateTime, euro, shortId, startOfDayInTimeZone } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const localDate = dateKeyInTimeZone(now);
  const todayCalendarDate = new Date(`${localDate}T00:00:00.000Z`);
  const weekStartCalendarDate = new Date(todayCalendarDate.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekStartDateKey = weekStartCalendarDate.toISOString().slice(0, 10);
  const todayStart = startOfDayInTimeZone(now).toISOString();
  const weekStart = startOfDayInTimeZone(new Date(`${weekStartDateKey}T12:00:00.000Z`)).toISOString();
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: AMSTERDAM_TIME_ZONE }).format(now);

  const [ordersResult, bookingsResult, callsResult, menuResult, recentResult, revenueResult, weekRevenueResult, businessResult, recentCallResult] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('date', localDate).neq('status', 'cancelled'),
    supabase.from('calls').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('menu_items').select('*', { count: 'exact', head: true }).eq('available', true),
    supabase.from('orders').select('id, customer_phone, order_type, total, status, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('orders').select('total').gte('created_at', todayStart).neq('status', 'cancelled'),
    supabase.from('orders').select('total, created_at').gte('created_at', weekStart).neq('status', 'cancelled'),
    supabase.from('settings').select('value').eq('key', 'business_name').maybeSingle(),
    supabase.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const businessName = typeof businessResult.data?.value === 'string' && businessResult.data.value.trim()
    ? businessResult.data.value.trim()
    : 'Restaurant';
  const assistantActive = (recentCallResult.count ?? 0) > 0;
  const revenue = (revenueResult.data ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const recentOrders = recentResult.data ?? [];
  const weekTotals = new Map<string, number>();
  for (const order of weekRevenueResult.data ?? []) {
    const key = dateKeyInTimeZone(new Date(order.created_at));
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + Number(order.total ?? 0));
  }
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStartCalendarDate.getTime() + index * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    const label = index === 6 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(day);
    return { key, label, amount: weekTotals.get(key) ?? 0 };
  });
  const maxDailyRevenue = Math.max(1, ...chartDays.map((day) => day.amount));

  return (
    <>
      <PageHeading eyebrow={`${weekday.toUpperCase()} · OPERATIONS`} title="Today's overview" description={`Today's activity at ${businessName}.`} action={<span className="date-stamp"><Clock3 size={15} /> {new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: AMSTERDAM_TIME_ZONE }).format(now)}</span>} />

      <div className="metrics-grid">
        <MetricCard label="Orders today" value={ordersResult.count ?? 0} note="All channels" icon={ShoppingBag} tone="green" />
        <MetricCard label="Reservations" value={bookingsResult.count ?? 0} note="For today" icon={CalendarCheck2} tone="coral" />
        <MetricCard label="Revenue today" value={euro(revenue)} note="Excluding cancelled" icon={CircleDollarSign} tone="blue" />
        <MetricCard label="Calls today" value={callsResult.count ?? 0} note="Handled today" icon={Headphones} tone="lime" />
      </div>

      <section className="panel revenue-chart-panel">
        <div className="panel-heading"><div><p className="eyebrow">REVENUE / 7 DAYS</p><h2>Daily revenue</h2></div><span className="chart-period">Last 7 days</span></div>
        <div className="revenue-chart" role="img" aria-label="Revenue for each of the last seven days">
          {chartDays.map((day) => <div className="chart-column" key={day.key} title={`${day.label}: ${euro(day.amount)}`}><div className="chart-bar-track"><div className={`chart-bar${day.amount === 0 ? ' chart-bar-empty' : ''}`} style={{ height: `${day.amount === 0 ? 3 : Math.max(8, day.amount / maxDailyRevenue * 100)}%` }} /></div><b>{day.label}</b><small>{euro(day.amount)}</small></div>)}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading"><div><p className="eyebrow">LIVE OVERVIEW</p><h2>Recent orders</h2></div><Link className="text-link" href="/dashboard/orders">All orders <ArrowRight size={15} /></Link></div>
          {recentOrders.length ? (
            <div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Status</th><th className="align-right">Total</th></tr></thead>
              <tbody>{recentOrders.map((order) => <tr key={order.id}><td><span className="table-primary">#{shortId(order.id)}</span><small>{dateTime(order.created_at)}</small></td><td>{order.customer_phone}</td><td>{order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}</td><td><StatusPill status={order.status} /></td><td className="align-right table-primary">{euro(order.total)}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="empty-state"><ShoppingBag size={20} /><span>No orders yet today.</span></div>}
        </section>

        <aside className="side-stack">
          <section className="service-panel">
            <div className="service-panel-top"><span className="service-icon"><AudioLinesIcon /></span><span className={assistantActive ? 'service-live' : 'service-live service-inactive'} style={assistantActive ? undefined : { color: '#d2aa83' }}><i style={assistantActive ? undefined : { backgroundColor: '#d2aa83', boxShadow: '0 0 0 3px #d2aa8322' }} /> {assistantActive ? 'ACTIVE · VAPI' : 'NO RECENT CALLS · VAPI'}</span></div>
            <p className="eyebrow">VOICE SERVICE</p><h2>Voice assistant</h2>
            <p>{assistantActive ? 'A call was received in the last 24 hours.' : 'No calls were received in the last 24 hours.'}</p>
            <div className="service-foot"><span>Available menu items</span><b><Utensils size={14} /> {menuResult.count ?? 0}</b></div>
          </section>
          <section className="quick-panel"><p className="eyebrow">QUICK LINKS</p><Link href="/dashboard/menu"><Utensils size={16} /> Manage menu <ArrowRight size={15} /></Link><Link href="/dashboard/settings"><CircleDollarSign size={16} /> Business settings <ArrowRight size={15} /></Link></section>
        </aside>
      </div>
    </>
  );
}

function AudioLinesIcon() {
  return <Headphones size={20} strokeWidth={1.8} />;
}