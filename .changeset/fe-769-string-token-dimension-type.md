---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Add the `string` token attribute type, stored via per-run interning. Editing a type's schema now migrates stored initial state (values convert, falling back to the new type's default).
