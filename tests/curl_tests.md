# n8n curl tests

Use these commands after the workflows are imported and the environment variables are configured. Replace the placeholders with your real instance data.

## 1. Menu

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/get-menu" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallList":[{"toolCallId":"menu_01","function":{"name":"get_menu","arguments":"{}"}}]}}'
```

Expected result: HTTP 200 and a `results` array containing JSON with `items` and `promotions_text`.

## 2. Promotions

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/get-promotions" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallList":[{"toolCallId":"promo_01","function":{"name":"get_promotions","arguments":"{}"}}]}}'
```

Expected result: HTTP 200 and a result payload with current promotions for the day.

## 3. Availability check

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/check-availability" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallList":[{"toolCallId":"availability_01","function":{"name":"check_availability","arguments":"{\"date\":\"2026-10-10\",\"time\":\"18:30\",\"people_count\":4}"}}]}}'
```

Expected result: `available` true/false plus booking capacity details.

## 4. Calculate order

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/calculate-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallList":[{"toolCallId":"calc_01","function":{"name":"calculate_order","arguments":"{\"order_type\":\"delivery\",\"items\":[{\"name\":\"Hollandse burger\",\"quantity\":2}] }"}}]}}'
```

Expected result: HTTP 200 and a total, item breakdown, and delivery fee/discount details when applicable.

## 5. Create order

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/create-order" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallId":"create_order_01","toolCallList":[{"toolCallId":"create_order_01","function":{"name":"create_order","arguments":"{\"customer_phone\":\"+31612345678\",\"order_type\":\"delivery\",\"delivery_address\":\"Damrak 1, Amsterdam\",\"items\":[{\"name\":\"Hollandse burger\",\"quantity\":2}] }"}}]}}'
```

Expected result: HTTP 200, a created order object, and a row in `orders` plus `order_items`.

## 6. Create booking

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/vapi/create-booking" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_SECRET" \
  -d '{"message":{"toolCallList":[{"toolCallId":"booking_01","function":{"name":"create_booking","arguments":"{\"customer_phone\":\"+31612345678\",\"customer_name\":\"Jan Jansen\",\"service\":\"restauranttafel\",\"date\":\"2026-10-10\",\"time\":\"18:30\",\"people_count\":4 }"}}]}}'
```

Expected result: HTTP 200 and a created booking record.

## 7. Invalid secret check

```bash
curl -sS -o /tmp/n8n_invalid.out -w "%{http_code}\n" -X POST "https://YOUR_N8N_HOST/webhook/vapi/get-menu" \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: wrong-secret" \
  -d '{"message":{"toolCallList":[{"toolCallId":"menu_02","function":{"name":"get_menu","arguments":"{}"}}]}}'
```

Expected result: `401` and a rejection message.

## 8. Admin resend SMS

```bash
curl -sS -X POST "https://YOUR_N8N_HOST/webhook/admin/resend-sms" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"call_id":"PUT_CALL_UUID_HERE"}'
```

Expected result: HTTP 200 and an SMS status update via Twilio and the database RPC.