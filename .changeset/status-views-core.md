---
"@hashintel/petrinaut-core": patch
---

SDCPN documents carry optional `identities` (named instance identities that colour elements reference via `identityRef`) and `statusViews` (ordered, place-mapped status labels with optional token conditions and an optional exit label); both validate against the entity schemas and survive file import/export. Actual-mode transition firings carry the consumed and produced token values (`inputTokens` / `outputTokens`) only; `input` / `output` count maps are rejected, and recordings are written and read with version 3 with no older version accepted. New evaluators derive per-instance status, time-in-state, and dwell summaries from simulation frames.
