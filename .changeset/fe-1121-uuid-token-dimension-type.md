---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Add the `uuid` token attribute type: 128-bit identifiers, `bigint` at runtime, canonical strings at rest. Kernels may omit uuid fields to auto-generate them, or use `Uuid.generate()` / `Uuid.from(value)`.
