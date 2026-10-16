---
"@hashintel/petrinaut-core": patch
---

Entity, net and subnet ids are UUIDs: documents with other ids get stable UUIDs when they load, older ids still resolve, and `petrinautIdSchema` validates and converts an id field.
