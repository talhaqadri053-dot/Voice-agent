# End-of-call report workflow setup

## Supabase

Run `supabase_schema.sql` to add the nullable `bookings.call_id` foreign key and index (safe to rerun). Then run the updated `n8n_supabase_functions.sql` and import the updated `n8n_end_of_call_report.json` workflow. The `voice_save_end_call_report` RPC upserts the Vapi call, including its recording URL, structured transcript messages, and available per-turn STT/LLM/TTS timing values; it also finds the latest non-cancelled order and/or booking for the same caller created during the call window, persists their `call_id`, and returns the details for the SMS. If Vapi timestamps are missing, it uses a 30-minute fallback window. Verify this matching window fits the business's call and order timing.

The report upsert preserves `sms_status`. If it is already `sent`, a repeated Vapi report will not send another SMS. When there is no matched order or booking, SMS sending is skipped and `sms_status` is left unchanged. Existing calls remain viewable; recordings and metrics appear when those values are included in the Vapi report payload.

## n8n and Vapi

Import `n8n_end_of_call_report.json`, assign an HTTP Basic Auth credential to **Send SMS via Twilio (retry once)**, and activate the workflow. Use the credential username as the Twilio Account SID and its password as the Twilio Auth Token.

Set these environment variables alongside those in `n8n_SETUP.md`:

```text
BUSINESS_NAME=Your Business Name
TWILIO_ACCOUNT_SID=AC...
TWILIO_FROM=YourBrand
```

`TWILIO_FROM` can be an eligible Twilio phone number or alphanumeric sender ID. Configure Vapi's server URL to the active Production URL for the webhook and send `x-vapi-secret` with the same secret as `VAPI_WEBHOOK_SECRET`. Subscribe to the `end-of-call-report` event. The workflow reads `message.call.id`, `message.call.customer.number`, `message.artifact.transcript`, `message.artifact.messages`, `message.artifact.recordingUrl`, `message.analysis.summary`, and `message.durationSeconds`, with timestamp-based fallbacks for duration. Per-turn timing is read from explicit `sttLatencyMs`, `llmLatencyMs`, `ttsLatencyMs`, and `totalLatencyMs` fields when present.

The Twilio request retries once after a failed attempt. After the final result it calls `voice_update_call_sms_status` with `sent` or `failed`. A delivery accepted by Twilio but whose response is lost can still result in a duplicate on retry; the workflow prevents duplicate sends on repeated reports once `sms_status` has been set to `sent`.

## Dutch SMS text

Order template (the workflow keeps the generated text to 160 characters when possible):

```text
{{business}}: {{items}}. Totaal EUR {{total}}. {{Afhalen/Bezorgen}} ca. {{eta}} min.
```

Booking template:

```text
{{business}}: Reservering {{service}} {{date}} {{time}}, {{people}} pers.
```

The current schema has no booking price, so booking confirmations do not include a total. The order template uses `EUR` rather than the euro symbol to avoid an extra GSM-7 character and formats the decimal with a comma.

## Netherlands sender ID

An alphanumeric sender ID is one-way: recipients cannot reply to it. Keep it to at most 11 characters, use letters and digits, and include at least one letter. Sender-ID availability, registration, and whether carriers preserve the ID depend on current Twilio and Dutch carrier rules; confirm the Netherlands SMS guidelines in Twilio Console and test with the target networks before launch. Use a two-way-capable Twilio number if replies are needed.