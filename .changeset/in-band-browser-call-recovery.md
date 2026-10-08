---
"@hashintel/petrinaut": patch
---

Add an optional `pending` source to `inBandBrowserTools`. The AI assistant polls it and runs issued browser calls it is not already running, so calls issued after the response stream ends still run instead of expiring unclaimed.
