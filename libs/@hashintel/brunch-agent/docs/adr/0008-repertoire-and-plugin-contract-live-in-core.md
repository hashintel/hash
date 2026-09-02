# ADR-0008: Repertoire and plugin contract live in core

Date: 2026-08-26
Status: accepted 2026-08-26 (Lu)
Amends: [ADR-0007](0007-harness-teaching-meets-plugin-content-at-fixed-keys.md),
decision 8 (`packages/repertoire` is replaced by a guarded core subpath)
Preserves: ADR-0007 decisions 1–7 and 9; the repertoire remains harness-owned,
plugins fill cells without importing it, and the catalogue still converges by
co-authoring
Decided on: the `ln/w4-topology` branch, from the package-direction audit
commissioned by [S-011](../control/STRATEGY-LOG.md#s-011)

## Context

ADR-0007 gave the harness's default teaching a package so the concept had an
executable owner rather than another prose-only home. The implementation proved
that ownership, but the package boundary is not carrying an independent
architectural role.

The key catalogue, Valibot plugin-definition schema, emitted JSON Schema,
repertoire schema and reader, and instruction renderer all live in
`@hashintel/brunch-agent`. The separate
`@hashintel/brunch-agent-repertoire` workspace contains one YAML document and a
one-line load through core's `readRepertoire`. It has no runtime, deployment,
versioning, or consumer boundary of its own. A Flue binding and the baseline
evaluation import it only to obtain the harness's default prompt data.

Keeping that workspace makes a core concern look like a peer package and adds
manifest, build, lint, test, and dependency wiring without strengthening the
rule that matters: plugins must not import the repertoire. Moving the default
onto core's root export would remove the workspace but weaken that rule in the
other direction. Core's root is the plugin SDK, so every plugin is allowed to
import it; a root-exported repertoire would make the forbidden dependency
architecturally ordinary.

## Decision

1. **The repertoire is core-owned prompt data.** Remove the
   `@hashintel/brunch-agent-repertoire` workspace. Its default content and
   module-load validation move into `@hashintel/brunch-agent`.

2. **Default teaching has a guarded subpath.** Core exports the loaded default
   as `@hashintel/brunch-agent/prompts`. Bindings and evaluation composition may
   import that subpath. Plugin packages may not import it. The root
   `@hashintel/brunch-agent` export remains the plugin SDK and harness
   mechanism; it does not export the default repertoire.

3. **The plugin contract already belongs to core.** The key catalogue,
   `PluginDefinitionSchema`, readers, repertoire shape, emitted
   `schema/plugin.schema.json`, and schema changelog stay in core. This decision
   creates no schema package and no public `schemas` subpath.

4. **Package ownership is the whole decision.** This record does not reorganise
   core into `loop/`, `prompts/`, `schemas/`, or `skills/` directories. Those
   names remain possible internal roles, not accepted folders. A later move
   needs concrete pressure from the files it would separate rather than this
   package correction as a pretext.

5. **The direction is executable.** The architecture suite must fail while the
   standalone repertoire workspace exists, require the `./prompts` core export,
   and reject a plugin source import of that subpath. It continues to require
   plugins to resolve core only and core to import no substrate.

## Rejected alternatives

- **Keep the repertoire workspace.** Rejected because the package contains data
  plus a thin loader around types and behavior already owned by core. It
  encodes no independently useful boundary.
- **Export the repertoire from core's root.** Rejected because the root is the
  plugin SDK. Plugins could then import harness defaults through their one
  permitted dependency, making ADR-0007's ownership direction invisible to the
  package graph.
- **Restructure all of core now.** Rejected because the package audit proves one
  boundary is premature; it does not prove the flat internal modules have
  become hard to navigate or need four new directory boundaries.

## Consequences

- Bindings and the baseline evaluation replace their repertoire-package import
  with `@hashintel/brunch-agent/prompts`; plugin imports remain unchanged.
- The repertoire workspace, its manifest and workspace dependency edges are
  removed in one mechanical move. The key catalogue and its changelog do not
  move.
- That move reconciles the package topology in the elicitation-kernel spec and
  its living topology reference. The driver reconciles `CONTEXT.md` and
  `docs/INDEX.md` when the lines rejoin; until then this record owns the
  accepted shape where those files still name `packages/repertoire`.
- The plugin co-authoring stream keeps the current layout until this decision
  is accepted, then takes the mechanical move between cycles; the move changes
  no key or repertoire text.
- Removing a workspace is not proof by itself. The import-direction
  architecture test is red on the old topology and green only when the guarded
  subpath and plugin prohibition both hold.
