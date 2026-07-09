---
name: meaningful-identifiers
description: Naming guidance for callback parameters and local variables in TypeScript. Use when writing or refactoring loops, array callbacks (map/filter/find/reduce), or local accumulators.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: low
    keywords:
      - naming
      - rename
      - identifier
      - variable name
---

# Meaningful identifiers

Callback parameters and local variables must describe the value they hold.

## Rules

- Name array callback params after the element's domain type:
  `batches.map((batch) => …)`, `bins.filter((bin) => …)`,
  `checkpoints.find((checkpoint) => …)`. Never reuse `right`/`left`/`column`
  for values that are not sort operands or table columns.
- Name `reduce` accumulators after what they accumulate: `sum`/`total` for a
  running total, not `step`.
- Name percentile/ratio arguments for the quantity they represent
  (`percentileRank`, `multiplier`), not an unrelated domain noun.

## Leave correct uses untouched

- Sort comparators: `(left, right) => left - right`.
- `(column) => column.key` over a real `.columns` array.
- `for (const row of …Rows)` where the items are genuinely rows.
