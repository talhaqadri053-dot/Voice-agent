# Later: End-of-call reporting

After the end-of-call workflow is published, add this to the assistant payload in `assistant.json` and `setup_vapi.ps1`:

```json
"server": {
  "url": "https://YOUR-N8N/webhook/vapi/end-of-call-report",
  "headers": { "x-vapi-secret": "YOUR_VAPI_SECRET" }
},
"serverMessages": ["end-of-call-report"]
```

Use the actual published workflow URL and the same webhook secret stored locally in `vapi_secret.txt`. Do not enable this before the workflow is published.
