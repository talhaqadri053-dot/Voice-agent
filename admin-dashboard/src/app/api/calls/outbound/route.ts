import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function normalizePhoneNumber(value: unknown) {
  if (typeof value !== 'string') return null;

  const input = value.trim();
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null;

  const digits = input.replace(/\D/g, '');
  let normalized: string;

  if (input.startsWith('+')) {
    normalized = `+${digits}`;
  } else if (digits.startsWith('00')) {
    normalized = `+${digits.slice(2)}`;
  } else if (digits.startsWith('31') && digits.length > 10) {
    normalized = `+${digits}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    normalized = `+31${digits.slice(1)}`;
  } else {
    return null;
  }

  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export async function POST(request: NextRequest) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ ok: false, message: 'A JSON request body is required.' }, { status: 415 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });

  const apiKey = process.env.VAPI_PRIVATE_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
  const missingConfig: string[] = [];
  if (!apiKey) missingConfig.push('VAPI_PRIVATE_API_KEY');
  if (!phoneNumberId) missingConfig.push('VAPI_PHONE_NUMBER_ID');
  if (!assistantId) missingConfig.push('NEXT_PUBLIC_VAPI_ASSISTANT_ID');
  if (missingConfig.length > 0) {
    return NextResponse.json({
      ok: false,
      message: `Add ${missingConfig.join(', ')} to admin-dashboard/.env.local, then restart the dashboard.`,
    }, { status: 503 });
  }

  let body: { phoneNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Enter a valid phone number.' }, { status: 400 });
  }

  const phoneNumber = normalizePhoneNumber(body.phoneNumber);
  if (!phoneNumber) {
    return NextResponse.json({
      ok: false,
      message: 'Enter a valid number, such as a Dutch 06 number or an international number starting with +.',
    }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantId, phoneNumberId, customer: { number: phoneNumber } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = typeof result.message === 'string'
        ? result.message
        : typeof result.error === 'string'
          ? result.error
          : 'Vapi could not start the phone call.';
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      return NextResponse.json({ ok: false, message }, { status });
    }

    return NextResponse.json({
      ok: true,
      callId: result.id,
      phoneNumber,
      status: result.status,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, message: 'Vapi could not be reached. Try again shortly.' }, { status: 502 });
  }
}