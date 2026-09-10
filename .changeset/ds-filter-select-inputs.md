---
"@hashintel/ds-components": patch
---

`Filter` operators can now declare select inputs: a ValueMap value typed as a string (or string union) accepts `{ type: "select", items }` for a single select, and a non-tuple string array accepts a `multiple: true` select; both compose into tuple inputs alongside text and number inputs. Items may be given upfront or via an async loader, and the select supports `placeholder`, `searchable`, `renderItem`/`renderSelectedItem`, `emptyState`, `maxItems`, and `overflow`. Select inputs commit the draft when their dropdown closes, unless it closes via Escape, which reverts the draft like Escape in a text input. `Select` also gains an `onOpenChange` prop, and the `FilterSingleSelectInput`/`FilterMultiSelectInput` config types are exported.
