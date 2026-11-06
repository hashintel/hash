---
"@blockprotocol/type-system": patch
---

Array data types with an `items` schema accept `minItems` and `maxItems`. Values with fewer or more items than allowed fail validation, and a data type that inherits array constraints from several parents keeps the strictest bounds, failing to resolve when `minItems` exceeds `maxItems`.
