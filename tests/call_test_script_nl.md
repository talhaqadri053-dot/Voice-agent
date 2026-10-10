# Call test script (Nederlands)

Gebruik dit script in Vapi of een live test-oproep. Het doel is om de AI-stem, menu/tool-contract en de service-voorwaarden te controleren zonder de klant te laten verzinnen.

## Test 1 — Opening hours / gesloten

- Zeg: "Hoi, ik wil een bestelling plaatsen."
- Zet in de assistant: `opening_hours` naar een tijdslot dat buiten opening hours valt.
- Verwacht: De AI zegt dat de zaak op dit moment gesloten is of dat er een passende foutmelding verschijnt. Zij mag geen menu-items uitvinden.

Vervang de instelling: `settings.opening_hours` / `opening_hours` in Supabase.

## Test 2 — Menu vragen zonder inventaris

- Zeg: "Wat heb je vandaag op de kaart?"
- Verwacht: De AI noemt alleen items uit `get_menu` en de `promotions_text` uit `get_promotions`.

Vervang de instelling: `menu_items.available` of de menu-data in Supabase.

## Test 3 — Promo herkend

- Zeg: "Is er een actie vandaag?"
- Verwacht: De AI gebruikt exact het promo-tekstenblok uit `get_promotions`, inclusief voorwaarden zoals minimum-bestelling of code.

Vervang de instelling: `promotions` in Supabase of zet de promo op `active`.

## Test 4 — Levering met postcode buiten bereik

- Zeg: "Ik wil een bestelling laten bezorgen naar 1234 AB, Utrecht."
- Verwacht: De AI zegt dat de postcode buiten de leverzone valt, zonder een klacht of onjuiste prijs te geven.

Vervang de instelling: `delivery_zones` en de postcode-lijst in Supabase.

## Test 5 — Order berekenen

- Zeg: "Bereken voor mij 2 Hollandse burgers voor afhalen."
- Verwacht: De AI roept `calculate_order` en geeft het juiste bedrag, inclusief eventuele promo of delivery fee.

Vervang de instelling: `menu_items.price` of `promotions` om het geschatte totaal te controleren.

## Test 6 — Order bevestigen

- Zeg: "Maak de bestelling."
- Verwacht: De AI vraagt om een duidelijke bevestiging en doet pas daarna `create_order`.

Vervang de instelling: prompt-tekst of de AI-toolafhandeling voor het “ja/nee”-pad.

## Test 7 — Reservering

- Zeg: "Ik wil vrijdag om 19:00 met 4 personen reserveren."
- Verwacht: De AI gebruikt `check_availability` en `create_booking` en geeft de reservering terug met tijd en aantal personen.

Vervang de instelling: `settings.booking_slot_capacity` of `bookings` voor slot-capaciteit.

## Test 8 — End-of-call report

- Laat een gesprek aflopen met opname.
- Verwacht: De workflow `n8n_end_of_call_report.json` slaat transcript, samenvatting, opname-URL en SMS-status op.

Vervang de instelling: `VAPI_WEBHOOK_SECRET` of het Vapi-URL en de opname-URL in de workflow.

## Test 9 — SMS resend

- Gebruik de admin pagina of de admin webhook met een bekend `call_id`.
- Verwacht: De vorige SMS wordt opnieuw verstuurd en de status in `calls.sms_status` wordt bijgewerkt.

Vervang de instelling: `ADMIN_WEBHOOK_SECRET` en `TWILIO_*`-variabelen in n8n.