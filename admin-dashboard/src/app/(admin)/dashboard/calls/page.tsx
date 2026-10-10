import Link from 'next/link';
import { ArrowUpRight, AudioLines, PhoneCall } from 'lucide-react';
import { PageHeading } from '@/components/page-heading';
import { StatusPill } from '@/components/status-pill';
import { ResendSmsButton } from '@/components/resend-sms-button';
import { dateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export default async function CallsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('calls').select('id, vapi_call_id, phone, summary, transcript, duration_seconds, sms_status, created_at').order('created_at', { ascending: false }).limit(100);
  const calls = data ?? [];

  return (
    <>
      <PageHeading eyebrow="VOICE / 03" title="Calls" description="Call summaries, duration, and confirmation SMS status." action={<span className="count-stamp"><AudioLines size={16} /> {calls.length} calls</span>} />
      <section className="panel data-panel">
        {error ? <div className="load-error">Calls could not be loaded. Check your Supabase configuration.</div> : calls.length ? (
          <div className="table-scroll"><table><thead><tr><th>Call</th><th>Summary</th><th>Duration</th><th>SMS</th><th>Details</th><th>Action</th></tr></thead>
            <tbody>{calls.map((call) => <tr key={call.id}>
              <td><span className="table-primary">{call.phone ?? 'Unknown number'}</span><small>{dateTime(call.created_at)}</small></td>
              <td className="summary-cell">{call.summary || 'No summary available.'}</td>
              <td>{call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '—'}</td>
              <td><StatusPill status={call.sms_status} /></td>
              <td><Link className="call-detail-link" href={`/dashboard/calls/${call.id}`}>Open call <ArrowUpRight size={14} /></Link></td>
              <td><ResendSmsButton callId={call.id} /></td>
            </tr>)}</tbody>
          </table></div>
        ) : <div className="empty-state"><PhoneCall size={20} /><span>No calls have been received yet.</span></div>}
      </section>
    </>
  );
}