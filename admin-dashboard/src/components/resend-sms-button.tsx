'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';

export function ResendSmsButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function resend() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/resend-sms`, { method: 'POST' });
      const result = await response.json() as { ok: boolean; message: string };
      setSuccess(response.ok && result.ok);
      setMessage(result.message);
      if (response.ok && result.ok) router.refresh();
    } catch {
      setSuccess(false);
      setMessage('Could not resend SMS.');
    }
    setPending(false);
  }

  return (
    <div className="resend-control">
      <button className="resend-button" type="button" onClick={() => void resend()} disabled={pending}>
        <RotateCw size={13} className={pending ? 'spin-icon' : ''} /> {pending ? 'Sending…' : 'Resend SMS'}
      </button>
      {message && <small className={success ? 'resend-success' : 'resend-error'} role="status">{message}</small>}
    </div>
  );
}