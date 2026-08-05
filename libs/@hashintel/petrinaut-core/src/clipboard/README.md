---
layer: core.clipboard
name: Clipboard
role: Serialises a selection and pastes it back, resolving name collisions
invariants:
  - Pasted elements are renamed rather than overwriting an existing element of the same name
---

# Clipboard

Copy and paste for a subgraph. `serialize.ts` turns a selection into a portable
payload; `paste.ts` reinserts one, and `deduplicate-name.ts` gives colliding
elements fresh names so pasting into a net that already uses those names cannot
silently merge two distinct elements.

Kept in the core rather than in the editor so paste semantics are identical for
any host, and testable without a canvas.
