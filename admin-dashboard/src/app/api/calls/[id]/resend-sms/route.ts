import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });

  const webhookUrl = process.env.N8N_ADMIN_RESEND_SMS_URL;
  const adminSecret = process.env.ADMIN_WEBHOOK_SECRET;
  if (!webhookUrl || !adminSecret) {
    return NextResponse.json({ ok: false, message: 'The SMS resend webhook is not configured.' }, { status: 503 });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
      body: JSON.stringify({ call_id: params.id }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ ok: false, message: result.message ?? 'Could not resend SMS.' }, { status: response.status });
    }
    return NextResponse.json({ ok: true, message: result.message ?? 'SMS resent.' });
  } catch {
    return NextResponse.json({ ok: false, message: 'The SMS resend webhook is unreachable.' }, { status: 502 });
  }
}