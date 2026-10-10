'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react';
import Vapi from '@vapi-ai/web';
import { PageHeading } from '@/components/page-heading';

type CallStatus = 'Idle' | 'Connecting' | 'Live' | 'Ended' | 'Error';
type TranscriptItem = {
  id: number;
  role: 'assistant' | 'user' | 'tool';
  text: string;
};

const phrases = [
  ['Hallo, ik wil graag twee stroopwafels bestellen om af te halen.', 'Hello, I want to order two stroopwafels for pickup'],
  ['Mijn telefoonnummer is nul zes, een twee drie vier, vijf zes zeven acht.', 'My phone number is 06 1234 5678'],
  ['Ja, dat klopt.', 'Yes, that is correct'],
  ['Nee, laat maar.', 'No, forget it'],
  ['Wat voor aanbiedingen hebben jullie vandaag?', 'What offers do you have today?'],
  ['Ik wil graag bezorgd krijgen op Damrak 1, 1011 AB Amsterdam.', 'Delivery to Damrak 1, 1011 AB Amsterdam'],
  ['Ik wil graag een tafel reserveren voor twee personen, morgen om half acht, op naam van De Vries.', 'Table for 2, tomorrow 19:30, name De Vries'],
  ['Guten Tag, ik wil graag een bestelling plaatsen.', 'Greeting in German, then Dutch: the AI must stay Dutch'],
  ['Can we speak English please?', 'Asks for English'],
];

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  try {
    return JSON.stringify(error) || 'An unknown Vapi error occurred.';
  } catch {
    return 'An unknown Vapi error occurred.';
  }
}

function microphoneErrorMessage(errorText: string) {
  const lowered = errorText.toLowerCase();
  return lowered.includes('notallowederror') || lowered.includes('permission') || lowered.includes('microphone')
    ? 'Microphone access was denied. Allow microphone access in your browser settings, then try again.'
    : null;
}

export function TestCall() {
  const vapiRef = useRef<Vapi | null>(null);
  const nextTranscriptId = useRef(0);
  const [status, setStatus] = useState<CallStatus>('Idle');
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [outboundPending, setOutboundPending] = useState(false);
  const [outboundError, setOutboundError] = useState<string | null>(null);
  const [outboundResult, setOutboundResult] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
  const isLive = status === 'Live';

  useEffect(() => {
    if (!publicKey) return;

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    const onCallStart = () => {
      setStatus('Live');
      setError(null);
    };
    const onCallEnd = () => {
      setStatus((current) => current === 'Error' ? current : 'Ended');
      setMuted(false);
      setVolume(0);
    };
    const onVolumeLevel = (level: number) => setVolume(Math.max(0, Math.min(1, level)));
    const onMessage = (event: unknown) => {
      if (!event || typeof event !== 'object') return;
      const payload = event as {
        type?: string;
        transcriptType?: string;
        role?: string;
        transcript?: string;
        toolCallList?: Array<{ function?: { name?: string }; name?: string }>;
      };

      if (payload.type === 'transcript' && payload.transcriptType === 'final' && payload.transcript) {
        const role = payload.role === 'user' ? 'user' : 'assistant';
        setTranscript((items) => [...items, { id: nextTranscriptId.current++, role, text: payload.transcript! }]);
        return;
      }

      if (payload.type === 'tool-calls' || payload.type === 'tool-calls-update') {
        for (const tool of payload.toolCallList ?? []) {
          const name = tool.function?.name ?? tool.name;
          if (name) setTranscript((items) => [...items, { id: nextTranscriptId.current++, role: 'tool', text: name }]);
        }
      }
    };
    const onError = (callError: unknown) => {
      const errorText = getErrorText(callError);
      const friendlyMessage = microphoneErrorMessage(errorText);
      setError(friendlyMessage ? `${friendlyMessage}\n${errorText}` : errorText);
      setStatus('Error');
    };

    vapi.on('call-start', onCallStart);
    vapi.on('call-end', onCallEnd);
    vapi.on('volume-level', onVolumeLevel);
    vapi.on('message', onMessage);
    vapi.on('error', onError);

    return () => {
      vapi.removeListener('call-start', onCallStart);
      vapi.removeListener('call-end', onCallEnd);
      vapi.removeListener('volume-level', onVolumeLevel);
      vapi.removeListener('message', onMessage);
      vapi.removeListener('error', onError);
      vapiRef.current = null;
      void vapi.stop();
    };
  }, [publicKey]);

  async function startCall() {
    const vapi = vapiRef.current;
    if (!vapi || !assistantId) {
      setError('Add the Vapi public key and assistant ID to the dashboard environment to start a test call.');
      setStatus('Error');
      return;
    }

    setError(null);
    setTranscript([]);
    nextTranscriptId.current = 0;
    setStatus('Connecting');
    try {
      await vapi.start(assistantId);
    } catch (callError) {
      const errorText = getErrorText(callError);
      const friendlyMessage = microphoneErrorMessage(errorText);
      setError(friendlyMessage ? `${friendlyMessage}\n${errorText}` : errorText);
      setStatus('Error');
    }
  }

  async function endCall() {
    await vapiRef.current?.stop();
    setStatus((current) => current === 'Error' ? current : 'Ended');
  }

  function sendText(text: string) {
    const content = text.trim();
    if (!content || !vapiRef.current || !isLive) return;
    vapiRef.current.send({
      type: 'add-message',
      message: { role: 'user', content },
      triggerResponseEnabled: true,
    });
    setMessage('');
  }

  function toggleMute() {
    const nextMuted = !muted;
    vapiRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  }

  async function placePhoneCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOutboundPending(true);
    setOutboundError(null);
    setOutboundResult(null);

    try {
      const response = await fetch('/api/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'The phone call could not be started.');

      setOutboundResult(`Call started for ${result.phoneNumber}. Call ID: ${result.callId}`);
    } catch (callError) {
      setOutboundError(getErrorText(callError));
    } finally {
      setOutboundPending(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="VOICE / TEST" title="Test call" description="Call a phone or try the assistant from your browser." />
      <div className="test-call-layout">
        <section className="panel test-call-outbound" aria-label="Call a phone number">
          <div className="test-call-console-top">
            <div><span className="eyebrow">OUTBOUND PHONE</span><h2>Call your phone</h2></div>
          </div>
          <form className="test-call-outbound-form" onSubmit={placePhoneCall}>
            <label htmlFor="test-call-phone">Phone number</label>
            <div className="test-call-outbound-row">
              <input
                id="test-call-phone"
                type="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="06 1234 5678 or +31612345678"
                aria-describedby="test-call-phone-note"
                disabled={outboundPending}
                required
              />
              <button type="submit" disabled={outboundPending || !phoneNumber.trim()}>
                <PhoneCall size={18} />
                {outboundPending ? 'Calling…' : 'Call me'}
              </button>
            </div>
            <p id="test-call-phone-note">Only call numbers you own or have permission to contact.</p>
          </form>
          {outboundError && <div className="test-call-error" role="alert"><AlertCircle size={17} /><p>{outboundError}</p></div>}
          {outboundResult && <p className="test-call-outbound-success" role="status">{outboundResult}</p>}
        </section>

        <section className="panel test-call-console" aria-label="Test call controls">
          <div className="test-call-console-top">
            <div><span className="eyebrow">BROWSER SESSION</span><h2>Voice check</h2></div>
            <span className={`test-call-status status-${status.toLowerCase()}`}><i />{status}</span>
          </div>
          <div className="test-call-controls">
            <button className={`test-call-primary${isLive ? ' is-live' : ''}`} onClick={isLive ? endCall : startCall} disabled={status === 'Connecting'}>
              {isLive ? <PhoneOff size={21} /> : <Phone size={21} />}
              {isLive ? 'End call' : status === 'Connecting' ? 'Connecting…' : 'Start call'}
            </button>
            <button className="test-call-mute" type="button" onClick={toggleMute} disabled={!isLive} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'}>
              {muted ? <MicOff size={19} /> : <Mic size={19} />}<span>{muted ? 'Unmute' : 'Mute'}</span>
            </button>
          </div>
          <div className="test-call-volume">
            <span><Volume2 size={16} /> Assistant volume</span>
            <div className="test-call-meter" role="meter" aria-label="Assistant volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume * 100)}>
              <i style={{ width: `${Math.round(volume * 100)}%` }} />
            </div>
          </div>
          {error && <div className="test-call-error" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}
          {(!publicKey || !assistantId) && <p className="test-call-config-note">Configure the public key and assistant ID in the dashboard environment to enable calls.</p>}
        </section>

        <section className="panel test-call-transcript" aria-label="Live transcript">
          <div className="test-call-section-heading"><div><span className="eyebrow">LIVE SESSION</span><h2>Transcript</h2></div><span>{transcript.filter((item) => item.role !== 'tool').length} messages</span></div>
          <div className="test-call-messages" aria-live="polite">
            {transcript.length === 0 ? <p className="test-call-empty">Transcript and tool activity will appear here.</p> : transcript.map((item) => item.role === 'tool' ? (
              <p className="test-call-tool" key={item.id}>Tool: {item.text}</p>
            ) : (
              <article className={`test-call-bubble ${item.role === 'user' ? 'customer' : 'assistant'}`} key={item.id}>
                <span>{item.role === 'user' ? 'Customer' : 'AI Host'}</span><p>{item.text}</p>
              </article>
            ))}
          </div>
          <form className="test-call-compose" onSubmit={(event) => { event.preventDefault(); sendText(message); }}>
            <label htmlFor="test-call-message">Type as customer (Dutch)</label>
            <div className="test-call-compose-row"><input id="test-call-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a message in Dutch…" disabled={!isLive} /><button type="submit" disabled={!isLive || !message.trim()} aria-label="Send message" title="Send message"><Send size={17} /></button></div>
          </form>
        </section>

        <section className="test-call-phrases" aria-label="Quick phrases">
          <div className="test-call-section-heading"><div><span className="eyebrow">TEXT SIMULATION</span><h2>Quick phrases</h2></div></div>
          <div className="test-call-phrase-list">{phrases.map(([dutch, english]) => <button className="test-call-phrase" key={dutch} type="button" onClick={() => sendText(dutch)} disabled={!isLive}><span>{dutch}</span><small>{english}</small></button>)}</div>
        </section>

        <aside className="test-call-info"><div className="test-call-info-icon"><Mic size={17} /></div><p><b>Web calls have no caller number.</b><span>Headphones recommended when using the microphone.</span></p></aside>
      </div>
    </>
  );
}