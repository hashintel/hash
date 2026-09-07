---
"@hashintel/petrinaut": patch
---

Split the optimizations provider's reconnect policy, transport-error handling, and stored-run bookkeeping into their own modules, and turn the attach loop's failure handling into one pure decision function. No behavioural change.
