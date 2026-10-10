'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  ChefHat,
  CircleDot,
  Clock3,
  MapPin,
  PackageCheck,
  Phone,
  Receipt,
  Truck,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react';
import { updateOrderStatus } from '@/app/(admin)/actions';
import { PageHeading } from '@/components/page-heading';
import { StatusPill } from '@/components/status-pill';
import { dateTime, euro, shortId } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import type { Database, OrderStatus } from '@/lib/database.types';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];
type OrderFilter = 'all' | 'new' | 'processing' | 'completed' | 'cancelled';

const filters: { value: OrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const filterStatuses: Record<Exclude<OrderFilter, 'all'>, OrderStatus[]> = {
  new: ['pending'],
  processing: ['confirmed', 'preparing', 'ready'],
  completed: ['completed', 'delivered'],
  cancelled: ['cancelled'],
};

const actions: { status: OrderStatus; label: string; icon: typeof CircleDot; className: string }[] = [
  { status: 'pending', label: 'New', icon: CircleDot, className: 'order-action-new' },
  { status: 'preparing', label: 'Prepare', icon: ChefHat, className: 'order-action-preparing' },
  { status: 'ready', label: 'Ready', icon: PackageCheck, className: 'order-action-ready' },
  { status: 'delivered', label: 'Delivered', icon: Truck, className: 'order-action-delivered' },
  { status: 'completed', label: 'Complete', icon: PackageCheck, className: 'order-action-ready' },
  { status: 'cancelled', label: 'Cancel', icon: XCircle, className: 'order-action-cancelled' },
];

export function OrdersLiveTable({ initialOrders, initialSmsStatuses }: { initialOrders: Order[]; initialSmsStatuses: Record<string, string> }) {
  const [orders, setOrders] = useState(initialOrders);
  const [smsStatuses, setSmsStatuses] = useState(initialSmsStatuses);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [toast, setToast] = useState<Order | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const knownIds = useRef(new Set(initialOrders.map((order) => order.id)));
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem('orders-sound-enabled');
    const enabled = storedPreference !== 'false';
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const removedId = String(payload.old.id ?? '');
          knownIds.current.delete(removedId);
          setOrders((current) => current.filter((order) => order.id !== removedId));
          return;
        }

        const incoming = payload.new as Order;
        if (!incoming?.id) return;

        if (payload.eventType === 'INSERT') {
          const isNew = !knownIds.current.has(incoming.id);
          knownIds.current.add(incoming.id);
          setOrders((current) => [incoming, ...current.filter((order) => order.id !== incoming.id)].slice(0, 100));
          if (isNew) {
            setToast(incoming);
            if (soundEnabledRef.current) playOrderAlert();
            window.setTimeout(() => setToast((current) => current?.id === incoming.id ? null : current), 7000);
          }
          return;
        }

        setOrders((current) => current.map((order) => order.id === incoming.id ? incoming : order));
      })
      .subscribe((status) => {
        setConnection(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-call-sms-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setSmsStatuses((current) => {
            const next = { ...current };
            delete next[String(payload.old.id ?? '')];
            return next;
          });
          return;
        }
        const call = payload.new as { id?: string; sms_status?: string };
        if (call.id && call.sms_status) setSmsStatuses((current) => ({ ...current, [call.id as string]: call.sms_status as string }));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const visibleOrders = useMemo(
    () => filter === 'all' ? orders : orders.filter((order) => filterStatuses[filter].includes(order.status)),
    [filter, orders],
  );
  const activeOrder = orders.find((order) => order.id === activeOrderId) ?? null;

  async function openOrder(order: Order) {
    setActiveOrderId(order.id);
    setOrderItems([]);
    setItemsLoading(true);
    const { data, error } = await createClient()
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });
    if (!error) setOrderItems(data ?? []);
    setItemsLoading(false);
  }

  function toggleSound() {
    const enabled = !soundEnabled;
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
    window.localStorage.setItem('orders-sound-enabled', String(enabled));
    if (enabled) playOrderAlert();
  }

  function getFilterCount(value: OrderFilter) {
    if (value === 'all') return orders.length;
    return orders.filter((order) => filterStatuses[value].includes(order.status)).length;
  }

  return (
    <>
      <PageHeading
        eyebrow="VERKOOP / 01"
        title="Orders"
        description="Track orders live and update kitchen status."
        action={<span className="count-stamp"><PackageCheck size={16} /> {orders.length} recent orders</span>}
      />

      <section className="panel data-panel orders-live-panel">
        <div className="orders-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Filter orders by status">
            {filters.map((item) => (
              <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={`filter-tab${filter === item.value ? ' active' : ''}`} onClick={() => setFilter(item.value)}>
                {item.label}<span>{getFilterCount(item.value)}</span>
              </button>
            ))}
          </div>
          <div className="orders-toolbar-right">
            <span className={`realtime-indicator realtime-${connection}`}><i />{connection === 'live' ? 'Live' : connection === 'offline' ? 'Offline' : 'Connecting'}</span>
            <button className={`sound-toggle${soundEnabled ? ' sound-on' : ''}`} type="button" onClick={toggleSound} title={soundEnabled ? 'Turn order sound off' : 'Turn order sound on'} aria-label={soundEnabled ? 'Turn order sound off' : 'Turn order sound on'}>
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Sound {soundEnabled ? 'on' : 'off'}</span>
            </button>
          </div>
        </div>

        {visibleOrders.length ? (
          <div className="table-scroll"><table className="orders-table"><thead><tr><th>Order</th><th>Customer</th><th>Type / destination</th><th>ETA</th><th>Status</th><th>SMS</th><th className="align-right">Total</th><th>Update status</th></tr></thead>
            <tbody>{visibleOrders.map((order) => (
              <tr key={order.id}>
                <td><button type="button" className="order-open-button" onClick={() => void openOrder(order)}><span className="table-primary">#{shortId(order.id)}</span><small>{dateTime(order.created_at)}</small></button></td>
                <td><span className="table-primary">{order.customer_phone}</span></td>
                <td><span>{order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}</span>{order.delivery_address && <small>{order.delivery_address}</small>}</td>
                <td>{order.eta_minutes ? `${order.eta_minutes} min` : '—'}</td>
                <td><StatusPill status={order.status} /></td>
                <td><StatusPill status={order.call_id ? smsStatuses[order.call_id] ?? 'not_sent' : 'not_sent'} /></td>
                <td className="align-right"><span className="table-primary">{euro(order.total)}</span><small>incl. {euro(order.delivery_fee)} delivery</small></td>
                <td><div className="order-action-group">{actions.map(({ status, label, icon: Icon, className }) => (
                  <form action={updateOrderStatus} key={status}>
                    <input type="hidden" name="id" value={order.id} />
                    <button className={`order-action ${className}`} type="submit" name="status" value={status} disabled={order.status === status} title={`${label} zetten`} aria-label={`${label} zetten`}>
                      <Icon size={14} /><span>{label}</span>
                    </button>
                  </form>
                ))}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty-state"><PackageCheck size={20} /><span>{orders.length ? 'No orders with this status.' : 'No orders have been recorded yet.'}</span></div>}
      </section>

      {toast && <div className="order-toast" role="status" aria-live="polite"><span className="toast-icon"><BellRing size={18} /></span><span className="toast-copy"><b>New order</b><small>#{shortId(toast.id)} · {euro(toast.total)}</small></span><button type="button" title="Dismiss notification" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}

      {activeOrder && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveOrderId(null); }}>
          <aside className="order-drawer" role="dialog" aria-modal="true" aria-labelledby="order-drawer-title">
            <div className="drawer-heading"><div><p className="eyebrow">ORDER DETAILS</p><h2 id="order-drawer-title">#{shortId(activeOrder.id)}</h2></div><button type="button" className="drawer-close" title="Close details" aria-label="Close details" onClick={() => setActiveOrderId(null)}><X size={18} /></button></div>
            <div className="drawer-status-row"><StatusPill status={activeOrder.status} /><span>{dateTime(activeOrder.created_at)}</span></div>
            <div className="drawer-facts"><div><Phone size={15} /><span><small>Customer</small><b>{activeOrder.customer_phone}</b></span></div><div><Truck size={15} /><span><small>Type</small><b>{activeOrder.order_type === 'delivery' ? 'Delivery' : 'Pickup'}</b></span></div><div><Clock3 size={15} /><span><small>Estimated time</small><b>{activeOrder.eta_minutes ? `${activeOrder.eta_minutes} minutes` : 'Not available'}</b></span></div>{activeOrder.delivery_address && <div><MapPin size={15} /><span><small>Delivery address</small><b>{activeOrder.delivery_address}</b></span></div>}</div>
            <div className="drawer-section-title"><Receipt size={16} /><h3>Items</h3></div>
            {itemsLoading ? <div className="drawer-loading">Loading items…</div> : orderItems.length ? <div className="drawer-items">{orderItems.map((item) => <div className="drawer-item" key={item.id}><span><b>{item.quantity}×</b> {item.item_name}{item.notes && <small>{item.notes}</small>}</span><strong>{euro(item.unit_price * item.quantity)}</strong></div>)}</div> : <div className="drawer-loading">No order items found.</div>}
            <div className="drawer-totals"><div><span>Subtotal</span><b>{euro(activeOrder.subtotal)}</b></div><div><span>Discount</span><b>−{euro(activeOrder.discount_amount)}</b></div><div><span>Delivery fee</span><b>{euro(activeOrder.delivery_fee)}</b></div><div className="drawer-grand-total"><span>Total</span><b>{euro(activeOrder.total)}</b></div></div>
            <div className="drawer-section-title drawer-status-title"><h3>Update status</h3></div>
            <div className="drawer-action-list">{actions.map(({ status, label, icon: Icon, className }) => <form action={updateOrderStatus} key={status}><input type="hidden" name="id" value={activeOrder.id} /><button type="submit" name="status" value={status} className={`order-action ${className}`} disabled={activeOrder.status === status}><Icon size={15} />{label}</button></form>)}</div>
          </aside>
        </div>
      )}
    </>
  );
}

function playOrderAlert() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [880, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.16;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    });
    window.setTimeout(() => void context.close(), 700);
  } catch {
    // Browser audio can be unavailable; the visual toast still announces the order.
  }
}