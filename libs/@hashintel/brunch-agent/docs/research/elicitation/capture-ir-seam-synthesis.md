# Capture/IR seam synthesis

Compiled 2026-08-28. Part of the
[runbook teaching synthesis](runbook-teaching-synthesis.md).
Read-only research compilation. Specs, ADRs, and evidence are history and reference, not marching
orders (`AGENTS.md`). `MISSION.md` is the only execution authority; `MISSION.next.md` records
upcoming concerns and standing constraints. Status labels: **Observed**, **Inferred**,
**Proposed**. This note does not amend `MISSION.md` or wire capture into the live interviewer.

This document compares possible relationships between Mission 2’s capture pipe and Mission 3’s
runbook workpiece. It does not design a join.

Terms kept distinct (`CONTEXT.md`):

- **Capture store / sweep / settlement / capture envelope / evidence span / epistemic status /
  absence state / supersession** — Mission 2’s provenance ledger and its kernel vocabulary.
- **Intermediate representation (IR)** — the historical typed three-register design (assertions
  fold into a derived model, which projections consume). Desk-validated; not what Mission 3 ships.
- **Runbook IR** — Mission 3’s structurally typed Markdown workpiece, filled during elicitation
  and consumed during PN construction. Not folded from captures, not a persistence surface.

**Condition 5** is the tripwire named throughout: typed mapping, in-loop LLM judgment, and
ordinary question turns on the order of minutes (`MISSION.next.md`;
`docs/evidence/evaluations/vestera-legacy-baseline/condition-5-turn-latency.md`).

---

## Observed constraints

### Mission 2 — mechanical capture pipe

**Observed.** Mission 2 proved a model-free capture pipe and explicitly did not feed an IR
(`docs/mission-archive/2-mechanical-capture-sweep.md`). The throughline is: settled Flue history
range → harness `apply-sweep` → capture store keyed by Flue conversation identity → same range
applied again → same capture identities.

**Observed.** After one user utterance, `applyCaptureSweep` wrote one envelope whose excerpt is
that text and whose payload is `{}`. Applying the same named user-entry ids again returned the
same capture ids and a non-empty `skippedDedupKeys`; no second row was minted. Interviewer tools
were `activate_skill`, `ping`, and `readPetrinautDoc`. No `sweep` / `brunch_sweep`. Stub proposals
are built from history text in-process; producing captures did not require an extraction model
call (`docs/mission-archive/2-mechanical-capture-sweep.md` Close;
`apps/brunch-agent/src/capture-sweep.ts`).

**Observed.** Stub extraction is one envelope per user utterance, quote = that utterance’s text,
payload `{}` (`apps/brunch-agent/src/capture-sweep.ts`). Epistemic status is hard-coded
`explicit`. There is no `supersedes` link on the stub path. Granularity is per utterance, not per
assertion.

**Observed.** The interviewer does not call a sweep tool and does not decide when to sweep. A test
or harness fact names the range (`docs/mission-archive/2-mechanical-capture-sweep.md` Throughline).
Stop lines that still carry: producing captures requires a model call; a sweep tool appears on
the interviewer; kinds / slots / fold or plugin/repertoire YAML re-enter as the teaching vehicle;
the runbook or IR template is wired to the store; ordinary turns return to Condition 5 latency.

**Observed.** Capture remains a provenance ledger with empty payloads. Typed payloads,
token-threshold observers, and any join to a runbook or IR are not proven
(`docs/mission-archive/2-mechanical-capture-sweep.md` Carried flags). The store is keyed by Flue
conversation identity (principal + conversation id). Net id as discriminator is still the
unproven Host-trunk assumption from Mission 1.

**Observed.** Capture files live as a sibling of the Flue sqlite file, named
`<flueInstanceId>.json`. Internal JSON is still binding’s `TargetDocumentRecord`; the app API
does not expose a target-document ontology. Flue history remains the conversation log; the
capture store is not a second transcript.

**Observed.** Envelope identity in core: a new capture mints `capture-${randomUUID()}` on first
apply; re-application skips when `captureRetryKey` (evidence excerpt + pointer + content) matches
an existing row (`packages/core/src/capture-store.ts`). `dedupKey` is canonical JSON of
evidence-or-basis plus content value-or-absence. Epistemic status is excluded from capture
identity (`CONTEXT.md`); the retry skip additionally matches `supersedes`, `epistemicStatus`,
`confidence`, and `alternativeGroup`. Status (`active | superseded | retracted`) is derived at
read time. Supersession is single-hop over active heads only; superseded captures stay visible.
Evidence spans require a quoted excerpt plus a harness-resolved pointer (session id + entry
range) anchored on true user or user-affordance entries.

**Observed.** Mission 1 already established Flue history as the only persisted session log, keyed
by one stable principal + conversation identity across chat, reload, client-tool follow-up, and
transcript export (`docs/mission-archive/1-bare-petrinaut-flue-chat.md`). Browser message
persistence is a UI cache. Compaction is Flue-default and unpinned. Net id as conversation
discriminator is a working assumption, unproven across Petrinaut create/save/load.

### Mission 3 — runbook and Markdown IR

**Observed.** Mission 3’s live contract forbids a capture join: “Do not call `applyCaptureSweep` or
join Mission 2’s store”; “producing the IR or PN requires writing Mission 2’s capture store” is a
stop line (`MISSION.md`). Proof item 8: the interviewer never calls a sweep tool and producing
the IR/net does not write Mission 2’s capture store.

**Observed.** The runbook IR is a teaching workpiece, not ADR-0003 register 2 and not a projection
of captures (`MISSION.md` Constraints; `CONTEXT.md`). Structural typing may fix headings,
nesting, unknowns, assumptions, conflicts, omissions, and losses. It does not require closed
kinds, slots, proposal types, precision grades, fold rules, or typed completion algebra.

**Observed.** On the production path, one `ChatAgent` mounts one runbook skill `sdcpn-modelling`
with four supporting resources. Headless drive is `createFlueClient` → `send` → `wait` →
`history()`. Tools on the interview path: `activate_skill`, `read_skill_resource` only.
`wroteCaptureStore: false`
(`docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`).

**Observed.** The filled IR is recovered by scraping the last `runbook-ir` fence from assistant
text in Flue history. There is no `usePersistentState` and no capture store. The model sometimes
omits the closing fence before `pn-json`; scrape still finds a block. The skill tells the agent:
“The block is the full current document, not a delta. That block is how the conversation recovers
the IR — there is no other store” (`fe-1525-headless-runbook-pn.md`; skill body quoted in
`docs/evidence/evaluations/vestera-runbook-headless/runbook-headless-2026-08-28T11-03-53-683Z.md`).

**Observed.** Both real-run IRs contain unknowns / not-yet-asked / assumptions / omissions. Run
2’s IR names inferences, unknowns, unrepresentable commercial weights, and VW-02 dark-tint loss.
Construction-gap return was unexercised as a loop: construction named gaps and delivered
`partial-with-named-gaps` instead of asking the smallest next question.

**Observed.** Interviewer `claude-sonnet-4-5`. Interview turns ~5–23s. Construct turns 162s then
271s — one model call emitting a large net, not a sweep/extract call. Ordinary teaching turns did
not return to minute-scale. Construct emission did (`fe-1525-headless-runbook-pn.md`). Opening
batteries of 4–10 numbered questions appeared on both real runs.

**Observed.** Mission 3 pried latency classes apart: teaching turns ran 5–23s (healthy); construct
emission ran 162–271s — a different budget, slow by design in one-shot form. The Condition 5
tripwire applies to ordinary teaching turns (`MISSION.next.md`).

**Observed.** IR recovery is compaction-sensitive in a way Mission 3 did not pin.
`MISSION.next.md` records: the runbook path recovers its IR by scraping Flue history; a
compaction boundary that summarizes the `runbook-ir` fence away silently breaks Mission 5’s
consumption pattern.

**Observed.** Mutation tools (`addPlace`, `addTransition`, etc.) accept caller-supplied ids.
Whether model-minted place / transition ids survive edit and regeneration cycles is unexamined.
Mission 6’s capture-to-node attachment cannot assume they do (`MISSION.next.md` Node identity
fog). The hermetic side quest proved six tools can execute from immutable `initialData`; the one
real-model construction run encoded `addType.elements` as a string nine times and never reached a
non-empty net (`fe-1525-headless-runbook-pn.md`).

### Standing constraint and Condition 5 failure

**Observed.** Capture (archived Mission 2) and the runbook / IR path (live Mission 3) have **no
designed join**. Whether they converge, and if so where, when, and in what form, is an open later
question. Do not wire them in order to tidy the list (`MISSION.next.md` “Capture and runbook stay
independent”).

**Observed.** Three premature convergence shapes were refused in that same standing note: a
designed two-artifact join (capture store as provenance ledger, template as workpiece, Mission 6
as the typed-match point); one artifact (sweep’s opaque payload *is* the template update); idle
capture store (Mission 3 ignores the store until something typed exists).

**Observed.** The typed-capture kernel failed as an interviewing mechanism: “The sweep mechanism
with typed captures became too complex and demanded too much LLM judgment to use it and to map
each part. The most recent real test was incredibly slow; the headline catastrophic outcome was
ordinary question turns taking upwards of two minutes” (`MISSION.next.md`).

**Observed.** Condition 5 cycle-1 run (2026-08-25): 29 minutes for 12 interviewer turns; mean ~145
seconds per turn, expert reply included. The interviewer made 37 model calls — three per turn —
and emitted 152,204 output tokens, of which roughly 4,300 were the interview and roughly 148,000
were extraction: 267 typed captures across 8 applied sweeps, plus three refused sweep batches
re-emitted after repair. About 97% of interviewer generation was the capture store, generated on
the critical path between the expert’s answer and the next question
(`docs/evidence/evaluations/vestera-legacy-baseline/condition-5-turn-latency.md`).
Per-call wall-clock was not recorded; timing claims are derived from the run window and token
counts.

**Observed.** Each Condition 5 interviewer turn had the same shape: interviewing call
(`brunch_ask`) → settlement check (elicitor decides whether the unswept tail is settled) →
`brunch_sweep` with typed proposals for the whole unswept range → apply, then advisories or
whole-batch refusal. The interviewer owned both *whether* to sweep and *what* typed claims to
emit (`docs/evidence/evaluations/vestera-legacy-baseline/transcripts/condition-5-system.md`;
latency assessment §3).

**Observed.** Condition 5 cycle-2 (2026-08-26): 166 active captures, 51 nodes, 0 unmapped, 93
unsatisfied demands; 7 sweeps applied, 5 refused. Node identity was the dominant harness defect:
one wash-versus-idle question became six near-duplicate objective nodes plus a separate
exchange-rate objective; entity types, policies, constraints, and activities showed the same
naming drift
(`docs/evidence/evaluations/vestera-legacy-baseline/readout.md` Cycle 2). Typed
payloads carried `kind`, `node`, `slot`, `precision`, `sourceRegime`, and an assertion value
(`docs/evidence/evaluations/vestera-legacy-baseline/transcripts/condition-5-captures.json`).

**Observed.** Completion-as-model-self-report failed across baseline conditions: Condition 1
declared the interview complete at turn 5 and never delivered until forced wrap; Condition 4
delivered on expert stop while its own tally said the floor was open; Condition 5 stopped as
`expert-stopped, partial-with-open-slots` with 93 unsatisfied demands still visible. “Completion
has to be an adjudicated contract, not model judgment”
(`docs/evidence/evaluations/vestera-legacy-baseline/readout.md`). Mission 5 records the
same lock: required fields and unresolved gaps should determine ask / construct / deliver, rather
than the model self-reporting readiness (`MISSION.next.md`).

**Observed.** The IR template’s correction rule is in-place rewrite: “When a later answer corrects
an earlier one, replace the earlier content and note the supersession in the conflicts/omissions
section rather than leaving two competing facts in the same heading” (skill resource
`ir-template.md`). Capture supersession, by contrast, keeps superseded envelopes visible
(`CONTEXT.md`). These are different correction models. They have not been joined.

**Observed.** Real Mission 3 runs retain transcripts, IR artifacts, tool/resource paths, and
timings. They do not yet provide exact IR-statement → source-evidence links
(`docs/specs/elicitation-to-ir-oracle-design.md` Diagnostic assessment). That spec is provisional
verification design, not execution authority.

**Inferred.** Utterance-granularity stub captures can cite *that the expert said something in a
turn*; they cannot, by themselves, name which assertion inside a long turn a Markdown heading
conserved, nor whether the IR’s wording is quote, paraphrase, synthesis, or assumption. Condition
5’s typed payloads tried to do that in-loop and paid Condition 5 latency for it.

**Inferred.** Mission 3’s healthy teaching-turn latency is evidence that a structurally typed
workpiece *can* be maintained without a sweep tool on the interviewer. It is not evidence that
the workpiece is auditable against user evidence, nor that a later join would preserve that
latency.

---

## Candidate comparison

Four candidate relationships, compared as hypotheses. None is a join architecture to build. The
interviewer-must-know column is folded into Condition 5 exposure: if the live interviewer must
know the mechanism exists, Condition 5 risk rises.

| Candidate seam | Benefits | Failure modes | Condition 5 exposure | Identity requirements | Evidence that would justify it | Evidence that would reject it |
| --- | --- | --- | --- | --- | --- | --- |
| **1. Complete independence** | Preserves Mission 2’s model-free pipe and Mission 3’s teaching-turn latency as separate proofs. Interviewer need not know a capture store exists. Runbook IR can keep in-place rewrite, unknowns, and losses without envelope algebra. Compaction, replay, and construction stay IR/history problems until Mission 4/5 pin them. | Auditability stays prose-only: no mechanical IR-statement → utterance map. Silent hardening and conservation misses remain grader-only (oracle spec Claims 3–4). Capture utility is unmeasured; the store can rot as an unused ledger. IR fence recovery remains compaction-fragile. Completion stays model- or runbook-self-report until Mission 5’s typed map. | **Low on the live interviewer**, provided sweeps stay off the question path. Residual risk: a later “tidy the list” wiring of template-fill-as-sweep, which Mission 3 already names as a stop line. Construct-phase minutes are budgeted separately and are not this tripwire. | Conversation identity already proven (principal + conversation id). Capture ids exist but are unused by the IR. Runbook IR has no statement ids — full-document re-emit is the identity. PN node ids remain open; independence does not need them. | Shadow-join finds that important IR material is cross-turn editorial synthesis that isolated quotes cannot justify (oracle spec Interpret). Teaching turns stay 5–23s while a joined path would require in-loop mapping. Capture payloads stay `{}` and still fail to explain IR headings. | Support coverage of load-bearing IR claims is high against utterance envelopes *without* changing questions; graders cannot distinguish acquisition from conservation without links; IR audit (cold reader) repeatedly fails for want of provenance. |
| **2. IR statements reference capture/evidence IDs** (support links only) | Smallest join that improves audit without making the IR a fold of captures. Direct support, multi-capture synthesis, inference, assumption, and unsupported content can be labelled against Mission 2 envelopes. Correction/supersession in the IR can point at which envelopes were current when the heading was written. Interviewer need not know the mechanism if links are written offline or by a non-interviewer extractor. | Links can fake grounding: an IR sentence cites a span whose quote does not actually support the claim (assent-as-evidence; oracle Claim 4). Stub envelopes are utterance-granular, so one capture id under-specifies which fact in a long turn. In-place IR rewrite can dangle or silently retarget links. If the interviewer is taught to emit links live, that is typed mapping by another name. | **Low if offline / post-hoc** (oracle Shadow join: must not change interviewer behavior or make extraction part of question-turn latency). **High if in-loop**: the interviewer would judge “which envelope supports this heading” every teaching turn — the same class of semantic act Condition 5 put on `brunch_sweep`. Ordinary-turn minutes return if that judgment rides the interviewing model. | Capture ids are stable under exact re-sweep of the same range (Mission 2). Evidence pointers are harness-owned. IR statement identity is **not** proven: each `runbook-ir` fence is a full document, not a delta, so statement-level ids would have to be minted by the linker, not by the workpiece. Linking to PN nodes is forbidden until node identity is proven. | Offline maps show high support coverage, modest synthesis fan-in, and improved cold-IR utility *without* the interviewer seeing capture ids. Correction integrity holds: later user utterances that contradict earlier ones are visible as superseding envelopes, and the IR’s replacement note cites both. Path-reordered evidence yields equivalent active meaning for linked claims. | Material IR claims require large synthesis fan-in or are context-dependent beyond isolated quotes (oracle: then captures should remain an audit ledger and the IR an independent workpiece). Live linking lengthens teaching turns toward Condition 5. Link targets churn because IR re-emission rewrites the whole document. |
| **3. Capture fold produces proposed IR updates** | Would reconnect ADR-0003’s hypothesis: write-time semantics in captures, pure fold into a model, gaps as issues not silent inference (`docs/adr/0003-three-register-ir.md`). Proposed updates could be accepted, rejected, or deferred without the interviewer scheduling sweeps. Asynchronous extraction (Mission 6 observer: token-count trigger, queued, not on the interviewer) could keep ordinary questions off the extraction path. | Fold-without-typed-payloads has nothing to fold: stub `{}` cannot regenerate Markdown headings. Fold-with-typed-payloads *is* the Condition 5 kernel (kind/node/slot assignment, proposal catalog, completion over register 2). Node-name drift already broke Condition 5 identity (six duplicate objectives). A “proposal” that the interviewer must review in-loop reintroduces judgment latency. IR-as-fold-target was the sharpest unasked question, not a decision (`MISSION.next.md`). | **High as soon as payloads are typed and mapping is live.** Condition 5’s 145s turns were exactly this: settlement judgment + typed sweep + fold + unsatisfied-slot report on the critical path. Observer/async extraction removes *when-to-sweep* from the interviewer but does not remove typed mapping cost; if the fold result is consulted every question turn, latency returns. Mission 6 admits this on purpose as a reintegration ladder, not as current product. **Low only while proposals are stub envelopes and the fold is offline evaluation.** | Fold identity is register-2 node identity: kinds + names + slots. Condition 5 showed that identity is the dominant defect under live typed capture. Capture envelope ids are stable; *node* ids derived from payloads are not. PN ids cannot be the fold key. Runbook IR headings are not a fold schema. | A capture fold reproducibly regenerates equivalent runbook IRs across order perturbations without restoring Condition 5 latency or in-loop judgment (oracle Interpret, third bullet). Extraction is a separate cheap call emitting quotes/opaque blobs, not interviewer-scheduled typed claims (Mission 6 rungs 2 then 3). Queue-valid fold is not consulted on ordinary teaching turns. | Regeneration diverges under order perturbation (path sensitivity). Typed mapping on or near the question path returns minute-scale turns. Duplicate nodes / possibly-equivalent advisories reappear (Condition 5: 167 advisories in cycle 1; six objective clones in cycle 2). Fold requires plugin kind/slot tables as the teaching vehicle — a Mission 3 stop line. |
| **4. Capture payloads and IR entries become one artifact** | One persistence surface. No dual-write. Template fill *is* apply-sweep. Envelope semantics (epistemic status, absence, supersession, evidence spans) would be the IR’s native state rather than Markdown conventions. | This is the refused “one artifact” shape (`MISSION.next.md`). It collapses the model-free pipe proof: payloads would have to be the workpiece, which means typed (or structured) content at sweep time. Mission 3’s IR is a full-document Markdown fence; Mission 2’s store is append-only envelopes with derived status. In-place IR rewrite vs visible supersession cannot both be native. Interviewer almost certainly must know the store exists (settlement, sweep, or template-as-capture). Target-formalism coupling is maximal: SDCPN headings become payload schema. Compaction/replay must keep *both* history and store coherent, or one lies. | **Maximal.** Condition 5 already ran a version of this: typed captures *were* the model, folded every sweep, reported as unsatisfied slots to the interviewer. Ordinary turns were minutes. Reuniting payload and IR entry re-asks the interviewer to map each part as it is said. | Would require a single identity for “this fact”: capture id = IR entry id = (later) maybe PN node id. None of those three identities currently coincide. Capture ids are UUID-at-first-apply; IR entries have no ids; PN ids are caller-supplied and unproven across regeneration. Dedup is content+evidence, so an edited IR sentence is a new capture, not an update, unless `supersedes` is emitted — which the stub path never does. | Not currently justifiable. A later probe would have to show that a single artifact is *less* judgment-heavy than two, that identity is stable across edit cycles, and that teaching turns stay seconds. No existing run shows that. | Already rejected as a premature shape. Falsified in advance by Condition 5’s in-loop typed store and by Mission 3’s successful IR-without-store path. Any live implementation that makes template fill = apply-sweep trips Mission 3’s stop line and Mission 2’s “no join to a runbook or IR template.” |

**Inferred, across the table.** Provenance and auditability rise from candidate 1 → 2, then stall
or reverse at 3–4 unless payloads become typed — at which point Condition 5 history says
auditability was bought with minute-scale turns and still failed node identity. Cross-turn
synthesis is something independence and support-links can *observe*; a fold must *perform* it,
which is the semantic act ADR-0003 parked at write time and Condition 5 then put on the
interviewer. Asynchronous extraction can help 2 and 3 only if it is not on the question path and
not consulted every turn (Mission 6 Ordinary turns: “the elicitor … does not consult the fold”).
Completion/terminal decisions need evidence-bearing gaps; only candidate 3’s historical design
claimed to compute them, and that computation was over typed register-2 slots that Mission 3
deliberately does not have.

**Proposed, not warranted.** Treat the four rows as evaluation hypotheses for the shadow-join
protocol below, not as a product sequence.

---

## Shadow-join protocol

**Proposed.** Smallest offline procedure. It must not change interviewer behavior, must not write
product architecture, and must not call `applyCaptureSweep` from inside a teaching turn. Source
of the shape: `docs/specs/elicitation-to-ir-oracle-design.md` § Shadow join, expanded only far
enough to be runnable on existing Mission 3 artifacts and future probe artifacts.

### Inputs

1. A frozen conversation: Flue `history()` (or the committed transcript Markdown + raw JSON).
2. The recovered runbook IR (last `runbook-ir` fence, as Mission 3 already scrapes it).
3. Mission 2-style envelopes over an explicit settled range of **user** entries: one envelope per
   user utterance, excerpt = that text, payload `{}`, ids and `dedupKey`s minted by the real
   `apply-sweep` *after* the interview, or equivalent immutable envelope ids in the evaluation
   harness (oracle spec). Do not put a sweep tool on the interviewer to obtain them.
4. Optional grader-only hidden truth ledger and expert side-channel `disclosedFactIds` (oracle
   Case design). These stay off interviewer inputs.

If a future probe also retains a Condition 5-style typed capture dump, keep it in a **separate
column**. Do not mix stub envelopes and typed payloads in one map; they answer different
questions (utterance support vs slot mapping).

### Statement inventory

Split the IR into material statements — load-bearing claims, named unknowns, assumptions,
conflicts, omissions, and projection losses — citing IR section path (e.g. `Goals, constraints…
/ VW-02 cannot run immediately after dark tint`). Do not treat heading presence as coverage.
Mark each statement’s IR-side epistemic cue from the template vocabulary: Unknown / Not yet
asked / Assumed / Conflict / Omitted / Loss (`ir-template.md`).

### Mapping relation (exactly one primary class per statement)

The offline grader assigns each material IR statement to one primary class, with citations:

| Class | Meaning | What to record |
| --- | --- | --- |
| **Direct support** | One capture/span’s excerpt is sufficient; the IR wording is a conservation of that utterance (or a trivial paraphrase). | `captureId`, pointer, excerpt. |
| **Multi-capture synthesis** | Several captures/turns are jointly required; no single excerpt justifies the claim. | Ordered `captureId`s; a one-line account of the editorial join. |
| **Inference** | The IR claim goes beyond the excerpts (generalisation, implied mechanism, “Record for construction” PN-shaped reading). | Supporting capture ids, if any; the inferential step named. |
| **Explicit assumption** | The IR already marks the claim as the agent’s (`Assumed`, with why/how-to-check). | That mark; whether any capture even loosely relates. |
| **Unsupported content** | Material claim with neither evidence nor an explicit assumption mark. Hard failure per oracle gates. | The claim; nearest distractor spans if any. |
| **Correction / supersession** | A later user utterance (or later IR emission) replaces an earlier meaning. | Earlier capture id(s), later capture id(s); whether the IR noted the replacement; whether stub envelopes show two active heads (they will: stub path emits no `supersedes`). |
| **Projection loss** | The IR names something the net cannot represent, or a transformation that discards meaning. | The loss sentence; whether it is grounded in user evidence, an assumption, or construction convention. |

Assent to agent-authored language is not user evidence (oracle Claim 4). A capture whose excerpt
is the expert saying “yes” to the interviewer’s phrasing is not direct support of that phrasing.

### Metrics

Compute on the statement inventory, weighted by the hidden ledger’s importance when a ledger
exists; otherwise report unweighted plus a load-bearing subset chosen before seeing the map.

- **Support coverage** — fraction of material IR claims that are direct support, multi-capture
  synthesis with named spans, or explicit assumption. Unsupported content is a hard miss, not a
  partial score.
- **Synthesis fan-in** — captures/turns required per IR claim (1 for direct; N for synthesis; 0
  for assumption-only or unsupported).
- **Capture utility** — fraction of stub envelopes that contribute to at least one IR claim. Low
  utility means the utterance ledger is mostly unused by the workpiece.
- **Context dependence** — fraction of claims that isolated quotes cannot justify (fan-in > 1, or
  inference). High context dependence argues for independence of the workpiece.
- **Correction integrity** — of known corrections (expert restatement, later contradiction, IR
  replacement notes): whether both the old and new evidence remain recoverable, and whether the
  IR’s active wording matches the later evidence. Stub envelopes will not mark supersession; the
  map must say so rather than inventing `supersedes` links.
- **Path sensitivity** — when the same disclosed facts appear in a different order (future
  replicated probes), whether active IR meaning stays equivalent while genuine corrections remain
  visible (oracle Claim 8). Existing Mission 3 runs are one-offs around a teaching edit, not
  replicated baselines; treat current path-sensitivity scores as calibration only.

### What this protocol is not

It is not a production IR feature, not a fold, not a reason to mount `brunch_sweep`, and not a
typed map to places and transitions. If executing it requires in-loop extraction or changes the
interviewer’s questions, stop: it is no longer an evaluation
(`docs/specs/elicitation-to-ir-oracle-design.md` Blind spots).

**First calibration set (existing artifacts, no new product wiring):** Mission 3 Run 2 transcript
+ IR (`…/runbook-headless-2026-08-28T11-03-53-683Z.md` and `.ir.md`) against a post-hoc Mission 2
stub sweep over that conversation’s user entries. Run 1 is the pre-edit comparator, not a
replicate. Condition 5 transcripts remain a *negative* control for in-loop typed mapping, not a
shadow-join input mixed with stub envelopes.

---

## Identity and lifecycle analysis

### Already proven

**Conversation identity.** One principal + conversation id hashes to a Flue instance. Reload
hydrates from `GET /api/chat?id=`. Flue history is authoritative
(`docs/mission-archive/1-bare-petrinaut-flue-chat.md`). Mission 2 keys the capture store by that
same identity until a Host proof lands
(`docs/mission-archive/2-mechanical-capture-sweep.md`).

**Capture envelope identity (idempotent re-apply).** First apply mints `capture-${uuid}`. Re-apply
of the same named user-entry range, with the same excerpt+pointer+content, skips and returns the
same ids (`packages/core/src/capture-store.ts`; Mission 2 Close). This is proven for stub `{}`
payloads on an explicit range named by a test, not for model-emitted typed batches and not for
“sweep whenever settled” on a live interviewer.

**Evidence identity.** Quotes are caller-supplied; pointers are harness-derived against the
session archive. Caller-supplied ranges are refused. Spans anchor only on user /
user-affordance entries (`CONTEXT.md`).

**Derived capture status.** `active | superseded | retracted` is read-time, not stored
(`CONTEXT.md`; `deriveCaptureStatus` in `packages/core/src/capture-store.ts`).

### Assumed or unproven — do not build a join on these

**Net id as session discriminator.** Working assumption: Petrinaut net id keys a localStorage map
of conversation ids; save/load keeps the same conversation; a new net id mints a new one. If net
ids regenerate or collide, rekey; do not invent a target-document (`MISSION.next.md` Mission 4;
Mission 1 carried flags).

**Target-document ontology.** CONTEXT.md defines a target-document as capture store plus session
history. Mission 2’s app API does not expose that ontology. Collapsing “one net *is* the
target-document” was rejected as unearned.

**Runbook IR statement identity.** Recovery is “last fence wins,” full document each time. There
are no stable statement ids across edit cycles. A later fence that rewrites a heading is not a
`supersedes` link; it is a new document that happens to share section titles. Compaction that
summarizes the fence away is an unpinned destruction of the only IR handle Mission 3 has.

**Capture identity under typed payloads.** Condition 5 minted many envelopes per utterance, keyed
partly on `kind`/`node`/`slot` inside `content.value`. Dedup therefore treats a renamed node as a
new fact. Cycle 2’s six objective clones are existence proof that payload-level identity was not
stable.

**Model / node identity (typed IR register 2).** ADR-0003’s elicited model is derived, never
stored; every model part answers “which captures made you.” That fold was not run on the Mission
3 path. Desk-validated only (`docs/adr/0003-three-register-ir.md`).

**Petri-net node identity.** Mutation tools take caller-supplied ids. Stability across edit and
regeneration cycles is unproven. Capture-to-node attachment (Mission 6) cannot assume it
(`MISSION.next.md`). The empty-net side-quest run never even minted live nodes.

**Replay.** Mission 2 replay is “same range, same capture ids.” Mission 3 replay is “same skill +
situation, stochastic interviewer and expert.” They are not the same replay.
Compaction-vs-durable-history (FE-1386) is unpinned.

**Regeneration.** Runbook IR regeneration is a full re-emit. PN regeneration in Mission 3 was
one-shot construct from IR (and failed to parse on real runs until schema work moved to Mission
5). Typed-map regeneration that mutates an existing net is Mission 5 and inherits the
node-identity fog.

**Inferred.** Any seam that needs a stable “this fact” across conversation, capture, IR heading,
and net node is stacking four identity systems of which only the first two are proven — and the
second only for empty payloads on an externally named range.

---

## Completion and control

**Observed.** Mission 3’s runbook already asks the agent to name unknowns, assumptions, omissions,
and losses, and to return from construction to elicitation when a check exposes a hole. The real
runs named gaps and then delivered `partial-with-named-gaps` instead of asking the smallest next
question (`fe-1525-headless-runbook-pn.md`). Typed mechanization of that return is recorded under
Mission 5, not as a capture join.

**Observed.** Historical completion algebra (`docs/specs/elicitation-completion.md`) computes over
ADR-0003 register-2 slot states and must-know rows. It reads nothing from fluency, turn count, or
delivery state. `complete` is never persisted. That function was not on the Mission 3 path;
restoring it would restore kinds/slots. Condition 4/5 showed interviewers will self-grade in
undefined words even when the contract is in context (baseline readout).

**Proposed, evaluation-only.** Evidence-backed gaps from a shadow-join can inform control
**without** becoming the interviewer’s completion oracle:

- **Ask** — when support coverage shows a load-bearing ledger fact was never elicited (acquisition
  miss), or the IR marks **Not yet asked** for a claim the hidden ledger calls load-bearing. This
  is a grader/driver signal, not a sweep tool.
- **Construct** — when the IR is recoverable and construction resources are in phase; Mission 3
  already separates this from teaching turns. Do not wait for capture extraction.
- **Deliver** — when the expert stops, or when remaining gaps are explicit assumptions/omissions
  the objective permits. Delivery is a session act; it must not flip a stored `complete` bit
  (`elicitation-completion.md` §15). Name losses. Do not treat syntactic fullness of headings as
  done.

**What not to do.** Do not let the model self-report completion (baseline finding; Mission 5
lock). Do not make capture extraction part of ordinary question latency (Condition 5 anatomy:
question not delivered until sweep/repair completed). Do not feed unsatisfied-slot lists from a
live fold into teaching turns until Mission 6 admits that judgment on purpose — and even then,
Mission 6’s own ordinary-turns rule is that the elicitor does not consult the fold every
question.

**Inferred.** Stub envelopes can tell a controller “this user turn exists and has not been
linked.” They cannot tell it “this must-know slot is below required precision.” That second
sentence needs typed payloads and a model schema, which is Condition 5’s interior. Until a
shadow-join shows that **Not yet asked** / **Unknown** lines in the Markdown IR already name the
same holes a typed completion report would, keep gap discipline in the runbook IR and the
evaluation ledger, not in a capture-derived controller.

---

## Decision rules

Findings are from the shadow-join (and later replicated probes), not from desk preference. Each
rule names what would support a deeper seam and what would send the work back.

### 1. Continued independence

Support this when:

- Context dependence and synthesis fan-in are high on load-bearing claims: the workpiece is doing
  editorial work quotes cannot mechanically reconstruct.
- Capture utility is low: most stub envelopes never appear in the map.
- Teaching turns stay in the 5–23s class only while the interviewer is capture-blind.
- Correction integrity is already adequate *inside the IR’s* Unknown/Assumed/Conflict/Omitted
  vocabulary, and envelope-level `supersedes` would not have changed a cold reader’s
  reconstruction.

Independence remains the default. It is also the only stance that currently preserves both
Mission 2’s model-free proof and Mission 3’s no-store throughline.

**Falsifier:** high support coverage of load-bearing claims against utterance envelopes, plus
cold-IR failures that those links would have prevented, *without* any interviewer-visible capture
mechanism.

### 2. Support links only

Support this when:

- Direct support + modest fan-in cover most load-bearing IR claims.
- Unsupported content (hard gate) drops when links are added offline, without changing questions.
- Correction integrity improves because later utterances are citable, even though stub envelopes
  lack `supersedes`.
- The interviewer still does not see capture ids; links are evaluation- or post-hoc-authored.
- Path sensitivity is low for linked claims.

This is the smallest *product* join that could later be considered. It is not justified yet:
Mission 3 artifacts have no IR-statement → evidence map (oracle Observability: partial).

**Falsifier:** live or offline linking requires in-loop LLM assignment of statements to spans at
teaching-turn latency (Condition 5 class); or most “direct support” labels fail human audit
(quote does not actually bear the claim); or statement identity churn from full-document IR
re-emit makes links dangle within a single session.

### 3. Capture-to-IR proposal / fold

Support this only when:

- A **separate** extraction path (not the interviewer; Mission 6 rung 2: quotes/opaque blobs, no
  slot types) plus a deterministic or tightly bounded fold regenerates IRs equivalent under
  order perturbation.
- Ordinary teaching turns do not consult the fold (Mission 6 Ordinary turns).
- Fold gate waits for a valid queue; observer/token trigger decides *when*, not `brunch_sweep` on
  the interviewer (Mission 2 constraint carried forward).
- Condition 5 latency does not return: question visible in seconds; extraction may be slow in the
  background.
- Node/statement identity is stable enough that proposed updates supersede rather than clone
  (Condition 5’s six objectives would reject this today).

**Falsifier:** any of — interviewer-scheduled sweep; typed kind/node/slot mapping on the question
path; minute-scale teaching turns; fold divergence under reorder; duplicate nodes; Mission 3
stop-line machinery (plugin YAML, `brunch_ask`, completion accounting) re-entering as the
teaching vehicle.

### 4. Deeper merge (one artifact)

Support this only when 3 is already true **and** keeping two surfaces is itself the strain
(dual-write divergence, not list-tidying), **and** a single identity for fact/envelope/IR-entry
survives edit, compaction, and regeneration, **and** teaching-turn latency remains seconds.

**Falsifier:** already present. Condition 5 was a live merge of typed payload and model; Mission 3
showed a workpiece without that merge; `MISSION.next.md` refused the one-artifact shape. A new
probe would have to overturn both the latency failure and the independence success. Empty
payloads cannot be the workpiece; typed payloads were the tripwire. PN node identity is
unproven, so a merge that reaches the net is additionally blocked.

---

## Recommendation

**Current evidence warrants continued independence in product, plus the offline shadow-join as
evaluation — not as architecture.**

Mark that as **Observed + Proposed**, uncertainty **high on the unknown map, low on the
tripwire**:

- **Low uncertainty** that wiring capture into the live interviewer, making template fill into
  apply-sweep, or restoring typed mapping/in-loop sweep judgment would recreate Condition 5
  (ordinary turns on the order of minutes). That failure is recorded.
- **Low uncertainty** that Mission 2’s model-free pipe and Mission 3’s capture-blind runbook
  should remain separately true. Neither proof includes a join; both name joining as out of
  scope or a stop line.
- **High uncertainty** whether a *later* support-link seam would pay its way. Observability of
  IR-statement → evidence links is currently partial; the two Mission 3 real runs are calibration
  material, not a replicated baseline.

Do not implement support links in the interviewer. Do not fold captures into the runbook IR. Do
not unify payloads with IR entries. Do not assume Petri-net node identity. Do not idle the
capture store as a plan to “fill it when types exist” — that was a refused shape; leaving it
unused until a probe exists is just independence, not a third architecture.

**Smallest probe that could overturn the recommendation toward support links:** after a Mission
3-style interview (interviewer still capture-blind), apply Mission 2 stub sweep offline over the
settled user range; map Run 2-quality IR statements to those envelopes using the protocol above;
have an omniscient grader and a cold IR reviewer score the same case with and without seeing the
map. If support coverage is high, synthesis fan-in is mostly 1, unsupported load-bearing claims
fall, and teaching-turn latency is unchanged, the independence recommendation is under pressure
and support links become the next hypothesis — still offline.

**Smallest probe that could overturn toward a fold:** the support-link probe *plus* order-perturbed
replays in which a non-interviewer extractor’s output regenerates equivalent active IR meaning
without typed in-loop mapping. Until that exists, a fold is Condition 5’s interior wearing a new
name.

**What would not overturn it:** construct-phase minutes (already budgeted separately); a prettier
Markdown template; an idle store waiting for Mission 6 types; attaching captures to PN nodes
before node identity is proven.

---

## Completion notes

Every candidate has an explicit falsifier in the comparison table and in Decision rules. Condition
5 analysis is specific: the failure was typed mapping plus in-loop settlement/sweep judgment on
the interviewing model, with ordinary question turns ~145s (cycle 1 existence evidence), not
“LLMs are slow” and not construct-once emission. Mission 3 split those latency classes; this
synthesis does not collapse them.

Mission 2’s model-free pipe stays a pipe: explicit settled range, empty payloads, no extraction
model, no sweep tool on the interviewer, idempotent identities. Nothing here proposes putting
`applyCaptureSweep` on the live interviewer or teaching the skill to schedule sweeps.

Mission 3’s runbook IR stays a Markdown workpiece recovered from history, not a fold of captures
and not ADR-0003 register 2. Node identity for Petri-net places and transitions remains open; no
candidate is allowed to assume it.

The candidate narrow waist — **evidence links + epistemic state + explicit transformation/loss**
— is an evaluation hypothesis (`docs/specs/elicitation-to-ir-oracle-design.md`), not a persistence
schema.

**What that waist can support without typed capture payloads:**

- Pointing a runbook-IR sentence at utterance-level envelopes and spans (direct support /
  synthesis / unsupported).
- Distinguishing IR-side marks already in the template (Unknown, Assumed, Omitted, Loss) from
  capture-side stub status (all `explicit`, value `{}`). The mismatch is itself data: stub
  epistemic status cannot encode inference; the IR already can.
- Recording projection loss as named construction/check content, citing whether the lost thing
  was said, assumed, or never asked.
- Measuring capture utility and context dependence to decide whether independence or support
  links is the honest seam.

**What it cannot support without typed payloads (and must not pretend to):**

- A pure fold into a kind/slot model, demand-row completion, or unsatisfied-slot cues
  (`docs/specs/elicitation-completion.md`; ADR-0003).
- Per-assertion granularity (one utterance, many facts) — Mission 2 stubs are one envelope per
  user turn; Condition 5 typed captures were many per turn and paid for it.
- Mechanical `supersedes` on correction — stub sweep never emits it; IR in-place rewrite is a
  different lifecycle.
- Mapping to places, transitions, arcs, or stable net ids.
- Telling the interviewer what to ask next from a computed slice.

Until the shadow-join is run, the waist is unmeasured. Measuring it offline is the work that can
choose among the four candidates. Implementing any of them in the live interviewer would be
designing past the fog-line.
