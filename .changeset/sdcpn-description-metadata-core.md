---
"@hashintel/petrinaut-core": patch
---

SDCPN elements carry an optional `description` (places, transitions, types, subnets, component instances, and the net root) and an optional `metadata` record of JSON values (transitions, subnets, component instances, and the net root). `metadata` is host-defined and opaque to the library. Both fields validate against the entity schemas, survive file import/export, and are preserved when an `SDCPNInput` is normalized. Files written without the fields still validate.
