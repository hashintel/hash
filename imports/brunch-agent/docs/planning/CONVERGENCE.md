# Convergence trace: kernel spec ↔ built system

The elicitation-kernel effort closed 2026-08-10 with a settled spec
([`elicitation-kernel/spec.md`](elicitation-kernel/spec.md)); since then the brunch-lite stack
has been discharging that spec's obligations under the September effort's flag (FE-1357),
without any record connecting obligation to discharging commit. This document is that record:
the backward mapping from spec obligation to implementation status, maintained as branches land.
The arc so far, compressed: the spec and its re-renderings (FE-1374) → the demo-vehicle and
use-case recommendations (FE-1362/63) → workspace and gates, twice hardened against their own
silent failures (FE-1388, FE-1399, FE-1400) → the IR definition and its validations (FE-1364,
FE-1397, FE-1361) → the first product machinery: the walking skeleton (FE-1389) and the capture
store (FE-1390).

This is **not a roadmap**. Forward sequencing is owned by the FE-1357 wayfinder map in Linear;
this document only records what is discharged, what is partial, and where implementation and
spec disagree. Maintenance rule (see [`../agents/legibility.md`](../agents/legibility.md)):
rows update in the same change that lands the discharging branch; sweep-ticket accruals
(FE-1401-style) consolidate here rather than terminating in comments. Fine-grained evidence
lives in the deep-read notes:
[`process-model-elicitation/notes/deep-read-fe-1389.md`](process-model-elicitation/notes/deep-read-fe-1389.md),
[`process-model-elicitation/notes/deep-read-fe-1390.md`](process-model-elicitation/notes/deep-read-fe-1390.md),
and the rendering
[`process-model-elicitation/capture-store-plain.md`](process-model-elicitation/capture-store-plain.md).

Status vocabulary: **discharged** (built and proved; commit/branch named) · **partial** (built
with named gaps) · **pending** (nothing built; expected) · **superseded** (an ADR changed the
obligation) · **orphaned** (owned by no map or ticket — a finding) · **contradicted**
(implementation conflicts with spec; both sides named).

## Architecture & shipping shape (§4, §12)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Shell separation: plugins→core only; core imports no substrate; binding imports both | §4, §12.2 | **discharged** | boundary gates (FE-1388/FE-1399, `test/boundaries.test.ts`); `workspacePackages()` derives groups from manifest; `plugin-gherkin` imports `@brunch/core` only |
| Package topology | §12.2 | **partial** | `core` (+`testing` subpath), `binding-flue`, `plugin-gherkin`, `apps/dev` exist; `plugin-assurance` pending. Topology pin derives from §12.2 itself (FE-1400 `ef00201`) |
| Core *is* the harness (mechanism lives in core) | §12.2, §14.2 | **contradicted** (in spirit) | Suspension protocol, affordance id scheme, one-live-affordance rule, reply binding all live in `binding-flue/src/index.ts`; core exports schemas + naming. The second-binding test fails in spirit (deep-read FE-1389) |
| Tool naming: identity not function | §12.3 | **superseded → discharged** | ADR-0001 replaces `bl_*` with `brunch_*`; `toolName('ask')` → `brunch_ask`; `elicit_*` ban enforced |
| Valibot at every boundary | §12.4 | **discharged** | core + binding schemas throughout |
| SDK surface (anchoring, retries, tracing, arbitraries, simulation harness) | §12.4 | **pending** | none of the named SDK items exist yet |
| Host-authored thin agent calling `useElicitation(plugin)` | §12.1 | **discharged** | `apps/dev/src/agents/gherkin-elicitor.ts` (FE-1389) |
| Dev app's three roles (dev loop, target gallery, probe surface) | §12.5 | **partial** | dev loop only (FE-1389 chat UI); gallery and probe surface pending |
| CI smoke: no model key, no network, no flake | §12.5 | **discharged** | faux-provider integration test through real runtime + real Hono app (FE-1389); the smoke workflow itself never executed until FE-1400 `699ebe4` un-killed it (org policy vs. tag-pinned actions) |
| Remote-parity constraints (pinned agentName, storage outside plugin, no dynamic agents) | §12.5 | **discharged** | pinned-identity gates (FE-1399/FE-1400); storage port in binding (FE-1390) |
| Version axes | §12.6 | **pending** | named, none implemented — as spec states |

## Capture envelope (§5)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Envelope fields: minted id + content dedup key (status excluded), spans, epistemic status, confidence, value XOR absence, alternatives, one `supersedes` | §5 | **discharged** | `packages/core/src/capture-store.ts` (FE-1390); invariants 9/10 pinned by named tests |
| No stored status; derived at read time (C3) | §5 | **discharged** | `deriveCaptureStatus`/`deriveIssueStatus`; tests assert no `status` field persisted |
| Retraction: explicit user-cited event, no successor | §5 | **discharged** | `RetractionEvent` (FE-1390) |
| Pointer **derived by the harness**; model cites quotes, never sequence numbers | §5, §8.2 | **contradicted** (latent) | `EvidenceSpan` *requires* caller-supplied `entryStart`/`entryEnd`; no anchoring code exists anywhere. Safe only while no model-facing sweep tool exists; unmarked in code |
| Confidence qualitative, never a scalar | §5 | **partial** | non-empty string only; `"0.93"` accepted |
| Six absence states; `not-mentioned` computed, never stored | §5.1 | **discharged** | `ABSENCE_STATES` (FE-1390) |
| Reserved reply encoding for structured taps (C4) | §5.1 | **pending** | UI sends bare text; absences from this UI are honestly `inferred` |
| One epistemic status per capture | §5 | **discharged**, with named friction | Status is the proposal union's discriminant, coupled to provenance shape — per-field status is unrepresentable, and payload-smuggling it breaks dedup identity. This is FE-1405's central input (deep-read FE-1390, tiering section) |

## Operations & validation (§6)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| `project` + typed loss report; `validate`; optional `reconcile`; purity (C2) | §6.1 | **pending** | no plugin operations exist; `plugin-gherkin` is `{name, targetDomain}` only |
| Envelope-level refusals (provenance, XOR, single-hop supersession) | §6.2 | **discharged** | FE-1390 command surface |
| Citations resolve to true user entries (store-level refusal) | §6.2 | **partial** | `source` label enforced; resolution against a real entry projection absent — declaration, not verification (deep-read FE-1390) |
| Duplicate detection free for flat-record plugins | §6.2 | **partial** | near-identical advisory fires for string payloads only; a flat record gets none |
| Issues typed + namespaced to producer (invariant 6) | §6.3 | **partial** | all seven types, origin variants present; producer self-declared, unauthenticated |
| Advisories computed, ephemeral, never stored | §6.3 | **discharged** | returned in results, never in snapshot (FE-1390) |
| Cadence as policy (§6.4) | §6.4 | **pending** | no orchestration exists |

## Questioning UX (§7)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| No exchange-pair ontology | §7.1 | **discharged** | affordances as entries; retired vocabulary absent |
| Three baseline forms + questionnaire chaining | §7.2 | **partial** | free-text only, by design (FE-1389) |
| Markdown floor: unknown forms still render | §7.2 | **contradicted** | dev UI `safeParse`s the whole concrete form and renders nothing on failure (`apps/dev/src/ui/chat.tsx`); needs envelope-only schema. Filed FE-1420 |
| One live affordance; durable identity on tool output part; channel as live-render sugar (C6) | §7.3 | **discharged** | updater-form guard + `output` part + channel write (FE-1389); *retry hole*: a re-executed ask (at-least-once tools) is refused as a duplicate — FE-1420 |
| No instruction interpolation; mechanical reply binding via signal; no echo token (C7) | §7.4 | **discharged** | render-invariant instructions; `affordance-reply-bound` signal (FE-1389); wake-wart gap retired — but §14.5's clause covers *future* instruction-state write paths, which land unchecked now the gap entry is deleted |
| Transport outcomes `answered / redirected / unanswered` | §7.5 | **pending** | slot clears unconditionally; no outcome recorded. FE-1420 (abandoned asks) |
| Interpretation render | §7.6 | **pending** | open in `test/known-gaps.ts` (FE-1394) |
| Outbound rich / inbound string; UI filters on `purpose`/`display` | §7.7 | **discharged** | FE-1389 |

## Capture mechanics (§8)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Settlement trigger + judgment | §8.1 | **pending** | no `useAgentFinish`, no trigger; FE-1389 and FE-1390 touch only via the `'user-affordance-payload'` literal — two bridge ends, no middle span (rendering strain #3) |
| Harness-resolved anchoring at sweep application | §8.2 | **pending** | capability 8 declared `absorbed`, never consulted; see the §5 contradicted row |
| Sweep idempotence, content-keyed | §8.3 | **discharged** (store side) | dedup key + three-way skip logic (FE-1390); no sweep producer exists |
| Single-hop supersession over active heads; stale-session guard | §8.4, §9.2 | **discharged** | refusal carries `currentHeadIds` (FE-1390) |
| Resolution records close conflicts; user-cited | §8.5 | **partial** | enforced — but a one-reference conflict is born unclosable, and superseding a referenced capture strands the conflict while bypassing invariant 2's spirit (probed; FE-1419 commits 6–8). And see the contradicted row below |
| Resolution evidence may be a structured tap | §5.1/C4 vs. §8.5 | **contradicted** (silent adjudication) | `resolve-conflict` rejects `user-affordance-payload` evidence — a user who resolves a conflict by tapping a choice strip cannot close it. Defensible strict reading of §8.5; made without a record |
| Unaccounted-ask advisory | §8.6 | **pending** | FE-1420 |
| Resume-time sweep reconciliation | §8.7 | **pending** | — |

## Sessions & durability (§9)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Durable target-document, transient sessions, sweep the only bridge | §9.1 | **partial** | store is session-independent (FE-1390); dev UI mints a fresh document per page load, so many-sessions-one-document is unreachable from any surface (deep-read FE-1389) |
| Per-session state = evidence log, swept high-water mark, pending-affordance slot | §9.2 | **partial** | the slot exists (FE-1389); the other two pending |
| Re-entry briefing; user-visible insertion notice | §9.3 | **pending** | signal carrier proved; no briefing; the one injected signal is filtered out of the UI |
| Only the true user's side is evidence; injected entries structurally non-user | §9.4 | **partial** | signals project non-user (FE-1389); span sources declared not verified; the kickoff message is a machine-authored `user` entry — an anchorable non-utterance once sweeps land |
| Completion derived, never a gate | §9.5 | **pending** | — |
| Storage port: harness-defined, binding-implemented, plugin-blind (C1) | §9.6 | **partial** | capture-store half discharged in exactly that shape (FE-1390); session-log archive absent — see next row |
| Port scope includes the session-log archive | §9.6 | **contradicted** | `snapshotSchema` is a `strictObject`, so the archive is a breaking format change, while `binding-flue`'s header claims §9.6 whole. Evidence pointers are promises the store cannot keep or check (rendering strain #4; FE-1419 comment) |
| Compaction vs. durable log | §9.7 | **pending** | open in `test/known-gaps.ts` (FE-1386) |

## Binding capabilities (§10)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Caps 1–5: tool, instructions, persistent state, affordance emission, suspend-for-reply (absorbed) | §10 | **discharged** | all five exercised against the real runtime (FE-1389 integration test) |
| Caps 6–8, incl. entry-projection read | §10 | **partial** | declared in `capabilities.ts`; cap 8 never consulted; history-projection paging open (FE-1391) |

## Plugins, packs, dev targets (§11, §13)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Plugin ownership: packs, forms, validators | §11.1 | **partial** | `definePlugin` exists; `plugin-gherkin` declares name + targetDomain only; `targetDomain` reaches the prompt as a raw slug |
| Pack form, Principle v2 | §11.2 | **pending** | — |
| Smallest honest plugin as a standing bar | §11.3 | **partial** | held informally (FE-1389 kept the plugin surface at two fields); no test encodes it |
| Generic strategy quiver | §11.5 | **pending** (ownership repaired) | was **orphaned** — named-not-designed, carried by no map — now FE-1406 (root issue) |
| Portfolio + hybrid order: both packs authored before the pack interface freezes | §13 | **pending** (at risk) | `plugin-assurance` does not exist; gherkin is wiring ahead — legal only while no pack interface freezes |
| Gherkin validation (parse validity, step lexicon) | §13.1 | **pending** | — |
| Assurance target (Statement record, four edges, five-stratum derivation, ledger) | §13.2–13.3 | **pending** | — |

## Acceptance material (§14)

| Obligation | Spec | Status | Evidence |
| --- | --- | --- | --- |
| Invariants 2, 4, 5, 7, 9, 10 | §14.1 | **discharged** | named tests in `capture-store.test.ts` (FE-1390), one hand-written example each |
| Invariant 1 (no value without provenance) | §14.1 | **partial** | structural (span/basis shapes required); pointer truth unverified |
| Invariant 6 (issues namespaced) | §14.1 | **partial** | namespace stored, producer unauthenticated |
| Invariants 3, 8 (projection loss, equivalent projection) | §14.1 | **pending** | no `project` exists |
| Five proof obligations; smallest-honest + second-binding tests | §14.2 | **partial** | smallest-honest holding; **second-binding failing in spirit** (mechanism in `binding-flue`; core a schema bag) |
| Gating tests (reprojection, minimal pairs, black-box authoring) | §14.3 | **pending** | — |
| Generation-first fixtures, `arbitraryFromSchema`, `fc.commands` | §14.4 | **pending** | both new suites are hand-written examples; no fast-check anywhere |
| Open verification items tracked with homes | §14.5 | **discharged** (as a mechanism) | `test/known-gaps.ts` ledger, closure by citation + assertion (FE-1400 `7ae3d45`); FE-1419 commit 1 will change the mechanism to entry-deletion. Note: the wake-wart entry's deletion (FE-1389) discharges the *observed* path only; §14.5's broader clause (future instruction-state write paths) now has no ledger entry |

## Vocabulary drift (CONTEXT.md as authority)

| Term | Status | Evidence |
| --- | --- | --- |
| "Walking skeleton" | **contradicted** | glossary defines a *prototype*; the referent is now a durable CI gate (`apps/dev/test/walking-skeleton.test.ts`). Arguably better; glossary no longer describes it |
| "Sweep" | **contradicted** (collision) | spec: a pass that *produces* captures; `capture-store.ts`: `apply-sweep` names the transaction that *stores* them. First reader from the spec will be misled |
| "Storage port" | drift | the term appears nowhere in code; the type is `CaptureStore` — glossary grep finds nothing |
| "core" | tension (pre-existing) | CONTEXT.md lists "core" under *Avoid* for the harness shell; §12.2 names the package `packages/core` |
| `basis` (declared-default / documented-transformation) | addition | coined by FE-1390 for what spec §5/C5 states in prose; now envelope vocabulary the glossary lacks |

## Frontier

Forward sequencing is owned by the **FE-1357 wayfinder map** in Linear — this document
deliberately does not reproduce it. The immediate pressure points, for orientation only:
FE-1405 (payload interiors; now armed with the status-arity answer above) unblocks FE-1402/FE-1403,
then FE-1404; FE-1419 (contract closure + oracle integrity) and FE-1420 (affordance-protocol
hardening) close the holes this trace's partial and contradicted rows name.
