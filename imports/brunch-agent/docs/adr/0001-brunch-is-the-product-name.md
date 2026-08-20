# ADR-0001: `brunch` is the product name, and it may appear in structure

Date: 2026-08-13
Status: accepted
Supersedes: spec [§12.3](../planning/elicitation-kernel/spec.md#123-naming--tool-namespacing) in part
Decided on: FE-1388

## Context

The spec was written while the product name was open. Its preamble calls
"elicitation kernel" and "brunch-lite" working labels, and §12.3 rules that
*nothing bakes "elicit" or "brunch" into structure*, with a provisional tool
prefix of `bl_*`.

That rule bundled two different concerns:

1. **Don't name a thing after what it does.** `elicit_*` fixes the product's
   purpose in every model-facing string it owns, and the purpose is exactly
   what a pluggable-target architecture expects to generalize.
2. **Don't bake in a label you expect to discard.** `brunch` was assumed
   temporary, so committing to it would have meant a rename later across
   package names, the npm scope, tool names, and durable agent identities.

The second assumption no longer holds: `brunch` is expected to stick.

Carrying `bl_*` in the meantime had a cost the spec did not anticipate. `bl` is
brunch-lite's initials, so it never actually satisfied §12.3 — it only obscured
the label. And an unresolved name is worst where it is most expensive to
change: Flue's `agentName` keys durable conversation storage, so every day the
name stayed provisional was a day the eventual rename got dearer.

## Decision

Adopt `brunch` as the product name and let it appear in structure.

- **Product name**: `PRODUCT_NAME = 'brunch'` in `@brunch/core`, the single
  source every model-facing string derives from.
- **Tool prefix**: `brunch_*` — so `brunch_ask`, computed via `toolName()`,
  never written as a literal.
- **npm scope**: `@brunch/*`, keeping the spec's role-prefixed basenames
  (`@brunch/core`, `@brunch/binding-flue`, `@brunch/plugin-gherkin`).
- **Agent identity**: a **noun compound, target first**, product-prefixed:
  `brunch-gherkin-elicitor`. The next target reads `brunch-assurance-elicitor`,
  so the family sorts together.

**Concern 1 above survives intact.** The prefix names *identity, not function*:
`elicit_*` remains forbidden, and `packages/elicit-*` with it. A test in
`packages/core/test/naming.test.ts` enforces this; the corresponding ban on
`brunch` is deliberately removed there rather than left to rot.

## Why the agent identity carries the product prefix

This is the one place the prefix is load-bearing rather than cosmetic.

Flue agent identities are **global per application** and key durable
conversation storage. The demo shell (see `CONTEXT.md`) is chartered to consume
this library *and* the Petrinaut libraries in one application. A bare
`gherkin-elicitor` could collide with an agent from another library, and the
collision would land on durable storage rather than failing at boot.

The exported symbol stays the shorter `GherkinElicitor`, because it reads
better at the mount site. Flue's `agentName` static exists precisely so durable
identity and source-level name can differ.

## Consequences

- Spec §12.3's `bl_*` provisional and its "nothing bakes in `brunch`" clause
  are **superseded by this ADR**. The spec file is left unedited: it is the
  settled record of what was decided in August, and ADRs are how this repo
  records decisions taken after it.
- A future rename is still one edit for everything model-facing, because the
  derivation stayed. It is **not** one edit for `agentName` — that string is
  durable-storage-keyed, and changing it orphans existing conversations. Treat
  it as permanent.
- `plugin-assurance`, when authored, takes `brunch-assurance-elicitor`.
