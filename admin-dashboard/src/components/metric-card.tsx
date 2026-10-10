import type { LucideIcon } from 'lucide-react';

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'green',
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: 'green' | 'coral' | 'blue' | 'lime';
}) {
  return (
    <section className="metric-card">
      <div className="metric-topline"><span>{label}</span><span className={`metric-icon tone-${tone}`}><Icon size={17} /></span></div>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}