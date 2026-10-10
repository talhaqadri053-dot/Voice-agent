import Link from 'next/link';
import { ArrowLeft, Clock3, Headphones, Timer } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { ResendSmsButton } from '@/components/resend-sms-button';
import { StatusPill } from '@/components/status-pill';
import { dateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

type TranscriptMessage = { role: 'assistant' | 'user' | 'unknown'; text: string };
type TurnMetric = { turn: number; stt_ms: number | null; llm_ms: number | null; tts_ms: number | null; total_ms: number | null };

function asRecord(value: Json): Record<string, Json | undefined> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function parseTranscript(messages: Json, transcript: string): TranscriptMessage[] {
  if (Array.isArray(messages)) {
    const parsed = messages.flatMap((value) => {
      const record = asRecord(value);
      if (!record) return [];
      const rawRole = String(record.role ?? record.speaker ?? '').toLowerCase();
      const role = ['assistant', 'ai', 'bot', 'agent'].includes(rawRole)
        ? 'assistant'
        : ['user', 'customer', 'caller'].includes(rawRole) ? 'user' : 'unknown';
      const text = String(record.text ?? record.message ?? record.content ?? '').trim();
      return text ? [{ role, text } as TranscriptMessage] : [];
    });
    if (parsed.length) return parsed;
  }

  const parsed = transcript.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(assistant|ai host|ai|bot|agent|customer|caller|user)\s*:\s*(.*)$/i);
    if (!match?.[2]) return [];
    const role = /^(assistant|ai host|ai|bot|agent)$/i.test(match[1]) ? 'assistant' : 'user';
    return [{ role, text: match[2].trim() } as TranscriptMessage];
  });
  return parsed.length ? parsed : transcript.trim() ? [{ role: 'unknown', text: transcript.trim() }] : [];
}

function parseTurnMetrics(value: Json): TurnMetric[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const metric = (key: string) => {
      const raw = record[key];
      const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    return [{
      turn: metric('turn') ?? index + 1,
      stt_ms: metric('stt_ms'),
      llm_ms: metric('llm_ms'),
      tts_ms: metric('tts_ms'),
      total_ms: metric('total_ms'),
    }];
  });
}

function latency(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('en-GB')} ms`;
}

function recordingObjectPath(value: string) {
  try {
    const url = new URL(value);
    const marker = '/call-recordings/';
    const markerIndex = url.pathname.indexOf(marker);
    return markerIndex >= 0 ? decodeURIComponent(url.pathname.slice(markerIndex + marker.length)) : null;
  } catch {
    return value.replace(/^\/?call-recordings\//, '').replace(/^\//, '') || null;
  }
}

export default async function CallDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: call, error } = await supabase.from('calls').select('*').eq('id', params.id).maybeSingle();
  if (!call && !error) notFound();

  if (error || !call) {
    return <div className="load-error">Call details could not be loaded. Check that the calls migration has been applied.</div>;
  }

  const transcriptMessages = parseTranscript(call.transcript_messages, call.transcript);
  const turnMetrics = parseTurnMetrics(call.turn_metrics);
  const recordingPath = call.recording_url ? recordingObjectPath(call.recording_url) : null;
  const { data: signedRecording } = recordingPath
    ? await supabase.storage.from('call-recordings').createSignedUrl(recordingPath, 3600)
    : { data: null };
  const duration = call.duration_seconds === null
    ? '—'
    : `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}`;

  return (
    <>
      <Link className="call-detail-back" href="/dashboard/calls"><ArrowLeft size={14} /> All calls</Link>
      <PageHeading
        eyebrow="VOICE / CALL"
        title={call.phone ?? 'Unknown number'}
        description={`${dateTime(call.created_at)} · ${call.vapi_call_id ?? call.id}`}
        action={<div className="call-detail-status"><StatusPill status={call.sms_status} /><ResendSmsButton callId={call.id} /></div>}
      />

      {call.summary && <div className="call-detail-summary">{call.summary}</div>}

      <div className="call-detail-grid">
        <section className="panel call-detail-panel">
          <h2><Headphones size={15} /> Recording</h2>
          {signedRecording?.signedUrl ? (
            <audio className="call-recording" controls preload="metadata" src={signedRecording.signedUrl}>Your browser does not support audio playback.</audio>
          ) : (
            <p className="call-recording-empty">No recording is available for this call.</p>
          )}
        </section>
        <section className="panel call-detail-panel">
          <h2><Clock3 size={15} /> Call details</h2>
          <dl className="call-facts">
            <div><dt>Duration</dt><dd>{duration}</dd></div>
            <div><dt>SMS status</dt><dd><StatusPill status={call.sms_status} /></dd></div>
            <div><dt>Started</dt><dd>{dateTime(call.created_at)}</dd></div>
            <div><dt>Call ID</dt><dd>{call.vapi_call_id ?? call.id}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel call-detail-panel">
        <h2>Transcript</h2>
        {transcriptMessages.length ? (
          <div className="call-transcript">
            {transcriptMessages.map((message, index) => (
              <article className={`call-message${message.role === 'user' ? ' call-message-customer' : ''}`} key={`${index}-${message.text.slice(0, 24)}`}>
                <span className="call-message-label">{message.role === 'assistant' ? 'AI host' : message.role === 'user' ? 'Customer' : 'Transcript'}</span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        ) : <p className="call-recording-empty">No transcript available.</p>}
      </section>

      <section className="panel call-detail-panel" style={{ marginTop: 14 }}>
        <h2><Timer size={15} /> Latency per turn</h2>
        {turnMetrics.length ? (
          <div className="table-scroll">
            <table className="call-latency-table">
              <thead><tr><th>Turn</th><th>STT</th><th>LLM</th><th>TTS</th><th>Total</th></tr></thead>
              <tbody>{turnMetrics.map((turn) => {
                  const total = turn.total_ms ?? (turn.stt_ms !== null && turn.llm_ms !== null && turn.tts_ms !== null ? turn.stt_ms + turn.llm_ms + turn.tts_ms : null);
                  return <tr key={turn.turn}>
                    <td>{turn.turn}</td>
                    <td className={turn.stt_ms !== null && turn.stt_ms > 1500 ? 'call-latency-alert' : ''}>{latency(turn.stt_ms)}</td>
                    <td className={turn.llm_ms !== null && turn.llm_ms > 1500 ? 'call-latency-alert' : ''}>{latency(turn.llm_ms)}</td>
                    <td className={turn.tts_ms !== null && turn.tts_ms > 1500 ? 'call-latency-alert' : ''}>{latency(turn.tts_ms)}</td>
                    <td className={total !== null && total > 1500 ? 'call-latency-alert' : ''}>{latency(total)}</td>
                  </tr>;
                })}</tbody>
            </table>
          </div>
        ) : <p className="call-recording-empty">No per-turn latency data is available in this call report.</p>}
      </section>
    </>
  );
}