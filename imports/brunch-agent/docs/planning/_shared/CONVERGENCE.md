# Convergence trace: kernel spec ↔ built system, and the seam between the maps

Two root maps are live, with considerable technical design overlap and — until this document —
no record coordinating them. **FE-1383** ("Build the elicitation harness to milestone one") is
the implementation map: the elicitation-kernel effort closed 2026-08-10 with a settled spec
([`elicitation-kernel/spec.md`](../elicitation-kernel/spec.md)), and FE-1383's sub-issues
(FE-1384–FE-1396) are its vertical slices, each naming the spec sections it implements —
FE-1388/89/90 are the ones landed so far. **FE-1357** ("Plan the September elicitation demo and
the plugin spec behind it") is the planning map for the demo and the process-model plugin: it
has produced decisions and observation documents (`process-model-elicitation/`), and — as of
2026-08-18 — the first spec-shaped artifact: FE-1405 closed with ADR-0003 (three-register IR)
and the provisional plugin-contract spec
([`process-model-elicitation/plugin-contract-spec.md`](../process-model-elicitation/plugin-contract-spec.md));
the ratification pass that removes the provisional marker is tracked as FE-1431.

This document does three jobs neither map does. First, the **obligation-level status ledger**:
FE-1383's tickets name spec sections but don't record per-obligation status — what is partial,
what quietly contradicts the spec, what an implementation choice adjudicated without a record.
Second, the **seam section**: the coordination record between the two maps, whose absence let
work fall in the crack (the §11.5 quiver, FE-1406) and left cross-cutting design facts (the
status-arity answer, envelope amendment pressure) with no home either map owns. Third, the
**cross-map sequencing section**: each map sequences its own issues with blocking relations,
but nothing orders work *across* the maps — that strategy is evaluated and revised here, since
it is precisely the thing no single map can own.

The arc so far, compressed: the spec and its re-renderings (FE-1374) → the demo-vehicle and
use-case recommendations (FE-1362/63, FE-1357-side) → workspace and gates, twice hardened
against their own silent failures (FE-1388, FE-1399, FE-1400) → the IR definition and its
validations (FE-1364, FE-1397, FE-1361, FE-1357-side) → the first product machinery: the
walking skeleton (FE-1389) and the capture store (FE-1390, both FE-1383-side).

Per-map sequencing stays in Linear — this document does not restate either map's internal
order. What it owns is the rest: what is discharged, what is partial, where implementation and
spec disagree, what sits between the maps, and in what order the open work across both maps is
best discharged. Maintenance rule (see
[`../../agents/legibility.md`](../../agents/legibility.md)): rows update in the same change that
lands the discharging branch; sweep-ticket accruals (FE-1401-style) consolidate here rather
than terminating in comments. Fine-grained evidence lives in the deep-read notes:
[`process-model-elicitation/notes/deep-read-fe-1389.md`](../process-model-elicitation/notes/deep-read-fe-1389.md),
[`process-model-elicitation/notes/deep-read-fe-1390.md`](../process-model-elicitation/notes/deep-read-fe-1390.md),
and the rendering
[`process-model-elicitation/capture-store-plain.md`](../process-model-elicitation/capture-store-plain.md).
The FE-1391/FE-1386 substrate evidence lives in
[`legibility-sweep/flue-entry-projection-source-read-2026-08-18.md`](../legibility-sweep/flue-entry-projection-source-read-2026-08-18.md).

Status vocabulary: **discharged** (built and proved; commit/branch named) · **partial** (built
with named gaps) · **pending** (nothing built; expected) · **superseded** (an ADR changed the
obligation) · **orphaned** (owned by no map or ticket — a finding) · **contradicted**
(implementation conflicts with spec; both sides named).

## Architecture & shipping shape (§4, §12)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Shell separation: plugins→core only; core imports no substrate; binding imports both | §4, §12.2 | **discharged** | boundary gates (FE-1388/FE-1399, `test/boundaries.test.ts`); `workspacePackages()` derives groups from manifest; `plugin-gherkin` imports `@brunch/core` only |
| Package topology | §12.2 | **partial** | `core` (+`testing` subpath), `binding-flue`, `plugin-gherkin`, `apps/dev` exist; `plugin-assurance` pending. Topology pin derives from §12.2 itself (FE-1400 `ef00201`) |
| Core *is* the harness (mechanism lives in core) | §12.2, §14.2 | **discharged** | FE-1422 (`ln/fe-1422-ask-protocol`, 2026-08-18) moved affordance minting, the one-live guard, reply-binding signal, and instruction assembly into `packages/core/src/ask-protocol.ts`; `binding-flue` now supplies Flue hook wiring |
| Tool naming: identity not function | §12.3 | **superseded → discharged** | ADR-0001 replaces `bl_*` with `brunch_*`; `toolName('ask')` → `brunch_ask`; `elicit_*` ban enforced |
| Valibot at every boundary | §12.4 | **discharged** | core + binding schemas throughout |
| SDK surface (anchoring, retries, tracing, arbitraries, simulation harness) | §12.4 | **pending** | none built; owned by FE-1393 (FE-1383 slice), export-surface ratification gated on the contract freeze (FE-1387) |
| Host-authored thin agent calling `useElicitation(plugin)` | §12.1 | **discharged** | `apps/dev/src/agents/gherkin-elicitor.ts` (FE-1389) |
| Dev app's three roles (dev loop, target gallery, probe surface) | §12.5 | **partial** | dev loop only (FE-1389 chat UI); gallery and probe surface owned by FE-1385 (FE-1383 slice, backlog) |
| CI smoke: no model key, no network, no flake | §12.5 | **discharged** | faux-provider integration test through real runtime + real Hono app (FE-1389); the smoke workflow itself never executed until FE-1400 `699ebe4` un-killed it (org policy vs. tag-pinned actions). Hermeticity probed, not assumed: explicit `start()` config leaves the dev db untouched across the run (Flue audit, 2026-08-17) |
| Remote-parity constraints (pinned agentName, storage outside plugin, no dynamic agents) | §12.5 | **discharged** | pinned-identity gates (FE-1399/FE-1400); storage port in binding (FE-1390) |
| Version axes | §12.6 | **pending** | named, none implemented — as spec states |

## Capture envelope (§5)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Envelope fields: minted id + content dedup key (status excluded), spans, epistemic status, confidence, value XOR absence, alternatives, one `supersedes` | §5 | **discharged** | `packages/core/src/capture-store.ts` (FE-1390); invariants 9/10 pinned by named tests |
| No stored status; derived at read time (C3) | §5 | **discharged** | `deriveCaptureStatus`/`deriveIssueStatus`; tests assert no `status` field persisted |
| Retraction: explicit user-cited event, no successor | §5 | **discharged** | `RetractionEvent` (FE-1390) |
| Pointer **derived by the harness**; model cites quotes, never sequence numbers | §5, §8.2 | **discharged** | FE-1391 split caller `EvidenceQuote` from persisted `EvidenceSpan`: every evidence command accepts verbatim quotes only, resolves once against the session archive, and stores an archive-owned ordinal range; extra pointer/source fields are refused |
| Confidence qualitative, never a scalar | §5 | **partial** | non-empty string only; `"0.93"` accepted. Vocabulary is settled by the plugin-contract spec as `firm | hedged | speculative`; its proposed store refusal rule for numeric-parsing strings remains to implement |
| Six absence states; `not-mentioned` computed, never stored | §5.1 | **discharged** | `ABSENCE_STATES` (FE-1390) |
| Reserved reply encoding for structured taps (C4) | §5.1 | **pending** | UI sends bare text; absences from this UI are honestly `inferred` |
| One epistemic status per capture | §5 | **discharged**, with named friction | Status is the proposal union's discriminant, coupled to provenance shape — per-field status is unrepresentable, and payload-smuggling it breaks dedup identity. This was FE-1405's central input (deep-read FE-1390, tiering section); the arc consumed it *without* amendment — one status per capture survives, and the structure that wanted per-field status lives below it in proposal interiors (ADR-0003, plugin-contract spec) |

## Operations & validation (§6)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| `project` + typed loss report; `validate`; optional `reconcile`; purity (C2) | §6.1 | **pending** | no plugin operations exist; `plugin-gherkin` is `{name, targetDomain}` only |
| Envelope-level refusals (provenance, XOR, single-hop supersession) | §6.2 | **discharged** | FE-1390 command surface |
| Citations resolve to true user entries (store-level refusal) | §6.2 | **discharged at the store boundary** | FE-1391 resolves quote-only inputs against archived public messages, derives source from binding-classified entries, refuses injected non-user matches, and proves pointer retrieval through the real mounted router. FE-1392 still owns refresh-before-apply orchestration |
| Duplicate detection free for flat-record plugins | §6.2 | **partial** | near-identical advisory fires for string payloads only; a flat record gets none |
| Issues typed + namespaced to producer (invariant 6) | §6.3 | **partial** | all seven types, origin variants present; producer self-declared, unauthenticated |
| Advisories computed, ephemeral, never stored | §6.3 | **discharged** | returned in results, never in snapshot (FE-1390) |
| Cadence as policy (§6.4) | §6.4 | **pending** | no orchestration exists |

## Questioning UX (§7)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| No exchange-pair ontology | §7.1 | **discharged** | affordances as entries; retired vocabulary absent |
| Three baseline forms + questionnaire chaining | §7.2 | **partial** | free-text only, by design (FE-1389); remainder owned by FE-1395 |
| Markdown floor: unknown forms still render | §7.2 | **contradicted** | dev UI `safeParse`s the whole concrete form and renders nothing on failure (`apps/dev/src/ui/chat.tsx`); needs envelope-only schema. Filed FE-1420 |
| One live affordance; durable identity on tool output part; channel as live-render sugar (C6) | §7.3 | **discharged** | updater-form guard + `output` part + channel write (FE-1389); *retry hole*: a re-executed ask (at-least-once tools) is refused as a duplicate — FE-1420 |
| No instruction interpolation; mechanical reply binding via signal; no echo token (C7) | §7.4 | **discharged** | render-invariant instructions; `affordance-reply-bound` signal (FE-1389); wake-wart gap retired for the observed path; §14.5's future-write-paths clause has its own ledger entry again (`wake-wart-write-paths`, owned by FE-1392) |
| Transport outcomes `answered / redirected / unanswered` | §7.5 | **pending** | slot clears unconditionally; no outcome recorded. FE-1420 (abandoned asks) |
| Interpretation render | §7.6 | **pending** | open in `test/open-gaps.ts` (FE-1394) |
| Outbound rich / inbound string; UI filters on `purpose`/`display` | §7.7 | **discharged** | FE-1389 |

## Capture mechanics (§8)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Settlement trigger + judgment | §8.1 | **pending** | no `useAgentFinish`, no trigger; FE-1389 and FE-1390 touch only via the `'user-affordance-payload'` literal — two bridge ends, no middle span (rendering strain #3). Owned by FE-1392 |
| Harness-resolved anchoring at sweep application | §8.2 | **discharged** | FE-1391 resolves exact quotes against archived user entries at command application; no match returns a repair hint, multiple matches choose latest with an advisory, and injected non-user matches refuse |
| Sweep idempotence, content-keyed | §8.3 | **discharged** (store side) | dedup key + three-way skip logic (FE-1390); no sweep producer exists |
| Single-hop supersession over active heads; stale-session guard | §8.4, §9.2 | **discharged** | refusal carries `currentHeadIds` (FE-1390) |
| Resolution records close conflicts; user-cited | §8.5 | **discharged** | FE-1419 (`ln/fe-1419-contract-closure`): conflicts open only over two-plus distinct active captures, referenced captures are pinned until a user-cited resolution frees them, resolutions compare by set equality, and every accepted command round-trips through the persisted parser. The one-reference and supersession-stranding holes are closed and red-proved. The tap-evidence adjudication (contradicted row below) remains open |
| Resolution evidence may be a structured tap | §5.1/C4 vs. §8.5 | **contradicted** (silent adjudication) | `resolve-conflict` rejects `user-affordance-payload` evidence — a user who resolves a conflict by tapping a choice strip cannot close it. Defensible strict reading of §8.5; made without a record. FE-1395's body owns the other half of the same fact (tap-ness must be a transport fact); neither ticket references the other — seam item |
| Unaccounted-ask advisory | §8.6 | **pending** | FE-1420 |
| Resume-time sweep reconciliation | §8.7 | **pending** | — |

## Sessions & durability (§9)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Durable target-document, transient sessions, sweep the only bridge | §9.1 | **partial** | store is session-independent (FE-1390); dev UI mints a fresh document per page load, so many-sessions-one-document is unreachable from any surface (deep-read FE-1389) |
| Per-session state = evidence log, swept high-water mark, pending-affordance slot | §9.2 | **partial** | pending slot exists (FE-1389) and the durable session-log archive exists (FE-1391); swept high-water remains pending FE-1392 |
| Re-entry briefing; user-visible insertion notice | §9.3 | **pending** | signal carrier proved; no briefing; the one injected signal is filtered out of the UI. Owned by FE-1396 |
| Only the true user's side is evidence; injected entries structurally non-user | §9.4 | **partial** | FE-1391 verifies role/purpose against the public projection, refuses signal/advisory text, and classifies affordance replies only from the harness-owned reply-binding signal. The kickoff remains a machine-authored `user` entry until FE-1420/FE-1385 move it to `useInitialData`; FE-1396 still owns briefing-never-evidence |
| Completion derived, never a gate | §9.5 | **pending** | — |
| Storage port: harness-defined, binding-implemented, plugin-blind (C1) | §9.6 | **discharged for the local target** | core owns capture/archive/anchoring semantics; `binding-flue` owns the file implementation; plugins cannot import the binding (FE-1390 + FE-1391) |
| Port scope includes the session-log archive | §9.6 | **discharged** | FE-1391 provisions a versioned target-document record containing capture state and session logs, migrates the legacy capture-only shape on mutation, parses both halves on read, identity-versions evolving messages, and retrieves every cited ordinal independently of Flue |
| Compaction vs. durable log | §9.7 | **partial — source-settled, behavioral pin open** | Flue 2.0.3's append-only stream contract and implementation show compaction appends a canonical record, rewrites only model context, preserves the public message projection, and leaves `state_write` reduction untouched. The source-read record reshapes FE-1386 to one upgrade pin; `test/open-gaps.ts` remains until behavioral proof lands |

## Binding capabilities (§10)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Caps 1–5: tool, instructions, persistent state, affordance emission, suspend-for-reply (absorbed) | §10 | **discharged** | all five exercised against the real runtime (FE-1389 integration test) |
| Caps 6–8, incl. entry-projection read | §10 | **partial — cap 8 discharged** | FE-1391's binding reader calls public SDK `history()` through a host-injected full URL resolver and fetch transport, maps only materialized public messages, and archives each read with identity-keyed versions. The walking skeleton pins the actual mounted-router custom-fetch path; FE-1392 owns the narrower refresh-before-sweep gap and cap 6/7 callers |

## Plugins, packs, dev targets (§11, §13)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Plugin ownership: packs, forms, validators | §11.1 | **partial** | `definePlugin` exists; `plugin-gherkin` declares name + targetDomain only; `targetDomain` reaches the prompt as a raw slug |
| Pack form, Principle v2 | §11.2 | **pending** | — |
| Smallest honest plugin as a standing bar | §11.3 | **partial** | held informally (FE-1389 kept the plugin surface at two fields); no test encodes it |
| Generic strategy quiver | §11.5 | **pending** (ownership repaired) | was **orphaned** — named-not-designed, carried by no map — now FE-1406 (root issue) |
| Portfolio + hybrid order: both packs authored before the pack interface freezes | §13 | **pending** | Owned by FE-1387 (FE-1383 slice, backlog), explicitly gated on FE-1357's second-target decision — the inter-map seam in miniature (see the seam section). Gherkin wiring ahead stays legal while FE-1387 holds the freeze |
| Gherkin validation (parse validity, step lexicon) | §13.1 | **pending** | — |
| Assurance target (Statement record, four edges, five-stratum derivation, ledger) | §13.2–13.3 | **pending** | — |

## Acceptance material (§14)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Invariants 2, 4, 5, 7, 9, 10 | §14.1 | **discharged** | named tests in `capture-store.test.ts` (FE-1390), one hand-written example each |
| Invariant 1 (no value without provenance) | §14.1 | **partial** | structural (span/basis shapes required); pointer truth unverified |
| Invariant 6 (issues namespaced) | §14.1 | **partial** | namespace stored, producer unauthenticated |
| Invariants 3, 8 (projection loss, equivalent projection) | §14.1 | **pending** | no `project` exists |
| Five proof obligations; smallest-honest + second-binding tests | §14.2 | **partial** | smallest-honest holding; FE-1422 repaired the ask protocol's second-binding failure by moving portable mechanism to core. No literal second binding exists yet |
| Gating tests (reprojection, minimal pairs, black-box authoring) | §14.3 | **pending** | — |
| Generation-first fixtures, `arbitraryFromSchema`, `fc.commands` | §14.4 | **pending** | both new suites are hand-written examples; no fast-check anywhere. Owned by FE-1384 (FE-1383 slice, backlog) |
| Open verification items tracked with homes | §14.5 | **discharged** (as a mechanism) | `test/open-gaps.ts` ledger: an entry's existence is the open claim, and the commit that lands the behavioural proof deletes the entry (FE-1419 commit 1, replacing the citation-token inference of FE-1400 `7ae3d45`). Note: the wake-wart entry's deletion (FE-1389) discharged the *observed* path only; the broader clause is re-entered as `wake-wart-write-paths` (FE-1392) |

## Vocabulary drift (CONTEXT.md as authority)

All five drift findings below were **repaired in CONTEXT.md** during the remediation sweep
(2026-08-17); the rows record what drifted and how the glossary now handles it.

| Term | Status | Evidence |
| --- | --- | --- |
| "Walking skeleton" | repaired | glossary said *prototype*; the referent is a durable CI gate. Entry now names the proof shape, not a disposal policy, and marks the FE-1389 test do-not-weaken |
| "Sweep" | repaired (collision named) | spec: a pass that *produces* captures; `capture-store.ts`: `apply-sweep` stores them. Glossary entry now carries the disambiguation; the producing pass is FE-1392's |
| "Storage port" | repaired | the term appears nowhere in code; glossary entry now points at the `CaptureStore` type by path |
| "core" | repaired (exemption) | the avoid-list now exempts the package path `packages/core` (§12.2); avoidance applies to "core" as a prose shell name |
| `basis` | repaired (entry added) | coined by FE-1390 for what spec §5/C5 states in prose; now a glossary entry, with the status–provenance coupling noted under Epistemic status |

## The seam between the maps

FE-1383 builds the harness against the settled kernel spec; FE-1357 plans the demo and the
process-model plugin spec that will run on that harness. Neither owns the seam, and everything
below lives on it — this list is the coordination record their overlap has lacked:

- **The contract freeze.** FE-1387 (FE-1383's last slice) must not freeze the plugin contract
  until a second, harder target has stressed it — and which target that is depends on decisions
  still resolving on FE-1357. FE-1383's own body names this dependency; nothing on FE-1357's
  side names it back.
- **Payload interiors (FE-1405 — closed 2026-08-18).** The plugin spec's field-level schemas
  are FE-1357-side work, but the envelope facts they must respect are FE-1383-side code: the
  status-arity answer (one epistemic status per capture, coupled structurally to provenance
  shape — §5 row above) was discovered in FE-1390's type system, and any amendment touches the
  proposal union, the dedup key's exclusion rule, and the explicit-requires-span guarantee
  together. The arc settled *without* amending the envelope — ADR-0003 and the provisional
  plugin-contract spec put the structure below the status, in proposal interiors. One confirmed
  pressure stays on this seam: **absence captures carry no locator** — the fold needs every
  absence addressed to a fold-table coordinate (anchor × slot), and today that address rides in
  payload convention only (three C1 worked cases in the spec's open-strains section). Recorded
  here rather than forked around; if it hardens into an envelope amendment, that is FE-1383-side
  work.
- **Envelope amendment adjudications.** FE-1390 silently adjudicated that `resolve-conflict`
  rejects structured-tap evidence (contradicted row, §8.5 vs §5.1/C4) — a harness ruling with
  direct consequences for FE-1357's interview UX. Amendments of this kind need a home both maps
  can see; today this trace is that home.
- **The quiver (FE-1406).** The original crack casualty: envelope-vocabulary elicitation
  guidance, harness-shipped (§11.5, kernel-side) but authored with plugin-spec methods
  (FE-1403, FE-1357-side). Repaired to a root issue; the pattern it exposed is this section's
  reason to exist.
- **Super-map question** (penciled item 6): whether these cross-cutting concerns get their own
  chartered map is a decision parked for the 18 Aug integration discussion; until then this
  section is the interim record.

## Cross-map sequencing (living — re-evaluate when rows above change)

Each map orders its own issues; nothing in Linear orders work across them. This section is
that strategy, with its reasoning, revised as things land. As of **2026-08-18 (fourth
evaluation, after FE-1405 and FE-1391 implementation)**. FE-1405 closed the interiors arc with
ADR-0003 and the provisional plugin-contract spec. The accepted build opener also crossed its
source and implementation gates without reordering: FE-1422 repaired ask placement, and FE-1391
removed caller-supplied ranges, landed the public-history reader and durable archive, and cleared
FE-1392's provenance dependency. FE-1386 remains a narrow behavioral compatibility pin because
a genuine main-conversation compaction requires test-agent/model setup outside FE-1391's natural
reader/archive path. FE-1393/1402/1403/1407 now hold named plugin-spec inputs.
Ledgers: [`remediation-plan-2026-08-17.md`](../legibility-sweep/remediation-plan-2026-08-17.md); placement rules:
[`topology.md`](topology.md).

**Ordering principle.** Discharge epistemic dependencies before functional ones: prefer the
work that retires cross-map risk — where one map's open decision silently shapes the other
map's build — over work that merely extends one side. Second principle, new: **read before
building** — every slice with a paraphrase-grade dependency runs its Ledger-B resolution step
(types/raw docs/probe) at start, not mid-build.

### Issue glosses

**FE-1383 side (build).** All agent-buildable unless noted.

| Issue | What | Why | How / weight |
| --- | --- | --- | --- |
| FE-1391 | Harness-resolved anchoring, durable entry projection, session-log archive | **Implemented locally.** Converts declared provenance into verified provenance and un-forecloses §9.6 | Public `history()` over host-injected URL/fetch; archive-owned ordinal pointers with Flue ids as provenance; distinct versions for evolving messages; versioned/migrating local target-document record; quote-only command input |
| FE-1392 | Settlement trigger + sweep — the first captured statement | The missing middle span (rendering strain #3): after this the system genuinely elicits, and every store guarantee gets its first real caller | De-risked by documented affordances: `useAgentFinish` trigger seam, `useSubagent` (= capability 6), durable tool steps. Prerequisite: the ask-protocol extraction (FE-1422) lands first so sweep mechanism starts in core (`sweep-protocol`, topology N1); raw-doc check on `useSubagent` at start (B3); wake-wart ledger entry's assertion lands with its writes |
| FE-1393 | Plugin SDK + gherkin plugin — first projected artifact + loss report | Makes the contract programmable-against; explicit non-goal: no freeze (two-targets rule) | Medium, after FE-1392; §12.4 SDK items live here. Absorbs at its design moments: origin minted by op context (A6), flat-record advisory (A7), plugin displayName (A9) |
| FE-1394 | Conflict, supersession, interpretation render | Exercises the correction machinery in UX; FE-1419's conflict fixes are its substrate; closes the §7.6 gap | Needs FE-1392's captures to mean anything |
| FE-1395 | Full affordance set + absence strip | Tap-ness as a *transport fact* — the same evidence-grade question FE-1390 adjudicated silently (§8.5 contradicted row); markdown-floor consumer of FE-1420's fix | Independent of the sweep line; can parallelize |
| FE-1396 | Re-entry briefing, resume, restart durability | Makes many-sessions-one-document real (§9.1); briefing-never-evidence is a provenance invariant | Consumes FE-1391's archive |
| FE-1387 | Second pack + **contract freeze** | The seam's hinge. Its own body: if the second target is the process-model plugin (the FE-1362/FE-1364 trajectory), this is demo-critical path, not cleanup | Gated on the target decision (18 Aug), then heavy authoring |
| FE-1386 | Compaction vs. durable projection | Flue 2.0.3 source settles the architecture: compaction appends a canonical record, rewrites only model context, and preserves public history plus persistent state | Still one behavioral upgrade pin: cross a real main-conversation compaction boundary and deep-compare complete messages/settlements, persistent state, and an FE-1391 archive pointer. Not folded into FE-1391 because exposing a genuine compaction trigger requires separate test-agent/model setup |
| FE-1385 | Dev app gallery + diagnostic probe surface | The probe surface is machinery legibility in-product (this session's theme); gallery serves demo prep | Any time after FE-1392. Now also owns the `@flue/react` adoption (divergence risk 1) — FE-1420's markdown-floor fix rides it; probe surface = `observe()` events, per-agent folders arrive here |
| FE-1384 | Generative corpus over the replay driver | The ten invariants are literally properties (§14.4); multiplies every hand-written test that exists by then | Best after FE-1392/93 exist to generate against |

**FE-1357 side (demo + plugin spec).**

| Issue | What | Why | How / weight |
| --- | --- | --- | --- |
| FE-1405 | Payload interiors — field-level capture schemas | Was the epistemic bottleneck: blocked FE-1402/03 → FE-1404 → plugin spec | **Closed 2026-08-18**: ADR-0003 (three registers, pure fold) + provisional plugin-contract spec; ratification pass = FE-1431 |
| FE-1431 | Plugin-contract spec issue — "a domain is two schemas and two tables" | Carries the settled-provisional spec and its ratification condition (a full FE-1397-style worked pass across three plugin targets removes the marker) | Desk/HITL; feeds FE-1387's freeze decision; consumers FE-1392/93/1402/03/07 |
| FE-1402 | Completion adjudication + retro-rehearsal | Layer-3 machinery for the stopping problem (deferral-without-deposit) | Desk/HITL; unblocked — computes over the spec's slot states; co-owns the support-closure strain (spec §Open strains) |
| FE-1403 | Guidance assembly — cards typed by mechanism | Compiles the audit's techniques; activation probes first (penciled 4); verdicts recorded per substrate version | Desk; unblocked — the spec's `firesWhen`/`technique` annotations are its hook points; co-owns strain-7 mitigations. Cards likely compile to skills (`activate_skill` disclosure = the card economy); content must stay assertable outside the Vite graph (B4 probe decides how) |
| FE-1404 | Armed condition-3 rerun | Measures guidance+machinery against the baseline — the three-layer claim's validation | Agent-runnable experiment, after FE-1402/03 |
| FE-1406 | Generic strategy quiver (root issue) | Envelope-vocabulary cards, harness-shipped (§11.5); the crack casualty, now owned | Desk; pairs naturally with FE-1403; same skills path + Vite-graph constraint; placement rule is topology N2 (plugin/harness packages export, hosts register) |
| FE-1407 | Frontier-elicitor failure catalogue | FE-1404's scoring instrument; licensed-vs-evasive deferral; an open gap in the field | Desk/research |
| FE-1423 | Pre-remote gates: auth + per-conversation authorization, runtime telemetry, state versioning/backup, restart durability (FE-1396 blocks) | Blocks remote exposure, not the demo; ratified as requirements 2026-08-17; the infra deployment conversation makes it current | Auth is the long pole (app middleware around the mounts); telemetry carries a dual charter — see watch items |
| Plugin-spec authoring | FE-1357's terminal deliverable (the process-model plugin as an instance of the contract) | FE-1405 need met; still wants the 18 Aug ratifications; the plugin-contract spec is now the structure (superseding the manifest sketch, penciled 2) | HITL, heavy; the FE-1431 ratification pass is its natural first movement |
| Situation-pack authoring | Deliberately held for PRO-99 reaction | Dossier + authenticity traps ready | Desk, after the gate |
| Answer key / reference net | Eval rubric; who builds nets is the open Dora/Yannis thread | Gated-on-external |

**Sweep filings (FE-1401 lineage).** FE-1419 (all nine commits landed on
`ln/fe-1419-contract-closure`; the `-0` residue closed). FE-1424 (docs housekeeping, landed on
`ln/fe-1424-docs-housekeeping`: inbox settled to `docs/reference/`, planning split into
`_shared/` + effort records, INDEX coverage gated by `test/docs-index.test.ts`, arc-close
consolidated into a triggerable protocol). FE-1420 splits: findings 1+3 (retry
tolerance, abandoned-slot relief) are cheap and standalone; finding 2 (markdown floor) rides
FE-1385's React adoption. FE-1422 landed the ask-protocol extraction on
`ln/fe-1422-ask-protocol` before the B1/B2 read and FE-1391, as ordered. FE-1401 items 3–4
(lens write-ups, ds-induct port — tooling-side, schedulable any time). A5 folded into FE-1405:
the spec settles confidence as `firm | hedged | speculative` and proposes a store refusal rule
for numeric-parsing strings, whose store side remains pending. A6/A7/A9 remain FE-1393 design
inputs. The pre-remote gates are FE-1423, filed 2026-08-17 under FE-1357 with the four gates as
its checklist and FE-1396 blocking; Lu ratified them as requirements.

### Strategic orderings

**Uncertainty-first** — retire the biggest unknowns per unit work. FE-1391's B1/B2 read has
already retired the substrate half: provenance can use the public projection, and compaction
does not prune it. FE-1405 still owns the deepest semantic unknown (what captures contain),
while FE-1391 now performs implementation rather than discovery. FE-1386's residual pin can
ride FE-1391 rather than interrupt the spine.
`[1422/B1/B2 complete] → 1405 ∥ 1391(+1386 pin) → 1392 → 1393 → gate-dependent rest`

**Convergence-first** — force the maps' designs to collide while both are cheap to change.
Build the middle span (FE-1392) in lockstep with the interiors (FE-1405): envelope facts and
payload designs meet in a working capture path within days, and every mismatch (status arity,
tap evidence, granularity) surfaces as a concrete refusal instead of a spec debate. Press the
FE-1387 target decision at the 18 Aug gate rather than after it. Cost: FE-1391's provenance
verification trails the sweep it should be checking, briefly.
`1405 ∥ 1392 → 1391 → 1393 → 1387 decision → 1402/03 → plugin spec ∥ 1394/95`

**Graduation-first** — maximize demoable increments. FE-1394 + FE-1395 complete the visible
conversation surface, FE-1385 makes the machinery showable, and stakeholders see motion
weekly. Cost: the contract freezes late, FE-1405's unknowns compound toward September, and the
demo risks being a polished skeleton — the baseline already proved conversation alone doesn't
differentiate.
`1394 ∥ 1395 → 1385 → 1392 → 1391 → 1405 → …`

**Recommendation: convergence-first, opened uncertainty-first — survives the fourth
evaluation, with FE-1405 closed and FE-1392 now dependency-clear.** The agent-built spine is
**ask-protocol extraction (FE-1422, complete) → B1/B2 source read
(complete) → FE-1391 (implemented locally) → FE-1392**. The source read removed the open-ended
FE-1386 spike from the critical path; FE-1391 showed its residual real-compaction pin is not a
narrow natural reader/archive test, so it remains a separate compatibility check. The
convergence collision (envelope
facts × payload interiors in a working capture path) still happens the moment FE-1405 and
FE-1392 both exist; take the 18 Aug outputs directly into the FE-1387 target question. On that
decision my recommendation to the team side is unchanged: the process-model plugin as second
target (the assurance tradeoff partly PM's to weigh). Graduation work (FE-1394/95, FE-1385 with
the React adoption) stays behind the spine; FE-1420's cheap half (findings 1+3) can land any
idle moment. The pre-remote gates are now **FE-1423** (filed 2026-08-17; Lu ratified the four
gates as requirements, not recommendations) — and a demo-deployment conversation with infra is
already underway, which promotes FE-1423 from "exists before the conversation" to
schedule-relevant: its auth gate is the long pole, and the deploy-target choice feeds N5's
storage-port question.
`FE-1422 ✓ → B1/B2 ✓ → 1391 ✓ → 1392  ∥  1405 ✓ → 18 Aug gate → 1387 decision → 1402/03 → plugin spec ∥ 1393 → 1394/95/1385`.
The FE-1386 behavioral pin remains off the critical path.

**Watch items**: gherkin wiring ahead of the freeze stays legal only while FE-1387 holds; the
§14.5 wake-wart residue clause is back in the ledger (`wake-wart-write-paths`, FE-1392 owns its
closure); the two Flue runtime semantics the binding relies on turned out to be documented in
the agent-hooks guide (cheatsheet correction, 2026-08-17 — the audit had sampled only the
agent-api reference), though the walking-skeleton pins stay and re-verify at any Flue upgrade,
since the changelog shows migration-free breaking churn; the same upgrade rule now covers the
entry projection and compaction pin because 2.0.3 source, rather than a named public projection-
preservation guarantee, settles the exact post-compaction shape; FE-1387's
body still names FE-1364 as the deciding input — FE-1364 is resolved, so the dependency is
effectively "the 18 Aug ratification of its consequences", and the ticket's framing should be
updated when the gate passes; FE-1423's telemetry gate carries a dual charter (Lu, 2026-08-17) —
inspection is the floor, the ceiling is traces (reasoning, skills, tool use) feeding our own
feedback loops and oracles — which touches FE-1385's probe surface and FE-1404's `observe()`
accounting, so those three should share span vocabulary rather than invent it thrice; and Lu
has sketched a **living-prototype charter for the demo deployment** (non-throwaway: layer and
sometimes consolidate prototypes into an ongoing, deployed record of everything proven and
not-yet-proven, in the exploded-view register) — pre-charter until the infra conversation
lands, but it would reshape N3's `apps/demo` from "demo shell" into the standing proof
surface, so watch for it to become a root-adjacent chartering decision rather than a ticket.
