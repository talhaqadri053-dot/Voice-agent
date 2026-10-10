# Final checklist

Use this in the exact order below.

## 1. Database and server setup

1. Create or select the Supabase project.
2. In Supabase SQL Editor, run `supabase_schema.sql`.
3. If required by your database, run `02_migration_admin_spec.sql`.
3. Run `03_business_name.sql` to seed the default business name without overwriting an existing value.
4. Run `n8n_supabase_functions.sql`.
5. Confirm the tables, functions and status values exist exactly as defined in the project contract.

## 2. n8n import and config

1. Open n8n.
2. Go to Workflows → Import from File.
3. Import these files in order:
   - `n8n_get_menu.json`
   - `n8n_get_promotions.json`
   - `n8n_check_availability.json`
   - `n8n_calculate_order.json`
   - `n8n_create_order.json`
   - `n8n_create_booking.json`
   - `n8n_assistant_request.json`
   - `n8n_end_of_call_report.json`
   - `n8n_resend_sms.json`
4. Activate each workflow.
5. Set the environment variables listed in `n8n_SETUP.md`.
6. Set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` on a self-hosted n8n instance.

## 3. Vapi setup

1. Create the assistant in Vapi using the config in `vapi/assistant.json`.
2. Add the tool definitions from `vapi/tools.json`.
3. Set the correct production URLs from the n8n webhook nodes.
4. Configure the `x-vapi-secret` header value in Vapi and match it to `VAPI_WEBHOOK_SECRET` in n8n.
5. Set the assistant voice, model and transcriber values in the live Vapi instance.

## 4. Admin dashboard

1. Copy `admin-dashboard/.env.example` to `admin-dashboard/.env.local`.
2. Fill in the real Supabase project URL and anon key.
3. Install dependencies:

```bash
cd admin-dashboard
npm install
```

4. Run the app:

```bash
npm run dev
```

5. Sign in with a real Supabase admin user.

## 5. Manual steps only you can do

These steps require your local or cloud credentials and cannot be completed automatically by the repo:

- create the live Supabase project and database
- copy the project URL and anon key into the dashboard environment
- add the real Vapi secret and webhook configuration in Vapi
- add Twilio credentials in n8n
- add the admin resend secret and the real business number
- confirm the live webhook URLs are reachable from the internet
- verify the first real call and first real SMS send in production

## 6. Smoke test after import

Run each of the curl checks in `tests/curl_tests.md` with your live URLs. Validate the `results` payload, the `401` rejection case, and the SMS resend flow.

## 7. Final validation

- All n8n JSON files parse as valid JSON
- no secrets are committed in the repository
- `.gitignore` covers `.env` and `.env.*` files
- the admin dashboard runs without build or lint errors