# Ledger projection

The Ledger's user-facing projection: committed ledger2 records folded into one deterministic sectioned structure ([project-ledger.ts](./project-ledger.ts)) and rendered to markdown in two skins over that one shape ([render-ledger-markdown.ts](./render-ledger-markdown.ts)). The `user` skin is clean prose; the `agent` skin adds record addresses (`e23`, `c45`) and canonical kind tokens inline so freeform references resolve identically for both parties. Public entry: [../projection.ts](../projection.ts).

## What is live and what is parked

Live:

- `ledger_compile` ([../ledger-tools.ts](../ledger-tools.ts)) renders the agent skin as its `map` output, over the fold in [../commits.ts](../commits.ts).
- The persona harness reads a manual-arm run back through the same pair (`foldCommits` → `projectLedger` → `renderLedgerMarkdown(…, "agent")`) in `src/evaluations/persona/ledger-evidence.ts`.

Parked (design-only, nothing mounts it):

- The user skin. It waits for a host surface — a web view or the Petrinaut panel's Ledger tab, which still folds v1 commits.
- The commenting flow in [resolve-selection.ts](./resolve-selection.ts): resolving a selection in the rendered view back to its record and translating feedback or a question answer into route-encoded ledger operations.

## File map

- [records.ts](./records.ts) — `LedgerState` and the committed record shapes (`EntityRecord`, `ClaimRecord`, `ReflectionRecord`, `Turn`), typed against the real payload schemas in [../elicitation/](../elicitation/), [../construction/](../construction/) and [../shared/](../shared/). This is also the state the fold in [../commits.ts](../commits.ts) produces, so the projection consumes fold output directly.
- [project-ledger.ts](./project-ledger.ts) — the fold from `LedgerState` to `LedgerProjection`: sections → kind groups → entities → claims, plus `excluded` (out-of-scope entities), `questions` (open and conflicted claims) and `addressEntries` (the snippet map that makes selections resolvable).
- [render-ledger-markdown.ts](./render-ledger-markdown.ts) — `renderLedgerMarkdown(projection, skin)` via md-pen; superseded claims struck through; questions as `:::question` directive blocks.
- [resolve-selection.ts](./resolve-selection.ts) — parked: `resolveSelection` (snippet-overlap matching), `opForFeedback` and `opForAnswer` (feedback → route-encoded ops).
- [worked-example.ts](./worked-example.ts) — the Brightwater support-desk fixture: 13 entities, 12 claims (a `c4`→`c5` supersession, `c10` conflicted, `c11` open, `e13` out-of-scope) and 2 reflections. Exercises every rendering branch.

Tests: `test/ledger2-projection.test.ts` with snapshots pinning both skins under `test/__snapshots__/`.

## Settled design decisions

- Section clusters and kind labels are fixed (user-approved): **Framing & objectives** (purpose/Goals, metric/Metrics, lever/Levers), **Scope & constraints** (target/Targets, direction/"Maximizations / Minimizations", optimum/Optimizations, horizon/Horizons, boundary/Boundaries, limit/Limits, threshold/Thresholds, externality/Externalities), **The system** (thing/Items, location/Locations, resource/Resources, activity/Activities, actor/Actors, rule/Policies, event/Events, flow/Sequences). Empty kinds and sections are omitted.
- Canonical kind tokens appear in agent-skin headings only, never in the user skin.
- A claim referencing several entities repeats under each one — accepted, no see-also form ("it reflects something about the way that the projection really works").
- Question choices are generic: conflicted claims offer "It holds" / "It does not hold" / "Leave it unresolved"; open claims are free-text with no choices.
- Reflections are construction-mode records and deliberately stay out of this account view.

## The parked commenting flow

The projection is the re-anchoring oracle: every rendered span derives from one record, so `resolveSelection` matches a selection's `originalText` against `addressEntries` snippets and recovers the address regardless of DOM-anchor drift. `opForAnswer` settles an open or conflicted claim with a superseding confirmed claim; `opForFeedback` supersedes a claim or, for entities, emits `entity/update/<id>`.

Known rough edge: the entity branch of `opForFeedback` emits a `{ note }` payload that does not satisfy `vEntity` (which requires name/kind/origin/status). It is a sketch; entity feedback likely becomes a claim about the entity instead. Resolve this before mounting.

## Prototype harness

A standalone browser prototype lives at the repo root in `_scratch/ledger-view/` (gitignored; it has drifted from the committed copy and that is allowed). It renders the worked example with @plannotator/ui's `Viewer` + `AnnotationPanel` and proved both feedback loops end-to-end: a question-card answer translates to `["claim/create", { supersedes: ["c10"], … }]`, and a text-selection comment resolves to `c9` and translates to a superseding claim — both shown in a "Translated ledger ops" rail.

Operational notes a new agent will need:

- It sits at the repo root because the root `package.json` workspaces glob `apps/**` is recursive — a nested `package.json` under `apps/` becomes a yarn workspace, and yarn quarantines the @plannotator packages.
- Install with pnpm only (`cd _scratch/ledger-view && pnpm install`); npm chokes on the root `patch:` protocol and bun walks up and installs into the monorepo root.
- Run: `./node_modules/.bin/vite --port 5199`.
- `vite.config.ts` needs `optimizeDeps.include` for `use-sync-external-store/shim{,/with-selector}` and `@plannotator/ui > @plannotator/web-highlighter` (the ui package ships TS source; its CJS transitive deps need prebundle interop). Re-opt with `--force` after changing it.
- Plannotator gotchas: the parser renders `**bold**` but ignores `__bold__`; `Viewer` requires `blocks` (`parseMarkdownToBlocks`) and a `mode` (`"selection" | "comment" | "redline" | "quickLabel"`); `AnnotationPanel` props are `isOpen`/`blocks`/`onSelect`/`selectedId`; question `kind` is `"single" | "multi" | "text"`; question choices split on `label — description`.

## Continuing this work

1. Give the user skin a host surface and mount the commenting flow behind it: render, let the host resolve selections and answers through `resolveSelection`/`opForAnswer`/`opForFeedback`, and submit the resulting entries through the real `ledger_commit` in [../ledger-tools.ts](../ledger-tools.ts).
2. Resolve the `opForFeedback` entity-payload rough edge above.
3. Teach the Petrinaut panel's Ledger tab to fold ledger2 commits (it currently reads v1, so manual-arm runs show an empty pane).
