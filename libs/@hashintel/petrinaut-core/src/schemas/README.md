---
layer: core.schemas
name: Schemas
role: Zod schemas for document entities, metrics and scenarios, and the descriptions the AI tools read
invariants:
  - Every entity schema ends in `satisfies z.ZodType<T>` against the canonical type, so a schema cannot drift from the type it validates
---

# Schemas

Zod definitions for the document's vocabulary: entities (places, transitions,
arcs, colours, parameters), metrics, and scenarios.

Two things make this layer more than boilerplate.

**Schemas are bound to the canonical types.** The types themselves live in
`../types/sdcpn.ts`; each schema here closes with
`satisfies z.ZodType<Place>` (or the equivalent). The direction matters: the type
is authoritative and the schema is checked against it, so adding a field to the
type without adding it to the schema is a compile error rather than a validator
that silently accepts incomplete documents.

**`.meta({ description })` is API surface, not a comment.** Those descriptions
are what the AI tools present when reasoning about a net, so they document
user-visible consequences — for example that renaming a place breaks every
lambda, kernel, metric, visualizer and scenario reference to it. Editing a
description changes what the assistant tells users, so treat it with the same
care as the code it describes.
