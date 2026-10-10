# Part 1 HTTP Tests

Replace `YOUR-N8N` with the n8n host and `SECRET` with the configured `VAPI_WEBHOOK_SECRET`. These commands use the production webhook paths.

Every successful tool response must have this shape: `results[0].toolCallId` equals the submitted tool-call ID, and `results[0].result` is a JSON-serialized string. Parse that string to inspect `ok`, totals, and Dutch messages.

## Calculate Order

```sh
curl -i -X POST "https://YOUR-N8N/webhook/vapi/calculate-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: SECRET" \
  -d '{"message":{"toolCallList":[{"id":"part1-calc-1","parameters":{"order_type":"delivery","delivery_address":"Damrak 1, 1011 AB Amsterdam","promo_code":"PART1","items":[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]}}]}}'
```

Expected HTTP 200. `toolCallId` is `part1-calc-1`; parse `result` and expect subtotal `7.00`, discount `0.70`, delivery fee `2.50`, and total `8.80` after loading the SQL fixture.

## Get Promotions

```sh
curl -i -X POST "https://YOUR-N8N/webhook/vapi/get-promotions" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: SECRET" \
  -d '{"message":{"toolCallList":[{"id":"part1-promos-1","parameters":{}}]}}'
```

Expected HTTP 200. `toolCallId` is `part1-promos-1`; parse `result` and expect `promotions_text` with today's active deals in Dutch (including `PART1` while the fixture is active).

## Create Order

```sh
curl -i -X POST "https://YOUR-N8N/webhook/vapi/create-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: SECRET" \
  -d '{"message":{"toolCallList":[{"id":"part1-create-1","parameters":{"customer_phone":"+31600000000","order_type":"pickup","promo_code":"PART1","items":[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]}}]}}'
```

Expected HTTP 200. `toolCallId` is `part1-create-1`; parse `result` and expect `ok=true`, `status="pending"`, and an order ID. Repeating this request only deduplicates when a non-null `call_id` is supplied; the SQL test covers that guarantee.

## Wrong Secret

```sh
curl -i -X POST "https://YOUR-N8N/webhook/vapi/calculate-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: WRONG-SECRET" \
  -d '{"message":{"toolCallList":[{"id":"part1-unauthorized-1","parameters":{"order_type":"pickup","items":[{"name":"Stroopwafel","quantity":1}]}}]}}'
```

Expected HTTP 401. The response body still uses `results[0].toolCallId` matching `part1-unauthorized-1`, with `results[0].result` containing a JSON string.

## Missing Items

```sh
curl -i -X POST "https://YOUR-N8N/webhook/vapi/calculate-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: SECRET" \
  -d '{"message":{"toolCallList":[{"id":"part1-missing-items-1","parameters":{"order_type":"pickup"}}]}}'
```

Expected HTTP 200 with a Dutch validation/fallback message. `results[0].toolCallId` matches `part1-missing-items-1`, and `results[0].result` is a JSON string.