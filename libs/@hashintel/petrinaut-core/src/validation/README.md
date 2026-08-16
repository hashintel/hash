---
layer: core.validation
role: Structural integrity validators for SDCPN entities, enforcing naming conventions
---

# validation/

Structural integrity validators for SDCPN entities. These enforce naming
conventions (PascalCase for places/transitions, lower_snake_case for parameter
variable names) using Zod schemas with pure-function wrappers.

Currently used by the property-panel UI components to validate on blur.

`record-keys.ts` guards records keyed by user-authored strings: the
`DANGEROUS_RECORD_KEYS` list (`Object.prototype` member names), prototype-free
record construction (`createUserKeyedRecord`), own-property reads (`getOwn`),
and `findDangerousSdcpnKeys`, the walk that the file-import and simulation
boundaries use to reject hostile identifiers (FE-523).

**@todo FE-521:** These validators should also be enforced in `MutationProvider`
(as a safety net) and surfaced in the Diagnostics tab (so that files
loaded with pre-existing invalid names show warnings).
