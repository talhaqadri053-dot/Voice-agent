# Vapi and n8n setup

## 1. Prepare the database first

Run the following in Supabase SQL Editor in order:

1. `supabase_schema.sql`
2. `02_migration_admin_spec.sql` if your project has the admin migration already applied in the live DB
3. `n8n_supabase_functions.sql`

These create the restaurant schema, order and booking tables, pricing and availability functions, and the RPCs used by the n8n workflows. The functions are intentionally idempotent where needed and rely on existing table/column names; do not rename status values or webhook paths.

Important rules from the project contract:

- valid order status values remain: `pending`, `confirmed`, `preparing`, `ready`, `delivered`, `completed`, `cancelled`
- valid booking statuses remain as used by the schema
- menu pricing is based on the DB and cannot be invented by the assistant
- `opening_hours` is read by weekday keys like `monday`, `tuesday`, etc. with values in the `HH:MM-HH:MM` format
- `settings.booking_slot_capacity` controls the maximum active bookings for a slot and can be changed in SQL or the admin settings screen

## 2. n8n Cloud

These workflows use n8n credentials rather than `$env` expressions. Before importing, create the following credentials in n8n Cloud. Keep credential names exact so the imported references resolve:

| Credential name | Credential type | Values | Used by |
| --- | --- | --- | --- |
| `Vapi Webhook Secret` | Header Auth | Header name `x-vapi-secret`; value: the same long random secret configured in Vapi | Built-in authentication on every `vapi/*` Webhook node |
| `Admin Resend Secret` | Header Auth | Header name `x-admin-secret`; value: the admin secret configured in the dashboard server environment | Built-in authentication on `admin/resend-sms` Webhook |
| `Supabase service role` | Supabase API | Project URL `https://YOUR_PROJECT_REF.supabase.co`; service-role API key | All Supabase HTTP Request nodes, including Storage upload |
| `Twilio API` | Twilio API | Twilio Account SID and Auth Token | Twilio HTTP Request nodes in end-of-call and resend-SMS workflows |

The workflows reference those credentials by name with empty credential IDs. On import, n8n Cloud should resolve an existing credential with the matching name; if it prompts, select the credential listed above. Do not paste credentials into workflow JSON or ordinary HTTP headers.

Supabase HTTP Request node URLs contain the non-secret placeholder `https://YOUR_PROJECT_REF.supabase.co`. Replace `YOUR_PROJECT_REF` with the project reference in the imported workflows, or edit each affected node URL before activation. These nodes use the predefined `Supabase API` authentication type; there are no `apikey` or `Authorization` secret headers in the workflow JSON.

The `Config` Set node in `n8n_end_of_call_report.json` and `n8n_resend_sms.json` holds only non-secret values. Replace `YOUR_BUSINESS_NAME`, `YOUR_TWILIO_SENDER_ID`, and `YOUR_TWILIO_ACCOUNT_SID` in each Config node. The Twilio API credential separately stores the Account SID and Auth Token used for authentication.

No n8n environment variables or `N8N_BLOCK_ENV_ACCESS_IN_NODE` setting are required. Keep the Supabase service-role key and Twilio Auth Token only in n8n credentials, never in the admin browser or committed workflow files.

## 3. Import workflows in this order

Use Workflows → Import from File for each JSON workflow and activate it after import:

1. `n8n_get_menu.json` → `POST /webhook/vapi/get-menu`
2. `n8n_get_promotions.json` → `POST /webhook/vapi/get-promotions`
3. `n8n_check_availability.json` → `POST /webhook/vapi/check-availability`
4. `n8n_calculate_order.json` → `POST /webhook/vapi/calculate-order`
5. `n8n_create_order.json` → `POST /webhook/vapi/create-order`
6. `n8n_create_booking.json` → `POST /webhook/vapi/create-booking`
7. `n8n_assistant_request.json` → `POST /webhook/vapi/assistant-request`
8. `n8n_end_of_call_report.json` → `POST /webhook/vapi/end-of-call-report`
9. `n8n_resend_sms.json` → `POST /webhook/admin/resend-sms`

The production URL shown by the active webhook node must be used in the matching Vapi tool or admin call. Header Auth validates the secret before the workflow runs. For the Vapi workflows, the request header is:

```http
x-vapi-secret: YOUR_VAPI_SECRET
```

For the admin resend workflow, use:

```http
x-admin-secret: YOUR_ADMIN_SECRET
```

## 4. Tool contract and arguments

The Vapi tools use the following shapes:

`get_menu`:

```json
{}
```

`get_promotions`:

```json
{}
```

`check_availability`:

```json
{"date":"2026-10-10","time":"18:30","people_count":4}
```

`calculate_order`:

```json
{"order_type":"delivery","items":[{"name":"Hollandse burger","quantity":2}]}
```

`create_order`:

```json
{"customer_phone":"+31612345678","order_type":"delivery","delivery_address":"Damrak 1, Amsterdam","items":[{"name":"Hollandse burger","quantity":2}]}
```

For pickup use `"order_type":"pickup"` and omit `delivery_address`. `call_id` is optional and must be the UUID primary key from `calls.id`, not the Vapi `vapi_call_id`.

`create_booking`:

```json
{"customer_phone":"+31612345678","customer_name":"Jan Jansen","service":"restauranttafel","date":"2026-10-10","time":"18:30","people_count":4}
```

The Vapi assistant must answer in Dutch only and use the return values from the tool calls as source of truth. The menu and promotions tools are not to be invented or extended by the AI.

## 5. Runtime checks

Validate each workflow with a test body that matches Vapi's tool-call format. The response envelope is expected to look like this:

```json
{"results":[{"toolCallId":"...","result":"{...json string...}"}]}
```

Response expectations:

- valid secret → HTTP 200 and a result payload
- invalid secret → rejected by the Webhook's Header Auth credential before workflow execution
- successful order/payment/booking writes are reflected in the related Supabase tables
- the end-of-call workflow stores the transcript, summary, recording URL, and SMS status updates

The Supabase HTTP nodes use a 700 ms timeout. This keeps slow upstream requests from hanging and allows a graceful fallback in Dutch instead of a raw timeout failure.

## 6. Admin resend route

The admin resend flow is protected by the header:

```http
x-admin-secret: YOUR_ADMIN_SECRET
```

It should be called from the admin panel or a trusted internal script when an SMS must be resent. The workflow reads the `call_id` and triggers the same sending logic used by the end-of-call flow after revalidation.