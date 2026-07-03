---
"@hashintel/petrinaut": minor
"@hashintel/petrinaut-core": minor
---

Add the `uuid` token dimension type: 128-bit RFC 4122 identifiers represented as `bigint` at runtime, stored as two little-endian 64-bit lanes in frame buffers, and as canonical lowercase strings at rest. Kernel outputs may omit uuid fields (auto-generated deterministically from the seeded simulation RNG) or use the new `Uuid.generate()` / `Uuid.from(value)` helpers; non-UUID inputs convert deterministically via UUIDv5. The initial-state and scenario spreadsheets gain UUID columns.
