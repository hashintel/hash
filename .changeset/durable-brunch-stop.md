---
"@hashintel/petrinaut": patch
---

Let hosts make the assistant's Stop action durable before Petrinaut cancels its local response stream, while preserving local-only cancellation for hosts that do not provide the new stop request.
