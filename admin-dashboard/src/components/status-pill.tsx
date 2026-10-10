const statusLabels: Record<string, string> = {
  pending: 'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  sent: 'Sent',
  failed: 'Failed',
  not_sent: 'Not sent',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status] ?? status}</span>;
}