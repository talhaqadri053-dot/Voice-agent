'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Filter } from 'lucide-react';
import { updateBookingStatus } from '@/app/(admin)/actions';
import { PageHeading } from '@/components/page-heading';
import { StatusPill } from '@/components/status-pill';
import { shortId } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import type { BookingStatus, Database } from '@/lib/database.types';

type Booking = Database['public']['Tables']['bookings']['Row'];
type BookingFilter = 'all' | BookingStatus;

const filters: { value: BookingFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-show' },
];

const actions: { status: BookingStatus; label: string }[] = [
  { status: 'pending', label: 'New' },
  { status: 'confirmed', label: 'Confirm' },
  { status: 'completed', label: 'Complete' },
  { status: 'cancelled', label: 'Cancel' },
];

export function BookingsLiveTable({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState(initialBookings);
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-bookings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const removedId = String(payload.old.id ?? '');
          setBookings((current) => current.filter((booking) => booking.id !== removedId));
          return;
        }

        const incoming = payload.new as Booking;
        if (!incoming?.id) return;
        if (payload.eventType === 'INSERT') {
          setBookings((current) => [incoming, ...current.filter((booking) => booking.id !== incoming.id)].slice(0, 100));
        } else {
          setBookings((current) => current.map((booking) => booking.id === incoming.id ? incoming : booking));
        }
      })
      .subscribe((status) => {
        setConnection(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const visibleBookings = useMemo(
    () => filter === 'all' ? bookings : bookings.filter((booking) => booking.status === filter),
    [bookings, filter],
  );

  return (
    <>
      <PageHeading eyebrow="GUESTS / 02" title="Reservations" description="Track reservations live and update their status." action={<span className="count-stamp"><CalendarDays size={16} /> {bookings.length} reservations</span>} />
      <section className="panel data-panel bookings-live-panel">
        <div className="orders-toolbar booking-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Filter reservations by status">
            {filters.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={`filter-tab${filter === item.value ? ' active' : ''}`} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === 'all' ? bookings.length : bookings.filter((booking) => booking.status === item.value).length}</span></button>)}
          </div>
          <span className={`realtime-indicator realtime-${connection}`}><i />{connection === 'live' ? 'Live' : connection === 'offline' ? 'Offline' : 'Connecting'}</span>
        </div>

        {visibleBookings.length ? (
          <div className="table-scroll"><table className="bookings-table"><thead><tr><th>Date & time</th><th>Guest</th><th>Service</th><th>People</th><th>Status</th><th>Update status</th></tr></thead>
            <tbody>{visibleBookings.map((booking) => (
              <tr key={booking.id}>
                <td><span className="table-primary">{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/Amsterdam' }).format(new Date(`${booking.date}T12:00:00`))}</span><small>{booking.time.slice(0, 5)} · #{shortId(booking.id)}</small></td>
                <td><span className="table-primary">{booking.customer_name}</span><small>{booking.customer_phone}</small></td>
                <td>{booking.service}</td>
                <td><span className="people-count">{booking.people_count}</span> people</td>
                <td><StatusPill status={booking.status} /></td>
                <td><div className="booking-action-group">{actions.map((action) => <form action={updateBookingStatus} key={action.status}><input type="hidden" name="id" value={booking.id} /><button type="submit" name="status" value={action.status} className={`booking-action${action.status === 'cancelled' ? ' booking-action-cancel' : ''}`} disabled={booking.status === action.status}>{action.label}</button></form>)}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty-state"><Filter size={20} /><span>{bookings.length ? 'No reservations with this status.' : 'No reservations have been recorded yet.'}</span></div>}
      </section>
    </>
  );
}