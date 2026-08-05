---
layer: core.types
name: Document types
role: The canonical TypeScript types describing an SDCPN document
invariants:
  - Authoritative over the Zod schemas — schemas are checked against these types, never the reverse
---

# Document types

`sdcpn.ts` is the single definition of what an SDCPN document _is_: places,
transitions, arcs, colours, parameters, differential equations, subnets and
component instances.

Everything else in the core is downstream of these types. The schemas in
`../schemas/` validate against them via `satisfies z.ZodType<T>`, the engine
compiles from them, and the file format serialises them. Adding a field here and
nowhere else surfaces as a type error in each of those places, which is the
intended way to discover the full cost of a document-model change.
