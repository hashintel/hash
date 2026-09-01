---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

SDCPN elements carry an optional `description` (places, transitions, types, subnets, component instances, and the net root) and optional host-defined `metadata` (transitions, subnets, component instances, and the net root). Both survive file import/export; the properties panels edit descriptions, while `metadata` is opaque and never rendered.
