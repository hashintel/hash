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
- [project-ledger.ts](./project-ledger.ts) — the fold from `LedgerState` to `LedgerProjection`: sections → kind groups → entities → claims, plus `excluded` (out-of-scope entities), `questions` (open and conflicted claims) and `addressEntries` (the snippet index used to find candidate records for a selection).
- [render-ledger-markdown.ts](./render-ledger-markdown.ts) — `renderLedgerMarkdown(projection, skin)` via md-pen; superseded claims struck through; questions as `:::question` directive blocks.
- [resolve-selection.ts](./resolve-selection.ts) — parked: `resolveSelection` (snippet-overlap matching), `opForFeedback` and `opForAnswer` (feedback → route-encoded ops).
- [worked-example.ts](./worked-example.ts) — the Brightwater support-desk fixture: 13 entities, 12 claims (a `c4`→`c5` supersession, `c10` conflicted, `c11` open, `e13` out-of-scope) and 2 reflections. Covers the main rendering branches, not every schema-valid ledger shape or feedback outcome.

Tests: `test/ledger2-projection.test.ts` with snapshots pinning both skins under `test/__snapshots__/`.

## Settled design decisions

- Section clusters and kind labels are fixed (user-approved): **Framing & objectives** (purpose/Goals, metric/Metrics, lever/Levers), **Scope & constraints** (target/Targets, direction/"Maximizations / Minimizations", optimum/Optimizations, horizon/Horizons, boundary/Boundaries, limit/Limits, threshold/Thresholds, externality/Externalities), **The system** (thing/Items, location/Locations, resource/Resources, activity/Activities, actor/Actors, rule/Policies, event/Events, flow/Sequences). Empty kinds and sections are omitted.
- Canonical kind tokens appear in agent-skin headings only, never in the user skin.
- A claim referencing several entities repeats under each one — accepted, no see-also form ("it reflects something about the way that the projection really works").
- Question choices are generic: conflicted claims offer "It holds" / "It does not hold" / "Leave it unresolved"; open claims are free-text with no choices.
- Reflections are construction-mode records and deliberately stay out of this account view.

## The parked commenting flow

The intended flow is to resolve a selection to a ledger record, retain the user's feedback against it, and translate an agreed correction or answer into a ledger operation. The current helpers only sketch that translation; they do not provide a safe write path.

Review findings (2026-10-07):

- **Both `opForFeedback` branches fail the real append schema.** The claim branch omits required `entities`; the entity branch emits `{ note }`, whereas `entity/update/<id>` replaces the full `{ name, kind, origin, status }` payload. See [../elicitation/claims.ts](../elicitation/claims.ts), [../elicitation/entities.ts](../elicitation/entities.ts), and [../append.ts](../append.ts). `LedgerOp`'s loose `Record<string, unknown>` payload hides this mismatch. An eventual translator should produce the canonical `LedgerEntry` tuple, with display rationale kept separately. Whether entity feedback proposes an entity replacement or a claim about that entity remains a product decision.
- **Feedback is not automatically a confirmed correction.** Both translators unconditionally assign `status: "confirmed"` and supersede the target. In particular, `opForAnswer(c10, "Leave it unresolved")` passes schema validation, removes `c10` from the projected questions, and replaces it with a confirmed claim saying only "Leave it unresolved". A question, a tentative comment, and a proposed correction need distinct interpretation; choice answers also need enough context to stand as claims. Preserve the distinction between source and agreement in [../shared/epistemics.ts](../shared/epistemics.ts).
- **Snippet matching finds candidates, not a unique record identity.** Selecting "agents" in the fixture matches `e4`, `e10`, `c2`, `c3`, and `c12`; equal-overlap results retain input order. Taking the first match can target the wrong record. Normalization handles case and whitespace, not Markdown: a rendered selection `Wait six minutes.` does not match source text `Wait **six** minutes.`. Generated headings/status labels have no matching snippet, and a selection can span records. The re-anchoring guarantee in the helper's comment is stronger than its implementation.
- **The live projection omits some accepted claims.** `vClaim` permits `entities: []`, but claims render only under their entities or as open/conflicted questions. A confirmed unlinked claim is accepted by `ledger_commit` and absent from `ledger_compile`'s map. Decide how to expose these records rather than treating the rendered document as a complete ledger. This affects the live agent skin, not just the parked UI.

The targeted suite passed on review (21 passed, four opt-in live-model tests skipped):

```sh
yarn workspace @apps/brunch-agent vitest run --config vitest.config.ts test/ledger2-kind-enums.test.ts test/ledger2-projection.test.ts
```

The parked-flow tests assert routes and selected fields, not acceptance by `vLedgerAppend` or the resulting projected state. Separate in-memory probes reproduced the schema failures, ambiguous/Markdown selections, and unresolved-answer transition; a probe through the real `ledger_commit` and `ledger_compile` tool implementations reproduced the missing unlinked claim. These are review findings, not fixes or additional committed regression tests.

## Where Plannotator fits

Plannotator's document-review code is open-source and independently consumable. This ledger needs its **rendered-document review components**, not its entire agent-facing application. The upstream [host-integration guide](https://github.com/backnotprop/plannotator/blob/main/packages/ui/HANDOFF.md) describes how another web app supplies its own storage, identity, uploads, and comment transport.

| Package / source                                                                                                                                                | Responsibility here                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@plannotator/ui`](https://github.com/backnotprop/plannotator/tree/main/packages/ui)                                                                           | `Viewer`, `AnnotationPanel`, selection/comment controls, themes, `Annotation`/`Block` types, and `parseMarkdownToBlocks`. This is the main integration surface.                                                                              |
| [`@plannotator/core`](https://github.com/backnotprop/plannotator/tree/main/packages/core)                                                                       | Browser-safe contracts and helpers, including question parsing/keys and annotation threading.                                                                                                                                                |
| [`@plannotator/web-highlighter`](https://github.com/plannotator/web-highlighter)                                                                                | The viewer's underlying DOM-selection capture, highlighting, and anchor restoration. It does not know ledger addresses.                                                                                                                      |
| [`@plannotator/markdown-editor`](https://github.com/plannotator/markdown-editor) / [`@plannotator/atomic-editor`](https://github.com/plannotator/atomic-editor) | Separate React/CodeMirror 6 editing surface with inline Markdown preview. Not needed for reviewing a generated ledger projection.                                                                                                            |
| [`packages/editor`](https://github.com/backnotprop/plannotator/tree/main/packages/editor)                                                                       | Plannotator's complete plan-review app and approval/feedback orchestration. A reference, not the component to embed. Code-diff review, the local server/CLI, agent adapters, and hosted Workspaces are also outside this ledger integration. |

The `ui` and `core` package manifests declare Apache-2.0; the standalone editor, engine, and highlighter declare MIT. The root repository's dual-license statement is not a substitute for checking the packages being distributed. As checked on 2026-10-07, npm's latest UI is `0.51.0` with exact core dependency `0.25.11`; upstream `main` already declares UI `0.52.0`. The prototype requests UI `^0.51.0` and core `^0.25.11`. Match integration documentation and APIs to the installed versions, not just `main`.

### Proposed host boundary

The ledger remains authoritative. Markdown is a derived review surface, not a second editable source of ledger state:

```text
accepted conversation commits
  → foldCommits → { state, revision }
  → projectLedger → renderLedgerMarkdown(..., "user")
  → parseMarkdownToBlocks → Viewer + AnnotationPanel
  → host-held comments / question answers bound to records and revision
  → interpreted, schema-valid entries → real ledger_commit
  → recorded receipt in conversation history → fold and render again
```

The first fold/render path exists; the host review/write-back path above is proposed. `prepareAppend` produces a receipt, not an independently persisted ledger mutation: `foldCommits` requires the matching tool input/output in conversation history. A browser host must preserve that durable path and user-turn provenance, rather than mutating `LedgerState` or treating a translated-op preview as a successful commit.

- **Separate visual anchors from ledger identity.** Keep Plannotator's annotation ID, quote, and selection metadata for presentation; bind the feedback separately to ledger record address(es), conversation, and the reviewed revision. Carry a mapping from rendered occurrences to records so repeated claims still address the same claim. Snippet matches can assist unresolved selections, but a host should not silently choose the first candidate. The current projection exposes snippets only, not that occurrence map.
- **Use parsed question identities.** The renderer emits `:::question` for both cases; Plannotator infers `single` when choices exist and `text` when none do. Its [`question-block` module](https://github.com/backnotprop/plannotator/blob/main/packages/core/question-block.ts) keys questions by kind plus normalized prompt and de-duplicates identical questions in document order. Bind the parsed/indexed keys to claim addresses for that revision, rather than assuming prompt text or `questionKey("single", prompt)` is sufficient. Preserve structured `QuestionAnswer` fields, including free-text `text`, selected choices, notes, and skipped state, before deciding whether an answer yields an operation.
- **Keep review decisions separate from epistemic status.** Approval of a document revision is not confirmation of every tentative claim in it. Approval, persistence, permissions, and handling feedback on a now-superseded revision belong to the host; Plannotator's controls do not define those ledger semantics.
- **Review a fixed revision first.** The viewer's DOM/quote anchors do not track arbitrary live edits in the separate CodeMirror editor. A regenerated ledger can move blocks or change text even without direct editing. Record bindings and reviewed revisions are therefore needed independently of highlight restoration. Adding direct Markdown editing would also require defining how prose edits become ledger operations.

### Integration constraints

- Import only the upstream guide's supported host surface. Broad package export wildcards also expose components that still fetch Plannotator-specific `/api/*` routes. `Viewer`'s `disableCodePathValidation` disables one such request; it is not a general offline switch.
- `configurePlannotatorUI()` supplies optional service implementations for settings, identity, assets/uploads, drafts, and external annotations. Omitted implementations retain Plannotator defaults, not the host's backend. Configure the services required by enabled features before mounting. Annotation state and ledger persistence are separate from UI settings storage.
- UI configuration is module-global and intended for a client-side app. Do not put per-user identity or services into a shared SSR process through this API.
- The UI package ships TypeScript/TSX source, declares React 19 and Tailwind 4 peers, and offers precompiled `@plannotator/ui/styles.css`; the host owns fonts and any required math assets. Use a TSX-capable bundler and verify source compilation against the host's compiler settings. The existing prototype's Vite interop settings are recorded below.

## Prototype harness

A standalone browser prototype lives at the repo root in `_scratch/ledger-view/` (gitignored; it has drifted from the committed copy and that is allowed). It renders its own fixture/projection copies with @plannotator/ui's `Viewer` + `AnnotationPanel`. It demonstrates question-card and selection callbacks feeding a "Translated ledger ops" rail; it does not call the real commit tool, persist feedback, or reproject accepted changes. This is a UI-to-operation-preview demonstration, not end-to-end ledger write-back proof.

Source review also found that its question map hardcodes `questionKey("single", prompt)` for every question, while the open question parses as `text`, and its `answerText` helper omits `QuestionAnswer.text`. Free-text question answers therefore cannot reliably reach the preview. It also picks the first selection candidate. Do not copy those adapters unchanged into a host. The browser prototype was not rerun as part of this review.

Operational notes a new agent will need:

- It sits at the repo root because the root `package.json` workspaces glob `apps/**` is recursive — a nested `package.json` under `apps/` becomes a yarn workspace, and yarn quarantines the @plannotator packages.
- Install with pnpm only (`cd _scratch/ledger-view && pnpm install`); npm chokes on the root `patch:` protocol and bun walks up and installs into the monorepo root.
- Run: `./node_modules/.bin/vite --port 5199`.
- `vite.config.ts` needs `optimizeDeps.include` for `use-sync-external-store/shim{,/with-selector}` and `@plannotator/ui > @plannotator/web-highlighter` (the ui package ships TS source; its CJS transitive deps need prebundle interop). Re-opt with `--force` after changing it.
- Plannotator gotchas: the parser renders `**bold**` but ignores `__bold__`; `Viewer` requires `blocks` (`parseMarkdownToBlocks`) and a `mode` (`"selection" | "comment" | "redline" | "quickLabel"`); `AnnotationPanel` props are `isOpen`/`blocks`/`onSelect`/`selectedId`; question `kind` is `"single" | "multi" | "text"`; question choices split on `label — description`.

## Continuing this work

1. Resolve the translator semantics and missing-record coverage above. Pin regression cases for schema-valid feedback, "Leave it unresolved", tentative comments, ambiguous/Markdown selections, free-text question identity/value, and unlinked claims. Do not make the existing parked helpers a write path unchanged.
2. Give the user skin a host surface over a specific folded revision, with explicit record bindings and host-owned annotation state. Keep Plannotator rendering in that frontend; the Brunch application must remain independent of Petrinaut UI.
3. Exercise one feedback/answer through the real `ledger_commit` in [../ledger-tools.ts](../ledger-tools.ts), its recorded history receipt, and the next rendered projection. Acceptance means both a valid operation and the intended resulting ledger state, not just the tuple appearing in the preview rail.
4. If the host is the Petrinaut panel, teach its Ledger tab to fold ledger2 commits (it currently reads v1, so manual-arm runs show an empty pane).
