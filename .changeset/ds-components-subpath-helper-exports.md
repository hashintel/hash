---
"@hashintel/ds-components": minor
---

Per-component subpaths (`@hashintel/ds-components/<name>`) now export only components.

No longer exported:

- `iconSizeMap`: from `/button`
- `chipSizes`: from `/chip`
- `collectSelectedIds`: from `/menu`

Moved:

- `iconNames`: `/icon` → package root
- `ChipSize`: `/chip` → package root
- `useFieldId`: `/field-id-context` → package root
- `FieldIdProvider`: `/field-id-context` → `/field-id-provider`
