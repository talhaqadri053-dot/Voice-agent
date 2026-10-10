# Stem & Tafel Admin

Responsive Next.js 14 App Router dashboard for the Dutch voice ordering and booking system.

## Start

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon key. Add the Vapi outbound-call variables below to enable phone testing. Add the optional server-only Twilio variables to enable SMS resend.
3. In Supabase Auth, create or invite the admin email/password accounts that may access this dashboard.
4. Apply `../supabase_schema.sql`, followed by `../n8n_supabase_functions.sql` in the Supabase SQL Editor.
5. From this directory run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `npm run build` and `npm run typecheck` are available for verification.

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=your_server_only_auth_token
TWILIO_FROM=YourBrand
BUSINESS_NAME=Stem & Tafel
VAPI_PRIVATE_API_KEY=your_server_only_vapi_private_key
VAPI_PHONE_NUMBER_ID=your_imported_twilio_number_id
```

## Security

The browser uses only the Supabase anon key. Never put the service-role key, Twilio Auth Token, or Vapi private API key in `NEXT_PUBLIC_*` or client code. Outbound calling uses the configured assistant ID and an imported Vapi phone number. Supabase RLS remains the data-access boundary; the current schema grants full table access to every `authenticated` user, so only create trusted admin accounts unless those policies are narrowed.

The dashboard uses Supabase SSR cookies, refreshes sessions in `middleware.ts`, and checks the user again in the protected layout and every server action. It reads and updates `menu_items`, `orders`, `bookings`, `calls`, and `settings`.

## Routes

- `/login` — email/password sign-in
- `/dashboard` — today's totals and seven-day revenue chart
- `/dashboard/orders` — order status management
- `/dashboard/bookings` — booking status management
- `/dashboard/calls` — call summaries, transcripts, SMS status, and resend action
- `/dashboard/menu` — menu item CRUD and availability management
- `/dashboard/settings` — opening hours, prep time, delivery fee, and Dutch SMS template