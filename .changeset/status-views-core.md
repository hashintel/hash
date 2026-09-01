---
"@hashintel/petrinaut-core": patch
---

SDCPN documents carry optional `identities` (named instance identities that colour elements reference via `identityRef`) and `statusViews` (ordered, place-mapped status labels with optional token conditions and an optional exit label); both validate against the entity schemas and survive file import/export. Actual-mode firing records may carry the consumed and produced token values, and new evaluators derive per-instance status, time-in-state, and dwell summaries from simulation frames.
