# Assumptions used for the remaining implementation

- The database already contains the migration changes described in the project record, including the admin-spec columns, the `is_open_now()` RPC, the storage bucket policy, and the end-of-call/SMS helpers. No additional SQL migration was created because the base project already states that these objects are already installed in Supabase.
- The remaining work is primarily a configuration and workflow pass: Vapi assistant JSON, Vapi tool definitions, n8n assistant-request/webhook wiring, and the end-of-call/report resend flows.
- The restaurant talks in Dutch only, so the assistant prompt and end-of-call SMS text are written in Dutch and not in English/German.
- The Vapi assistant service needs a placeholder voice ID and placeholder production URLs; these should be replaced with the actual deployed values before production use.
- The admin dashboard already contains the resend action, so the n8n resend workflow is a server-side backup and is not a new Next.js API endpoint.
- For the missing or ambiguous Vapi payload fields, the workflow reads them defensively with optional chaining and fallbacks, as requested.
