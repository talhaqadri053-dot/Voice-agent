# Vapi setup

## 1. Maak de tools aan

- Importeer de tooldefinities uit `vapi/tools.json` in Vapi.
- De setup-script vraagt om het eigenaarstelefoonnummer voor de `transferCall`-tool; voer dit in met landcode en `+` (E.164), bijvoorbeeld `+923496113706`.
- De assistent helpt eerst zelf en gebruikt deze transfer alleen als de beller expliciet om de eigenaar/medewerker vraagt en akkoord gaat.
- Gebruik de exacte URLs in het formaat `https://YOUR-N8N/webhook/vapi/<path>`.
- Zet de header `x-vapi-secret` op de waarde van `VAPI_WEBHOOK_SECRET`.
- Houd de toolnamen exact zoals in de SQL-vorm en in de n8n workflows: `get_menu`, `get_promotions`, `check_availability`, `calculate_order`, `create_order`, `create_booking`.

## 2. Maak de assistant aan

- Importeer `vapi/assistant.json` in Vapi.
- Kies een native Nederlandse ElevenLabs-voice en vervang de placeholder in `voice.voiceId` door de werkelijke voice id.
- Kies voor de transcriber `Deepgram` met `language: nl` en zet `recordingEnabled: true`.
- Zet `serverUrl` op de werkelijke Vapi Production URL van het n8n end-of-call workflow.
- Zet de `x-vapi-secret` header op dezelfde waarde als `VAPI_WEBHOOK_SECRET`.
- Gebruik `systemPrompt` of de prompt file `vapi/system_prompt_nl.md` als bron voor de prompttekst.

## 3. Koppel het telefoonnummer

- Koppel een Twilio-nummer met `+31` aan de Vapi-assistent.
- Zet de juiste webhook/assistant URL op het nummer.
- Test het gesprek met een echt call flow.

## 4. End-of-call en rapportage

De end-of-call-report workflow verwacht de volgende velden in de Vapi payload en gaat hier defensief mee om:

- `message.call.id`
- `message.call.customer.number`
- `message.recordingUrl`
- `message.artifact.transcript`
- `message.artifact.messages`
- `message.analysis.summary`
- `message.durationSeconds`
- `message.call.startedAt` / `message.call.endedAt`
- per-turn timingvelden zoals `sttLatencyMs`, `llmLatencyMs`, `ttsLatencyMs`, `totalLatencyMs` of varianten met `_` en `Ms`/`ms`.

Als Vapi een van deze velden niet stuurt, gebruikt de workflow fallback-waarden en blijft het proces veilig.

## 5. Verificatie

- Test `get_menu` en `get_promotions` met een geldige secret-header.
- Test een demo-bestelling over de telefoon met een postcode in het bezorgadres.
- Test een reservering met `check_availability` en `create_booking`.
- Laat een eindafsluitingscall lopen om te zien of `recording_url`, `transcript_messages`, `turn_metrics` en sms-status correct worden bijgewerkt.
