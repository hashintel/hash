# Elicitation Kernel — Specification

Status: draft for review
Assembled: 2026-08-10, from the resolved
[wayfinder map](../archive/elicitation-kernel/map.md) (tickets 01–13), the two inbox references
([challenges](../reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md),
[criteria](../reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md)), and the
[2026-08-10 consistency pre-pass](../archive/elicitation-kernel/notes/consistency-prepass-2026-08-10.md).
Contradiction adjudications are collected in [Appendix A](#appendix-a--adjudications).

"Elicitation kernel" and "brunch-lite" are working labels; the real product name is unresolved
fog. No architectural string bakes in either label (see [Naming](#123-naming--tool-namespacing)).

---

## 1. Purpose

A standalone architecture that generalizes brunch's elicitor into **agentic interviewing against
pluggable elicitation targets**: a harness library on the Pi-family substrate (Flue first),
deployable local and remote, in which an agent conducts a free-flowing interview, emits structured
question affordances as conversation enhancements, and captures evidence-anchored structured
meaning into a durable target-document through idempotent sweeps — for any target-domain a plugin
defines.

The governing design principle (adopted from the challenges doc):

> Capture meaning and evidence before committing to representation. Let semantic requirements and
> destination requirements both generate issues, but keep their origins explicit.

Greenfield reimplementation: brunch is reference architecture (prior art to critique), never shared
code. The system is fully decoupled from brunch's September MVP.

## 2. Non-goals and seams

- **Substrate-agnostic core is a non-goal.** Every named consumer is Pi-family. Portability is a
  _pressure test_, not a build target: the substrate-capability list (§10) and the second-binding
  test (§14.2) keep a hypothetical second binding demonstrably small, but no second binding is
  built or maintained.
- **No privileged downstream consumer.** This is a general elicitation product; the spec names no
  handoff to any specified tool. Whatever consumes an elicited target-document — human readers,
  build tooling, another agent — does so through the same read-time derivation surface as any
  other reader (§6.1, §9.1), and nothing in this spec depends on such a consumer existing. (The
  map charter's "elicitor→executor seam" was brunch adoption leakage, dropped on review
  2026-08-10.)
- **Deferred plugin-ecosystem machinery** (named, not designed): simultaneous multi-plugin
  composition, plugin removal, full replay, capability negotiation, version/migration machinery.
  The spec names the five version axes (§12.6) and implements none.

## 3. Vocabulary

The canonical glossary is context [`CONTEXT.md`](../../CONTEXT.md) — shells (substrate / ui / harness
/ plugin / binding), sessions and durability (target-domain / target-document / session / capture
store / re-entry briefing), and interaction terms (affordance / capture / sweep / settlement /
interpretation render), now extended with the envelope vocabulary this spec relies on (capture
envelope, evidence span, epistemic status, absence state, resolution record, supersession, pack,
issue, advisory, kernel card, PluginContext, storage port).

Two rulings on surviving "kernel" compounds (the glossary otherwise avoids the word):

- **Kernel card** survives as a term of art for the pack-content unit (brunch
  `BEHAVIORAL_KERNELS.md` lineage — "kernel" there names a small unit of behavioral guidance, not
  a shell). Added to the glossary with that note.
- **"Kernel invariants" renames to harness invariants** (§14.1) — they are harness-enforced test
  properties, and the shell they belong to is the harness.

## 4. Architecture: four shells and a binding

```text
substrate  (Pi family / Flue: deploy target, model/provider, conversation storage)
   ↑ implemented against by
binding    (one per substrate; implements the capability list §10; absorbs what its substrate lacks)
   ↑ imported by
harness    (the product: mechanism + orchestration — loop, ask API, envelope, issues, sweeps, store)
   ↑ injects PluginContext into
plugin     (target policy: packs, forms, validators, payload shapes)
                                          ui (rendering, input, reply transport, identity)
```

- **Agent-forward hybrid**: agent judgment owns the conversation loop; deterministic mechanism
  ships as tools; typed issues are the backpressure channel. Facts computed, weights judged — the
  harness computes issue facts (blocks-required-criterion, origin, can-default); the agent weighs
  them qualitatively. No scoring engine, no stored ranking, no question-budget machinery: the
  challenges doc's priority formula is prose the agent thinks with, never a computed score.
- **Inversion of control** (Hollywood principle): the plugin declares and registers; the harness
  discovers, orders, invokes. Harness capabilities — the ask API, capture envelope, issue queue,
  sweep bookkeeping — reach the plugin only as a **narrow injected PluginContext**. Composition is
  the plugin's at authoring time; control flow is the harness's at runtime. Schema ownership
  follows capability ownership: the shell that defines a capability owns its affordance schemas.
- The **harness imports no substrate**; a binding imports both. **Plugins depend on core only**
  (§12.2). The ui renders parts and transports replies; it owns no elicitation semantics.

## 5. The capture envelope

The hourglass waist: harness-defined, domain-free — semantically rich, structurally minimal.
Everything domain-shaped is opaque plugin payload; the runtime reasons about provenance,
uncertainty, conflict, completeness, and loss without understanding domains.

A capture carries:

- **`id`** — harness-minted, durable. Distinct from identity-for-deduplication: the **dedup key is
  content-derived** — evidence spans + payload (or absence state) — with **epistemic status
  excluded** from the key, so revising the epistemic reading of unchanged evidence requires
  explicit supersession, never a silent update. Both notions coexist by design (minted id for
  reference, content key for idempotence).
- **Evidence spans** — each span is a **quoted excerpt plus a pointer** (session id + entry
  range). The excerpt is primary at proposal time and is the **model-facing citation currency**;
  the pointer is **derived by the harness**, which alone can see the entry projection
  (harness-resolved anchoring, §8.2). The stored capture carries **both**: quote-to-entry
  resolution happens exactly once, at sweep application; every later reader navigates by pointer
  into the session-log archive (§9.6), never by text search. Spans anchor only on true user and user-affordance-payload
  entries (§9.4); `defaulted` / `external-lookup` captures cite a declared default or documented
  transformation instead of a user span (Appendix A, C5).
- **Epistemic status** — `explicit | inferred | tentative | defaulted | external-lookup`. Distinct
  from confidence. (This is the one legal enum; ticket 10's prototype value `stated` was drift.)
- **Confidence** — qualitative, never a scalar-for-everything.
- **Value XOR absence state** — exactly one. Absence states are first-class capture values (§5.1).
- **Alternatives grouping** — more than one live interpretation of the same evidence may coexist
  until explicitly resolved.
- **One `supersedes` link** — creation-time, single-hop, active-heads-only (§8.4).
- **Opaque plugin-typed payload.** No harness edges, no graph, no kind taxonomy — structure is
  payload business. Conflict and equivalence are typed issues referencing capture ids, not edges.

**No stored status field.** Envelope status (`active | superseded | retracted`) is **derived at
read time** from supersession links, resolution records, and retraction events. This is one
instance of the general rule:

> **No status is ever written; every status is computed at read time from stored captures, issues,
> and events.** Three strata: **envelope status** (harness-computed from links and events),
> **completion status** (harness-computed by running plugin-declared criteria), and **domain
> labels** (plugin-computed by stratified derivation over its own payload graph, §13.3 — invoked
> via `project` at read time under cadence-as-policy, §6.4).

**Retraction** (adjudicated — no prior ticket specified it): a retraction is an explicit stored
event in the same family as resolution records — it must cite the true user's utterance as
evidence and names no successor capture. Derived envelope status then reads `retracted`. There is
no other path to `retracted`.

### 5.1 Absence states

`unknown-to-user | not-yet-decided | not-applicable | explicitly-absent | declined | deferred` as
capture values, plus `not-mentioned` as a **computed fact only** (adjudicated): captures require
evidence spans, and "not mentioned" has no utterance to anchor to — it is output of completion
evaluation and plugin `validate`, never a sweepable capture.

Distinctions that must not collapse:

- `not-yet-decided` — the user states the decision has not been made (a fact about the world).
- `deferred` — the user postpones answering (a fact about the interview).
- `explicitly-absent` ("we have no deadline") ≠ `unknown-to-user` ("I don't know the deadline").
- `declined` ≠ `deferred` (amended on review 2026-08-11): a decline is a **boundary** — re-asking
  is an interviewing error, and the gap closes only through an explicit act (a declared default,
  or a descoped requirement); a deferral is an **invitation** — re-raising it later is correct
  interviewing, and completion evaluation chases it (§8.6). Collapsing them makes the agent
  either nag someone who refused or forget someone who said "later".

The absence strip's three labels map: **don't-know → `unknown-to-user`**, **not-applicable →
`not-applicable`**, **decide-later → `deferred`**.

This enum is a working set, validated only against the milestone-one targets. Fine epistemic
distinctions have a record of arriving late and mattering (brunch took real time to separate the
character of an _assumption_ from a _known-unknown_), so extension pressure is expected rather
than a design failure — absence states are envelope vocabulary, so an extension is a
concept-schema-axis change (§12.6), cheap while the ecosystem is workspace-internal. Naming new
states for behavioral activation (the way "fog of war" carries a whole stance in one image) is
kernel-card-grade work: pick words the agent can _act_ from, not taxonomy for its own sake.

**Explicit vs. inferred absence is a transport fact** (adjudicated, C4): inbound reply transport is
string-only, and a bare string cannot distinguish a one-tap `not-applicable` from typed prose. The
harness therefore defines a **reserved reply encoding** — a sentinel-format string the ui emits
for structured affordance taps (absence-strip taps, choice selections). A reply parsing as that
encoding, arriving while its affordance occupies the pending-affordance slot, is
transport-explicit; every other reply is conversational, and absences read from it carry
`epistemic_status: inferred`. Structured taps are an **optional ui capability, not a
requirement**: no ui is obliged to afford single-tap buttons at all — the contract says only that
_if_ a ui affords them, tap-ness rides the encoding. A ui that only affords the markdown floor
never produces the encoding and honestly yields inferred-only absences. Tap-ness must be a
transport fact to earn `explicit`; nothing else may claim it.

## 6. Operations, validation strata, issues

### 6.1 Plugin operations

- **Required**: `project` (captures → draft artifact + **typed loss report**: `mapped-exactly /
normalized / approximate / collapsed / omitted / defaulted / unrepresentable`) and `validate`
  (→ typed issues). `project` also computes the plugin's domain labels (§13.3) — read-time
  derivation is projection. (The operation keeps the canon name `project`; in running prose this
  spec prefers the noun — "produce a projection" — because the verb collides with everyday
  senses.)
- **Optional**: `reconcile` — dedup/merge over the plugin's own payload structure; the harness
  calls it when present.
- **Agent-native**: `observe` — noticing is the agent's work, guided by pack kernel cards;
  code-level extractors are an optimization, never the required path.
- **Calling convention — pure, snapshot-in/deltas-out** (adjudicated, C2): every operation
  receives an **immutable state snapshot** and returns observations/issues/deltas; the harness
  validates and applies. Operations never address storage, the user, or the model. This purity is
  load-bearing: it buys atomic plugin failure, semantically idempotent retries, tracing, and the
  cadence-as-policy freedom in §6.4. Ticket 12's clause "storage addressable only via
  PluginContext-passed methods" is scoped to **non-operation plugin code**; milestone one defines
  **no** storage-addressable PluginContext methods at all, and any future ones must be read-only
  and unavailable inside the four operations.
- **Backpressure**: validators and projectors never ask the user; they return typed issues the
  agent consumes.

### 6.2 Two validation strata

- **Envelope-level, harness-owned**: hard invariants enforced as **refusals** (provenance
  required; value-xor-absence; single-hop supersession over active heads; citations resolve to
  true user entries) plus computed facts raised as **advisories** or generic `possibly-equivalent`
  issues (same-evidence duplicate actives; near-identical payload text — the harness compares
  payloads as strings without understanding them). A flat-record plugin gets duplicate detection
  free, strengthening the smallest-honest-plugin bar.
- **Payload-level, plugin-owned** (`validate` / `reconcile`): everything domain-shaped. Two live
  examples from the ticket-13 skeleton that the envelope _cannot_ catch, both plugin-`validate`
  territory: a payload **smuggling an absence** (`payload: "not-yet-decided"` as a value), and
  **compound payloads making supersession lossy** (a capture bundling date+time superseded by one
  carrying date+venue silently drops the time — capture granularity is plugin `validate` /
  kernel-card guidance).

### 6.3 Issues vs. advisories

- An **issue** is stored, typed backpressure: vocabulary `missing / ambiguous / conflicting /
invalid / unsupported / unmapped / low-confidence` plus factual attributes (origin, references,
  can-default). Issues close only explicitly; `conflicting` closes **only** via a resolution
  record (§8.5). Two producers, **namespaced to their producer** (harness envelope issues vs.
  plugin issues under their plugin/target-domain namespace) — restating criteria-doc invariant 6:
  a target-originated requirement never silently becomes a semantic requirement.
- An **advisory** is a **computed, ephemeral fact** — surfaced to the agent at trigger or read
  time, never stored in the capture store, never blocking (adjudicated, L6). Named advisories:
  the unaccounted-ask advisory (§8.6), the resume-time unswept-tail advisory (§8.7), the
  world-moved briefing content (§9.3), multi-match anchoring notes (§8.2).

### 6.4 Operation cadence is orchestration policy

Snapshot purity means the harness may run `project` / `validate` / `reconcile` at any time without
changing outcomes. **Sweep-completion is the default trigger**; read-time invocation (for
projections, derived labels, completion) is equally legal. Cadence is stated harness policy, not
correctness — observed live in ticket 13, where the model swept at reply time without waiting for
a nudge, harmlessly.

## 7. Questioning-UX contract

### 7.1 No exchange-pair ontology

The free-flowing conversation is primary. A structured question is an **affordance** — a rendered
enhancement committed to the session as evidence, not a state machine. There is no pending-exchange
concept, no terminal union, no recovery scan, no cardinality rule beyond §7.3. Ask invocations
commit structured payloads to the session; answers, cancellations, and redirects are all session
evidence, interpreted at sweep time.

### 7.2 Baseline forms and the markdown floor

The harness fixes three baseline question shapes — free-text, single-choice, multi-choice — plus
**questionnaire chaining** as a first-class baseline. A questionnaire is **one affordance with
multiple steps**: the payload carries all N questions, the ui walks them locally, answers return
as evidence (individually or batched), the agent interprets on settlement — zero intermediate
model turns. Plugins add custom forms through the plugin API as progressive enhancement keyed on
the form tag; every form carries a **markdown floor** so a ui that knows only the envelope renders
everything. Plugin form payloads are **opaque at the tool boundary** (`v.any()` slot inside typed
envelope fields) and validated harness-side against plugin declarations on read-back — tool
schemas are frozen at module load, so per-render plugin parameterization is impossible by
construction.

### 7.3 One live affordance (adjudicated, C6)

Transport truth from the ticket-10 skeleton: writes to the fixed data channel materialize
last-write-wins per assistant message — the channel is a **current-affordance surface**, not a
log. Therefore:

- **Durable identity and payload for every affordance ride the ask tool's output part** (Flue
  blesses tool output parts for exactly this). The channel write is live-render sugar for the one
  pending interactive affordance.
- **The ask tool rejects a second interactive affordance in the same batch — as mechanism, not
  instruction.** The one-live-affordance rule is per assistant message.
- Non-interactive affordances (the interpretation render, §7.6) ride their own tool output parts
  and never occupy the channel slot, so an ask plus an interpretation render in one batch cannot
  clobber each other.

### 7.4 Turn suspension, reply binding, and the wake wart (adjudicated, C7)

Flue has no ask-the-user primitive; the harness owns the turn-suspension protocol: a
`terminate: true` ask tool + the pending affordance in per-session state + the answer arriving as
a fresh dispatch.

The pending question is **not interpolated into instructions**. Ticket 10's interpolation caused
the wake wart (an "instructions updated" advisory waking the model for a wasted turn per ask) and
ticket 13 showed those hidden advisories also corrupt entry numbering. Instead:

- The pending affordance lives in the **pending-affordance slot** (per-session state, §9.2) and is
  narrated inside the **ask tool's result**, so the model retains conversational awareness through
  ordinary context adjacency.
- **Reply binding is harness-mechanical**: at most one affordance is pending (§7.3), so a reply
  dispatch arriving while the slot is occupied is bound to that affordance by the harness. No echo
  token, and no reliance on the model remembering an id — consistent with harness-resolved
  anchoring (§8.2). The model's _interpretation_ of the reply happens at sweep time, citing the
  quoted reply text.
- Judgment prompts must never be the model's only source of mechanical facts (ticket 13): any
  fact the harness owns (pending affordance, unswept tail) reaches the model through tool results
  or signals, not only through instruction text.

### 7.5 Transport outcomes (adjudicated, L9)

Interpretation evidence records a small transport-outcome vocabulary, distinct from epistemic
absence: **`answered | redirected | unanswered`**. `redirected` covers cancellation-by-topic-change
(observed working in ticket 10); `unanswered` is an ask still unaccounted when its range settles
(pairing with the unaccounted-ask advisory, §8.6). Brunch's `unavailable` is retired: the markdown
floor guarantees a render path everywhere.

### 7.6 Interpretation render

The one affordance form that must be harness-owned, since it renders envelope vocabulary: captures
with epistemic status, absence states, live alternatives, derived statuses. The plugin **may**
supply a renderer definition typed against its own payload shapes; the harness default is a plain
JSON view (smallest-honest-plugin holds). React vs. accept are two capture semantics, not exchange
steps. The renderer seam is exercised once real packs exist (§14.5).

### 7.7 Recorded transport facts (Flue)

Outbound rich (Valibot-validated data parts, dynamic-tool outputs); **inbound string-only** —
answer typing/validation happens entirely harness-side on read-back (hence §5.1's reply
encoding); unknown part types silently dropped (hence the markdown floor); data-part
materialization is update-in-place at every layer, intermediate values visible live only. Messages
carry `purpose` and `display`; **the ui must filter on them** (injected signals arrive
`display: 'diagnostic'`). Mixed batches suspend correctly when the terminating result is present.

## 8. Capture mechanics: settlement, sweep, supersession

### 8.1 Settlement: trigger and judgment

Settlement is **agent-judged and range-level** (a vein closing), never per-question. It decomposes:

- **Trigger** — the substrate's would-stop lifecycle seam (capability 7, §10). The harness
  computes facts (the unswept tail) and steers a settlement-check signal into a same-response
  continuation turn. Two load-bearing guards from ticket 13: the seam **fires on suspensions
  too**, so the pending-affordance guard must suppress nudges into a suspended ask turn; and the
  nudge is itself a session entry, so the trigger is **loop-guarded** (never re-nudge the same
  latest user entry).
- **Judgment** — the agent decides _whether_ the range has settled; declining is legal.

### 8.2 Harness-resolved evidence anchoring

Entry identity is **harness-side vocabulary only**. The model cites **verbatim user quotes**; the
harness — the only party that can see the entry projection — resolves each quote to its entry:
candidates are true-user entries only; no match refuses with a repair hint; multiple matches
anchor the latest with an advisory note. Sequence numbers and range bounds never appear in the
model-facing tool contract. (Ticket 13, HITL round 1: the model's quotes were flawless and its
sequence guesses never converged — five sweeps, five numberings.)

### 8.3 Sweep idempotence

Mechanical idempotence is the harness guarantee, via content-keyed capture identity (§5):
re-sweeping a range never double-captures **and can repair omissions** — identity is
content-based, not range-based. This is **load-bearing, not optional**, under at-least-once tool
re-execution (Flue fact, ticket 13). Semantic re-interpretation (a fresh judgment re-phrasing the
same fact) is deliberately not a harness concern: that is plugin `reconcile` plus
`possibly-equivalent` issues.

### 8.4 Supersession: single-hop, two channels

Supersession is single-hop over **active heads only** — superseding an already-superseded capture
is refused. That refusal is simultaneously the lost-update guard and the stale-session guard
(§9.2): a corrector must confront the current head, so history stays a chain, never a silently
forking tree. Superseded captures remain visible forever.

**Two supersession channels**, named: the creation-time `supersedes` **link** (sweep-time
correction) and the **resolution record** (issue-time adjudication between already-existing
alternatives). The winning capture keeps its original epistemic status; authority lives in the
record; envelope status derives at read time (§5).

### 8.5 Resolution records

A `conflicting` issue closes **only** via an explicit resolution record — a capture-store event
citing the true user's utterance as evidence. A bare close is refused; a record citing the agent's
words is refused. This is the "no silent conflict resolution" invariant moved from wire to store.

### 8.6 Unaccounted-ask advisory

A swept range containing an ask with no reply and no capture citing it makes the harness report
the fact — and block nothing. The re-ask path runs through plugin `validate` → typed issues, with
completion evaluation as the backstop for unresolved deferrals on required concepts. Absences are
evidence, not agenda.

### 8.7 Resume-time sweep reconciliation

A session ending between settlement judgment and sweep leaves an unswept tail — a computable fact
(entries above the high-water mark). On resume the harness surfaces it as an advisory (inside the
re-entry briefing, §9.3) and the agent judges whether to sweep before proceeding.

## 9. Sessions, durability, and the storage port

### 9.1 Durable target-document, transient sessions, sweep as the only bridge

- **Target-document** = one target-domain + its capture store + its session history. Its
  authoritative state is **the capture store plus all session logs — never the render**.
  Projections, renders, and artifacts are strictly derived: cacheable, disposable. Session logs
  are durable truth too: discarding swept logs would dead-end every capture's evidence pointers.
  **Conversations are themselves documents** (amended on review 2026-08-11): each session log is
  kept as reference, indefinitely, and lives **with** the target-document in the same persistence
  home — the storage port's session-log archive (§9.6) — so evidence pointers resolve against
  the target-document's own store, never against whatever the substrate happens to retain.
- **Session** = one substrate conversation. Sessions **never formally close** — they go quiet and
  stay resumable; "ended" would be a fiction the harness cannot verify.
- **Session→document binding** (adjudicated, L4): a new session's `initialData` carries the
  target-document id (validated once at creation, immutable — Flue's own lane for a target
  descriptor). Dispatching to an existing conversation id resumes that session against the current
  state of its target-document; a new id opens a new session against the named document. Plugin
  choice is conversation-lifetime-immutable for the same reason.

### 9.2 Per-session state and concurrency

Strictly per-session state is **exactly three things**: the evidence log, the swept high-water
mark, the pending-affordance slot. (The private scratchpad is _not_ session state — pattern
guidance only; its natural Flue home is the `harness.prompt` scratch conversation, §11.4.)

Concurrency is **interleaved-only** for milestone one: the store is serialized (sweeps validate
and apply atomically — a transactional guarantee, not a session lock); staleness is optimistic —
the single-hop supersession refusal doubles as the stale-session guard, and the refusal carries
the world-moved facts. Refusal granularity is **whole-sweep atomic**; re-proposing is cheap once
the advisory is digested. No locking, no merge, no sync events; true simultaneous-sweep
coordination stays fog until a real concurrent consumer appears.

### 9.3 Re-entry briefing

When a session resumes after the world moved, the harness injects a **state message** on the
user's behalf (Pi's custom-entry convention; on Flue, a typed `kind: 'signal'` entry). Content is
computed facts only: unswept tail, world-moved delta (captures created/superseded and issues
opened/closed since this session's last sweep; anchor = session start if it never swept), open
issues, pending unanswered affordance. Advisory-only — the agent weighs; nothing is forced. A
**minimal user-visible insertion notice** accompanies every injected state message. Ticket 13
proved the briefing in all three shapes (fresh, resumed, post-restart) and observed it produce
unscripted conversational conflict-surfacing.

### 9.4 Provenance: only the true user's side is evidence

The data model **distinguishes true user entries from injected on-behalf-of-user entries**.
Capture evidence spans anchor only on true user (and user-affordance-payload) entries; injected
briefings live in the log honestly but are **never citable as capture evidence** — and on Flue
this is mechanically enforced, since signals appear structurally non-user in the entry projection
(a capture citing an injected entry is refused at validation). Reconciliation with harness invariant 1 (Appendix A,
C5): user-derived captures cite user entries; `defaulted` / `external-lookup` captures cite a
declared default or documented transformation instead.

### 9.5 Completion is derived, never a gate

A target-document has no lock and no terminal state: completion-contract satisfaction is a
read-time derived status (§5's derived-status family). A user returning with a correction after
"done" is the motivating story. Semantic completeness and representation completeness remain
separate assessments; each issue records its origin.

### 9.6 The storage port (adjudicated, C1)

**The storage port is harness-defined and binding-implemented; plugins are storage-blind.** The
harness defines the port's contract (the capture-store operations and their envelope invariants,
enforced as store-level refusals); the binding implements it for its deploy target; the plugin
never touches persistence. Reconciliation with the shipping-shape's "host-owned storage": the
substrate's _conversation_ storage (Flue's `db.ts`) stays host-authored because Flue requires it
of the consuming app; the harness's _capture store_ is the storage port, implemented in
`packages/binding-flue` (and any future binding). The remote-parity constraint reads accordingly: the
storage port is owned **outside the plugin** (§12.5).

**The port's scope is the capture store plus the session-log archive** (amended on review
2026-08-11): session logs attached to a target-document live with it, retained indefinitely.
The mechanism is **archive-on-read** — whenever the binding reads the durable entry projection
(every sweep, every briefing computation), it retains the entries it read in the
target-document store. At minimum, every entry a capture points to must be retrievable from the
archive forever; the substrate's conversation store remains the live transport copy, never the
provenance record.

**Milestone-one local store**: binding-owned; the format is binding-internal **but constrained** —
it must provide whole-sweep-atomic application and refusals with serialized writes (adjudicated,
L13; a flat append-only text file does not qualify unaided). The ticket-13 skeleton's shape (JSON
file, tmp+rename atomic, in-process serialization) is the proven floor; it holds the session-log
archive alongside captures, issues, and events.

### 9.7 Context compaction vs. the durable log

Pi-family substrates compact long transcripts, with custom compaction definitions controlling
which entry kinds survive in the context the model re-reads — ordinary user and agent messages
are normally summarized away. This never touches the spec's durability claims, **provided one
constraint holds, stated here as part of the storage contract**:

- **Compaction may shrink what the model re-reads, never what the store can resolve.** Evidence
  pointers and the sweep machinery bind to the **durable entry projection** (capability 8, §10),
  not to the model's context window. A binding must guarantee the durable projection is
  compaction-independent; a substrate whose compaction prunes durable history is a substrate whose
  binding must preserve the pruned entries itself (binding absorption, as with capability 10).
  The session-log archive (§9.6) is that preservation mechanism, already in place: compaction
  cannot remove anything the archive holds.
- Two existing mechanisms already cushion the model-side loss: **excerpt-primary evidence spans**
  (§5) keep every capture citable and self-contained even where durable access degrades, and the
  **re-entry briefing** (§9.3) already treats "the model no longer remembers" as a normal state —
  a compacted session is informationally a resumed one. Per-session harness state (high-water
  mark, pending-affordance slot) lives outside the transcript and cannot be compacted away.
- If a binding supplies a compaction definition, injected signals and affordance tool parts need
  no protected status: briefings are recomputable facts and affordance identity is durable on
  tool output parts — only true user entries are irreplaceable, and the archive holds those.

Whether Flue's compaction (if and as it ships one) preserves the durable-history projection
unmodified is **unverified** — named in §14.5.

## 10. The substrate-capability list

The core/binding seam, the portability pressure test, and the early-smell detector: porting =
reimplementing this list; exotic Flue-shaped entries appearing here is the smell. **Ten entries**
(six from the shipping-shape resolution, four added by the sweep-seam skeleton):

| #   | Capability                                                                              | Flue status                                                                                                           |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Register a tool                                                                         | native (`defineTool`/`useTool`)                                                                                       |
| 2   | Contribute instructions                                                                 | native (render return)                                                                                                |
| 3   | Persist per-conversation state                                                          | native (`usePersistentState`, atomic with its unit of work)                                                           |
| 4   | Emit an affordance payload                                                              | native (data channel + tool output parts)                                                                             |
| 5   | Suspend-for-reply                                                                       | **absorbed**: no ask primitive; `terminate: true` + pending slot + fresh dispatch (§7.4)                              |
| 6   | Private model call                                                                      | native (`harness.prompt` scratch conversation)                                                                        |
| 7   | Subscribe to the would-stop lifecycle seam, with same-response signal steering          | native (`useAgentFinish` + `ctx.append`; fires on suspensions — pending guard load-bearing; loop-guarded)             |
| 8   | Read the session's durable entry projection, with provenance-discriminating entry kinds | **binding-absorbed**: no in-process API; public history projection over self-HTTP; `purpose` discriminates provenance |
| 9   | Inject typed non-user signal entries, same-response and as deliveries                   | native (`ctx.append` / `dispatch({kind:'signal'})`; projects structurally non-user)                                   |
| 10  | Provide a transactional durable store outside conversation state                        | **binding-absorbed** entirely (Flue neither provides nor forbids)                                                     |

Binding-size asymmetry is expected, not failure: each binding absorbs what its substrate lacks or
forbids. Core names operations abstractly; the binding renders substrate tool names.

**Recorded Flue facts the implementation must respect**: `@flue/vite` requires vite ^8 and the
`'use agent'` directive as the file's first statement; `agentName` must be a string literal and
must be pinned (conversation storage keys on it); the dev controller owns the whole request space,
so the ui is a separate app or app-served assets; tool schemas are Valibot, frozen at module load;
tool names are globally unique per render with reserved names; prompt-cache economics forbid
per-question tool swapping (one stable tool set + state-driven instructions); subagents are
conversationally sterile; non-React hosts build on `@flue/sdk`; without `db.ts` conversations are
process-memory (restart loses them; the capture store survives independently — proven, ticket 13).

## 11. Plugins and packs

### 11.1 What a plugin owns

Target policy only: its **own payload structure** (graph, flat list — never universal; namespaced
concepts); **ElicitationPack** — kernel cards (Detects / Goal / contrastive Questions /
Artifacts), completion contract, clarification hints; **ProjectionPack(s)** — `project` +
`validate` (required), `reconcile` (optional), output contract, annotated shapes, typed loss
reports, lossiness policy; its declared payload/output _shape_ (never persistence itself, §9.6);
domain vocabulary. One ElicitationPack + N ProjectionPacks per plugin sharing the plugin's payload
structure — axes separated in contract, bundled in shipping; swappability proven by reprojection.

### 11.2 Pack form and Principle v2

Packs are kernel cards + annotated shapes + deterministic validators + small boundary-teaching
wire schemas (shallow for model legibility, deep requiredness in validators) + a completion
contract as checkable bounds. Authoring standard: `writing-for-agents`; guiding principle
(**Principle v2**): _procedure for mechanism, anchors for judgment, shapes for output_ — short
step sequences with checkable completion criteria where order matters, leading words wherever
judgment is required, annotated shapes for everything produced, reference disclosed progressively.
Design against sprawl, negation-steering, no-ops, and judgment-as-procedure — not against
procedure itself.

### 11.3 The smallest honest plugin

A flat record list + one validator must suffice; every harness-contract addition is checked
against the bar it raises. The envelope stratum gives such a plugin refusals and duplicate
detection for free (§6.2); what it cannot delegate is exactly the payload stratum — the two live
examples in §6.2 are its irreducible work.

### 11.4 Pattern guidance (inherited from brunch, as patterns not mechanism)

Comment-vs-message provenance discipline; boundary-teaching schemas; hash-pinned, ablatable prompt
directives (a load-bearing prompt paragraph as a versioned, testable artifact); a private,
non-authoritative scratchpad for "noticed, not yet asked" — **not** harness session state; on Flue
its natural home is the `harness.prompt` private scratch conversation; "react to this" separate
from "accept this"; agenda as derived state, never stored.

### 11.5 Generic strategy cards (named, not designed)

Some interviewing technique is target-independent. Socratic pressure on premises, contrastive
cases that separate competing interpretations, stress-testing the weak points of an argument —
these operate on vocabulary the **harness** owns (conflicts, alternatives, ambiguity, weak or
missing evidence, absence clusters), not on any plugin's domain. By the same rule that governs
schemas ("the shell that defines a capability owns its affordance schemas", §4), **guidance
ownership follows vocabulary ownership**: cards that teach _what to notice in a domain_ are
plugin pack content; cards that teach _how to work an interview situation the envelope can name_
may ship with the harness as a **generic strategy quiver**, composed by plugins at authoring
time exactly as packs compose (added on review 2026-08-11).

Named, not designed: milestone one ships all guidance in plugin packs. Reference shapes for the
quiver when it graduates: brunch's `ln-grill` (relentless Socratic interviewing — question
premises, surface constraints, name anti-patterns) and `ln-disambiguate` (generate contrastive
cases where plausible interpretations diverge and have the person classify them, instead of
asking abstract questions), plus brunch's `elicitation_style: interrogate | disambiguate |
propose` trichotomy, which the exchange-schema audit already classed generic. The assurance
target is the worked example of the split: its technique decomposes into a generic
stress-the-argument strategy card plus the plugin's domain cards (§13.2).

## 12. Shipping shape

### 12.1 Root

The product is the **harness library** in a thin host-authored agent. Every host authors its own
~10-line `'use agent'` module, `app.ts` mount, and `db.ts`, and calls `useElicitation(plugin)`.
A runnable reference app ships alongside as the dev/demo vehicle, not the product. (Flue's
build-time scan makes the alternative structurally unavailable: a library cannot ship a
pre-registered agent.)

### 12.2 Package topology (intended structure; nothing scaffolded during the map)

Bun-workspace monorepo in this repo:

```text
packages/core              # the harness; plugin SDK is its public export surface
packages/core/testing      # (subpath) fixtures, arbitraries, replay driver — prod bundles stay clean
packages/binding-flue      # the Flue binding (implements §10; owns the storage port impl)
packages/transport-aisdk   # validated UI ingress + harness replies → AI SDK wire; no binding/substrate imports
packages/plugin-gherkin
packages/plugin-assurance  # renamed 2026-08-10 from plugin-proof-obligations (§13.2)
apps/dev                   # owns 'use agent' module, app.ts, db.ts, Vite build
```

**FE-1437 import amendment (2026-08-20):** the repository topology above is the standalone
prototype record. In `hashintel/hash`, the same boundaries become private native workspaces:
`@hashintel/brunch-agent`, `@hashintel/brunch-agent-binding-flue`,
`@hashintel/brunch-agent-transport-aisdk`, and `@hashintel/brunch-agent-plugin-gherkin`, with
`apps/dev` re-chartered as `apps/brunch-agent`. HASH's Yarn/Turbo workspace replaces the Bun root;
it does not wrap or flatten these package boundaries.

**FE-1437 context-root amendment (2026-08-21):** the four libraries are child workspaces under
`libs/@hashintel/brunch-agent/packages/{core,binding-flue,transport-aisdk,plugin-gherkin}`.
`libs/@hashintel/brunch-agent/` is their shared domain, documentation, and agent-session root, not
a package-manager root: it carries no package manifest, lockfile, or competing toolchain.
`apps/brunch-agent` remains at HASH's application root and points back to that context authority.

**Dependency invariants (spec invariants):** plugins depend on `core` only — never on the binding,
never on Flue; the harness imports no substrate; a binding imports both. A transport consumes
harness-level reply parts plus its wire encoder and ingress validator only: `transport-aisdk`
depends on `core`, `ai`, and `valibot`, never on a binding or Flue. **Role prefixes name what a
package is architecturally**: plugin
packages are `plugin-*` (never `elicit-*`), binding packages are `binding-*`, and ui reply-wire
packages are `transport-*` — the glossary's own nouns, where `adapter-*`/`wrapper-*` are
avoided terms (amended on review 2026-08-10 and FE-1436; ticket 06 had bare `packages/flue` and a
`<substrate>-<name>` horizon scheme — the product name belongs in the npm scope, e.g.
`@<name>/binding-flue`, not the package basename). Envisioned horizon, named not committed:
per-substrate binding packages (`binding-flue`, `binding-pi`, `binding-codex`) — the payoff if
the second-binding test keeps passing. **Publishing posture: workspace-internal**; the publishable
shape is exactly the package boundaries above, but publishing waits on the real name and an
external consumer.

**FE-1437 naming amendment (2026-08-20):** HASH's organizational npm scope owns placement, so
`brunch-agent` moves into the package basename as shown in §12.2. ADR-0001's `brunch_*` tool prefix,
durable agent identity, and ban on function-shaped `elicit_*` names remain unchanged.

### 12.3 Naming & tool namespacing

Architectural strings name **identity, not function**: tool prefix derived from the product name —
provisionally `bl_*`, never `elicit_*`. All model-facing tools are harness-owned (plugins expose
operations, not tools); core names operations abstractly, the binding renders substrate tool
names. The name-fog eventually resolves every provisional string; nothing bakes "elicit" or
"brunch" into structure.

### 12.4 Schemas and the SDK

**Valibot throughout** — Flue locks it at every boundary; a Standard-Schema waist would buy
comfort at the cost of a conversion seam that can silently drop constraints (the silent-coercion
smell). SDK surface (core's exports): evidence anchoring, capture identity, issue construction,
schema validation, retries, idempotency, state-delta application, tracing, test fixtures, the
local simulation harness ("debugging should not require reading an entire agent transcript"), plus
the testing machinery of §14.4 (schema-driven arbitraries, the command alphabet, mutation
operators, fixture freeze/replay format).

### 12.5 Dev app, deploy, remote parity

- **Dev app chartered with three roles** (roles, not features): the local dev loop against both
  plugins; the colleague-facing **target-gallery demo** (parallel tabbed sessions across targets);
  the **diagnostic probe surface** (provisional affordance renderers now; the exploded-view
  instrumented readout when that fog graduates). One agent per target (`ElicitGherkin`,
  `ElicitAssurance`): static per-agent tool sets, and the shape Cloudflare forces anyway.
- **UI affordance package deferred**, named as intended: React renderers over `@flue/react`;
  non-React UIs build on `@flue/sdk`. The Petrinaut staging instead uses the committed
  `transport-aisdk` server wire, without introducing a second renderer. Milestone one keeps
  renderers in the dev app.
- **Milestone one is local-only**, with **remote-parity constraints pinned now** so nothing
  local-only creeps in: one-agent-many-conversations; pinned `agentName`; the storage port owned
  outside the plugin (harness-defined, binding-implemented, §9.6); no dynamic agent creation.
  Deploy-target choice waits on an infra conversation and blocks nothing here.
- **CI smoke** = `vite build` + the simulation suite (no model key, no flake); an optional
  secret-gated real-model `flue run` smoke once a provider key exists.

**FE-1437 application amendment (2026-08-20):** the imported `apps/brunch-agent` adds the remote
server role while carrying forward the local-loop, target-gallery, and diagnostic-surface charter.
`apps/petrinaut-website` is the September user-facing application; there is no dedicated demo shell.
The harness remains deploy-target-neutral, and deployment, authentication, and environment policy
remain application concerns.

**FE-1437 application-seam amendment (2026-08-21):** `apps/petrinaut-website` is the compile-time
Brunch–Petrinaut meeting point. `apps/brunch-agent` remains Petrinaut-independent and communicates
with the website only through the AI SDK/HTTP transport.

### 12.6 Version axes (named, none implemented)

API contract / plugin implementation / concept-schema / target-schema / persisted state. A change
to a field's meaning is not a serializer change; the future migration story must be able to decide
reuse / mechanical migration / reinterpretation-from-evidence / re-elicit.

## 13. Dev targets and milestone one

**Portfolio**: `plugin-gherkin` (tracer) + `plugin-assurance` (second target; forces the pack swap
and the evidence-graded envelope); BPMN/process-mining named third; full elicit-lean deferred.
**Hybrid order**: **both packs are authored before the pack interface freezes** (the two-targets-
on-each-axis rule, applied at design time — the trivial target must not freeze the contract before
the hard target has stressed it); **gherkin wires end-to-end first** as the cheap mechanism proof,
assurance immediately after.

### 13.1 Gherkin (milestone one)

Validation = parse validity + optional **pack-declared step-lexicon** binding check (a step
lexicon is pack policy, needing no external project). Live-codebase step binding is the target's
named growth path, deferred.

### 13.2 The assurance argument

The second target elicits an **assurance argument** — GSN's own noun; "proof obligations" is a
machine-generated-VC term of art and reads as a category error to verification readers (the
2026-08-10 rename; package `plugin-assurance`). Canon alignment: **GSN skeleton, Dafny nouns,
Lean sorry-taint semantics**.

Milestone-one contract (one record type):

- **`Statement`** with `kind` ∈ {`goal`, `strategy`, `assumption`, `lemma`, `theorem`,
  `guarantee`, `constraint`, `evidence`, `justification`, `context`}; `statement` (one indicative
  sentence); `owner`; `review_status` ∈ {`unreviewed`, `accepted`, `disputed`, `retired`}
  (assumptions only, from `dafny audit`); `criticality` ∈ {`catastrophic`, `major`, `minor`} —
  **sourced from safety engineering (DAL/SIL/ASIL), not Dafny or Lean, and the pack says so**;
  `evidence_refs[]`; `developed: bool` (GSN Undeveloped). Transcript provenance lives in the
  capture envelope, never duplicated inside the payload (the hidden-target-leakage smell).
- **Four edge kinds**: `supports` (GSN SupportedBy, inferential), `evidenced_by` (SupportedBy,
  evidential), `requires` (Dafny precondition), `in_context_of` (GSN InContextOf; scoping only —
  the first three are load-bearing for status).

### 13.3 Derived labels, the ledger, and the validator's honest stance

- **Five-stratum status derivation** (plugin-computed, via `project` at read time): S0
  `refuted`/`open` facts → S1 `BROKEN` (positive recursion) → S2 `WEAK` (undeveloped or
  unevidenced) → S3 `CONDITIONAL` (reachable open assumption — Lean's sorry-taint) → S4 `PROVED`.
  Negation only looks at lower strata; the validator enforces that stratification **and
  acyclicity of the three load-bearing edge kinds**. Per-claim status is a **derived UI label**,
  never headline.
- **The headline artifact is the assumption ledger** — every `open` assumption with owner, review
  status, and which guarantees it taints — shipped as a Markdown table, after `dafny audit`.
- **Acyclicity is recorded as a deliberate restriction** (trivially decidable validation, legible
  failures), with `decreases` — a well-foundedness witness — named as the future escape hatch.
- **The Datalog closure is sold as well-formedness and taint propagation, never an assurance
  verdict.** The ui never says "proved" unqualified — a GSN structure is a human argument; borrow
  Alloy's stance: this finds defects, it does not certify. (Lineage note: cite coherent-logic
  saturation — Datalog as its ∃-free, ⋁-free fragment — never "ARIA's Geolog", which does not
  exist.)

## 14. Acceptance material

### 14.1 The ten harness invariants (restated in envelope vocabulary; enforced as test properties)

1. **No value without provenance.** Every projected value traces to a capture (with evidence
   spans), a declared default, or a documented transformation.
2. **No silent conflict resolution.** Contradictory active captures resolve only via an explicit
   resolution record or supersession event.
3. **No silent projection loss.** Relevant active captures that cannot be represented appear in
   the typed loss report.
4. **Corrections don't erase history.** Superseded captures remain inspectable and never active.
5. **Retries are semantically idempotent.** A retried operation or re-swept range never creates a
   second user assertion (content-keyed capture identity).
6. **Issues are namespaced to their producer.** A plugin/target-domain requirement never silently
   becomes a harness-level requirement; harness envelope issues are namespaced to the harness.
7. **Plugin failures are atomic.** A failed operation leaves no partially applied deltas; sweeps
   apply whole or refuse whole.
8. **Equivalent state produces equivalent projection.** Projection is a function of the
   capture-store snapshot, never of discovery order.
9. **Unknown remains distinct from false.** Absence states never collapse to null or negation.
10. **Explicit remains distinct from inferred and defaulted.** Epistemic status never collapses.

### 14.2 The five proof obligations (contract acceptance criteria)

Independent variability · semantic conservation · explicit transformation · controlled elicitation
· local implementation — judged as in the criteria doc, against the hourglass. Companion tests:
**smallest-honest-plugin** (every contract addition checked against the bar it raises) and its
sibling the **second-binding test** (every time mechanism wants to land in the binding: "genuinely
substrate-specific, or mechanism leaking into Flue's dialect?").

### 14.3 Gating tests and review vocabulary

Gating: **reprojection / projector substitution** (capture once, project into materially different
targets, verify agreement); **minimal pairs** ("the budget is / might be €20,000"); **black-box
authoring** (public SDK + docs to a developer who hasn't read core; count concepts, boilerplate,
escape hatches). Review vocabulary (named smells): opaque payload waist, giant context bag,
schema-shaped questioning, null collapse, silent coercion/loss, correction-as-duplication, hidden
target leakage.

### 14.4 Testing strategy

**Generation-first fixtures over a deterministic replay driver**; HASH routes the Brunch workspace
tests through Turbo and Vitest — no model, no substrate. Hand-written fixtures are seeds; the corpus
is generated:

- Properties come from the **harness contract** — the ten invariants above are literally
  properties; generators come from the **plugin's declarations**, never its implementation
  (`arbitraryFromSchema`: Valibot → fast-check arbitraries), plus negative-space properties for
  plugin code (validators total — never throw, always typed issues; `project` never emits an
  undeclared loss category).
- Where dynamics are the subject: **model-based command-sequence testing** (`fc.commands`) over
  the envelope-derived alphabet — utter · settle-range · sweep · correct · contradict ·
  reply-with-absence · redirect.
- Language realism: a **model as offline generator, never CI oracle** — a model plays respondent
  against the plugin's own kernel cards, varied by persona/curveball, plus a mutation library
  generalizing minimal pairs (epistemic-status flips, absence injections, supersession
  injections). Outputs freeze as replayable fixtures; **regenerate when declarations change**.
- Shrunk counterexamples are minimal pathological conversations: pinned as regressions and read
  first as type-design feedback on envelope/payload types.

### 14.5 Open verification items (named, with homes)

- **Interpretation-render plugin-renderer seam** — exercised once real packs exist (milestone-one
  build, both plugins).
- **Restart durability of the full stack** — the capture store survives restart (proven, ticket
  13); conversation-store durability with a real `db.ts` is untested (milestone-one dev app).
- **Wake-wart residue** — §7.4's no-interpolation ruling removes the cause observed in ticket 10;
  confirm no other instruction-state write path re-triggers advisory wakes (milestone-one binding).
- **History-projection paging** (>1000 entries) and binding base-URL discovery — binding
  implementation details flagged by ticket 13.
- **Compaction vs. durable history** (§9.7) — verify that Pi/Flue compaction leaves the durable
  entry projection unmodified (or scope what the binding must preserve itself); no prototype has
  driven a session across a compaction boundary (milestone-one binding).

---

## Appendix A — Adjudications

The seven contradictions from the consistency pre-pass, and how this spec resolved each:

- **C1 — storage port implementer.** Binding-implemented, harness-defined, plugin-blind (ticket 12
  authoritative on ownership). Reconciliation: Flue's `db.ts` (substrate conversation storage)
  stays host-authored because Flue requires it of the consuming app; the harness's capture store
  is the storage port, implemented in the binding. §9.6, §12.5. Ticket 04's ownership-table "Host"
  row reads: input surfaces/identity → ui; deploy target, model/provider, artifact delivery →
  substrate; storage-port implementation → binding (pre-pass S5).
- **C2 — operation purity vs. PluginContext storage methods.** The four operations stay pure
  (snapshot-in/deltas-out); tickets 04+11 win — cadence-as-policy is load-bearing. Ticket 12's
  clause is scoped to non-operation plugin code; milestone one defines no storage-addressable
  PluginContext methods. §6.1.
- **C3 — capture status.** Derived at read time, never stored (ticket 12 authoritative); the
  envelope drops the `status` field. Retraction — previously unrecorded — is specified as an
  explicit user-cited event with no successor. §5.
- **C4 — explicit vs. inferred absence over string-only transport.** Ticket 10's transport finding
  is the physical constraint: tap-ness must be a transport fact. The harness defines a reserved
  reply encoding for structured taps; replies outside it yield inferred absences only. §5.1.
- **C5 — provenance rule vs. invariant 1.** Both survive, reconciled: user-derived captures cite
  true user entries only; `defaulted` / `external-lookup` captures cite a declared default or a
  documented transformation. The enum keeps all five values. §5, §9.4, §14.1(1).
- **C6 — one channel vs. one live affordance.** Ticket 10 authoritative on mechanism: the channel
  is a per-message current-affordance surface; durable identity/payload ride tool output parts;
  the reject-second rule covers interactive affordances per batch; non-interactive renders ride
  tool parts and never contend for the slot. §7.3.
- **C7 — wake wart and reply binding, picked together.** No instruction interpolation (removes the
  wart's cause and the numbering corruption); the pending question rides the ask tool's result and
  the pending-affordance slot; reply binding is harness-mechanical via the single-pending
  invariant — stronger than either ticket-10 option, and consistent with ticket 13's
  harness-resolved anchoring. No echo token. §7.4.

Assembler adjudications beyond the seven (each flagged inline): retraction semantics (§5);
`not-mentioned` as computed fact, absence-label mapping, and the `not-yet-decided` / `deferred`
distinction (§5.1); advisories as computed-ephemeral vs. stored issues (§6.3); issue namespacing
(§6.3); domain-label derivation inside `project` (§6.1, §13.3); transport-outcome vocabulary
(§7.5); session→document binding via `initialData` (§9.1); milestone-one store format constraint
(§9.6); kernel-card / harness-invariants naming (§3).
