---
"@hashintel/petrinaut": minor
"@hashintel/petrinaut-core": minor
---

Add the `string` token element type: free-form text represented as plain JS strings in all user code, compared by value, and stored via per-run string interning — frame buffers hold 64-bit references into an append-only `StringPool` owned by the simulation (interactive runs ship append-only `newStrings` pool deltas alongside frame payloads; Monte Carlo runs keep one pool per run). Kernel outputs take plain strings (missing values become `""`, non-strings stringify via `String(value)`); Distributions on string elements are rejected and dynamics cannot write them. The type-properties panel, initial-state and scenario spreadsheets, and the token-encoding playground gain String columns/dimensions.
