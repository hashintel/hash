---
"@hashintel/petrinaut": patch
---

Report duplicate AI mutations as no-ops so hosts can distinguish an applied document change from
an already-present state when resuming a correlated browser tool call.
