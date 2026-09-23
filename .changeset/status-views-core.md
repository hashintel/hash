---
"@hashintel/petrinaut-core": patch
---

SDCPN documents carry optional `identities` (named instance identities that colour elements reference via `identityRef`) and `statusViews` (ordered, place-mapped status labels with optional token conditions and an optional exit label); both validate against the entity schemas and survive file import/export. Actual-mode transition firings carry the attribute values of the tokens they consumed and produced (`inputTokens` / `outputTokens`), and recordings carry version 2. Replaying a firing that consumes a token the marking does not hold throws, and a recording containing one fails to parse. New evaluators derive per-instance status, time-in-state, and dwell summaries from simulation frames.
