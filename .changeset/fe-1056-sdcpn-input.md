---
"@hashintel/petrinaut-core": patch
---

`createJsonDocHandle` accepts `SDCPNInput`, a loose authoring variant of `SDCPN`: extension fields may be omitted and are filled with plain-net defaults by the new `normalizeSDCPN` export. `SDCPNInput` and its member types are exported from the package root.
