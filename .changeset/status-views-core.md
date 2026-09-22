---
"@hashintel/petrinaut-core": patch
---

SDCPN documents carry optional `identities` (named instance identities that colour elements reference via `identityRef`) and `statusViews` (ordered, place-mapped status labels with optional token conditions and an optional exit label); both validate against the entity schemas and survive file import/export. Actual-mode transition firings carry the consumed and produced token values (`inputTokens` / `outputTokens`) instead of `input` / `output` counts; count-only payloads and version-1 and version-2 recordings still load, and recordings are written with version 3. New evaluators derive per-instance status, time-in-state, and dwell summaries from simulation frames.
