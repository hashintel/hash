# validation/

Structural integrity validators for SDCPN entities. These enforce naming
conventions (PascalCase for places/transitions, lower_snake_case for parameter
variable names) using Zod schemas with pure-function wrappers.

Currently used by the property-panel UI components to validate on blur.

**FE-521:** These validators should also be enforced in `MutationProvider`
(as a safety net) and surfaced in the Diagnostics tab (so that files
loaded with pre-existing invalid names show warnings).
