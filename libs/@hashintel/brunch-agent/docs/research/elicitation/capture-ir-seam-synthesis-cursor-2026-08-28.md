# Capture/IR seam synthesis

> Provenance: read-only research compilation produced 2026-08-28 by a background research agent
> in the Cursor session behind this digest; companion to
> `cross-mission-elicitation-digest-2026-08-28.md`. Filed as `-cursor-` to avoid collision with
> same-titled documents produced by other agents. Reproduced verbatim.

**Status labels used:** **[O]** Observed (directly recorded in repo evidence), **[I]** Inferred (a consequence of observed facts and recorded design, not itself observed), **[P]** Proposed (this document's analysis or a hypothesis awaiting a probe). Files cited relative to `libs/@hashintel/brunch-agent/`.

---

## Observed constraints

### Mission 2 — the capture pipe (all [O], `docs/mission-archive/2-mechanical-capture-sweep.md`, Close section; `CONTEXT.md`)

1. **The pipe is idempotent and model-free.** One harness-side `applyCaptureSweep` over an explicitly named settled range of user entries wrote one envelope per user utterance, quote = that text, payload `{}`. Re-applying the same named user-entry ids returned the same capture ids with non-empty `skippedDedupKeys`; no second row was minted. Producing captures required no model call.
2. **The interviewer does not own sweeping.** Interviewer tools were only `activate_skill`, `ping`, `readPetrinautDoc`. No sweep tool, no scheduling by the model. This is a carried stop line.
3. **Identity is two-layered.** The harness mints a durable capture id; idempotence comes from a separate content-derived dedup key (evidence spans + payload, epistemic status deliberately excluded so an epistemic re-reading requires explicit supersession) — `docs/specs/elicitation-kernel.md` §5, enforced in M2's re-apply test.
4. **Store keying is Flue conversation identity** (principal + conversation id). Proven for the pipe; whether net ids are a stable discriminator is still an unproven Mission 4 assumption (`MISSION.next.md`, "Net create/save/load").
5. **Envelope semantics exist as design, not as typed content.** The envelope is harness-defined and domain-free: id, evidence spans (quoted excerpt + harness-derived pointer into session-log archive, anchoring only true user and user-affordance entries), one epistemic status, confidence, value-xor-absence state, alternatives grouping, one creation-time single-hop `supersedes` link; status (`active|superseded|retracted`) derives at read time; no status is ever written (`CONTEXT.md`; kernel §5, §5.1). All of this has been exercised in production only with **empty payloads**.
6. **Capture is a provenance ledger, not a workpiece.** M2's constraint and close flags: "no join to a runbook or IR template," "Flue history remains the conversation log; the capture store is not a second transcript," "typed payloads, token-threshold observers, and any join to a runbook or IR are not proven."
7. **Physical shape.** The store is a sibling JSON file `<flueInstanceId>.json` beside the Flue SQLite DB; internally binding's `TargetDocumentRecord`; the app API exposes no target-document ontology. Evidence-bearing apply requires the history reader to archive quotes before execute.
8. **The typed-capture kernel failed in practice, and the failure signature is recorded.** Typed mapping + in-loop LLM judgment produced ordinary question turns on the order of minutes — Condition 5 (`MISSION.next.md`, "Capture and runbook stay independent"; M2 imperative). Progressive reintegration is the recorded method for noticing where the threshold returns.

### Mission 3 — the runbook IR (all [O], `MISSION.md`; `docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`)

9. **One agent, one skill, no capture involvement.** One `ChatAgent`, one runbook skill `sdcpn-modelling`, four supporting resources. Proof checklist item 8: tool names were only `activate_skill`, `read_skill_resource`; `wroteCaptureStore: false`. Producing the IR and PN wrote no capture store (`MISSION.md` constraint and stop lines enforce this).
10. **The IR is structurally typed Markdown, semantically open.** It carries unknowns, not-yet-asked items, assumptions, conflicts, omissions, and named losses (Run 2 IR; checklist items 5, 7). It requires no closed kinds, slots, grades, or fold rules (`docs/specs/structurally-typed-elicitation-runbooks.md`; `CONTEXT.md` "Runbook IR": "not folded from captures… not a new persistence surface").
11. **The IR has no identity system and no durable surface.** It is recovered by scraping the last `runbook-ir` fence from `history()`; the model sometimes omits the closing fence (proof fog answer 4). No statement ids exist; the workpiece is rewritten by the model, not incrementally derived. A Flue compaction boundary that summarizes the fence away silently breaks recovery (`MISSION.next.md`, M4 cross-cluster interaction).
12. **Latency classes are now separated.** Teaching turns 5–23s (healthy); construct emission 162–271s — a different, by-design budget. The Condition 5 tripwire applies to ordinary teaching turns only (`MISSION.next.md`).
13. **Construction proof is still open.** Real runs 1–2 failed `parseSDCPNFile` semantic acceptance; the side-quest run parsed `ok: true` only vacuously (empty document, 0-for-9 `addType` schema rejections, $0.24699). The construction-discovered-gap return was never exercised as a loop — the agent delivered `partial-with-named-gaps` instead of asking (fog answers 5, 6).
14. **IR statement → source-evidence links do not exist yet.** The oracle design records this as an observability gap: real runs retain transcripts, IR artifacts, and timings but "do not yet provide exact IR-statement → source-evidence links" (`docs/specs/elicitation-to-ir-oracle-design.md`, Diagnostic assessment).

### Recorded design positions that constrain the join ([O] as recorded positions, [I] as their force)

15. **There is no designed join, and three premature convergence shapes were explicitly refused** (`MISSION.next.md`, "Capture and runbook stay independent"): (a) designed two-artifact join, (b) one artifact (sweep payload *is* the template update), (c) idle capture store. The sharpest open question is whether the runbook IR would be the *fold target* of swept evidence.
16. **The typed three-register IR (ADR-0003) is desk-validated only.** Register 1 = typed assertions; register 2 = the model, a **pure fold over active captures forbidden to interpret** (no semantic act at read time); register 3 = projections. Its condition — a full property pass plus a real fold through a working harness — has never been discharged: "Until the September build exercises a real fold, everything here is desk-validated" (`docs/adr/0003-three-register-ir.md`). [I] The "capture fold produces proposed IR updates" candidate would be the first real exercise of a design that has never run.
17. **The completion spec already assumes register-2 support links** — evidence must be "reachable through register-2 support links" or completion fails with `missing-evidence`; completion is a derived boolean + report, never a gate; a later capture can make a complete document incomplete (`docs/specs/elicitation-completion.md`). [I] This is the main existing mechanism that *presupposes* a capture→IR relationship — but it presupposes **typed payloads** to have anything to link.
18. **Mission 5's completion principle is recorded** (`MISSION.next.md`, M5): "required fields and unresolved gaps determine ask / construct / deliver, rather than the model self-reporting readiness." This is the standing anti-self-report rule any seam must serve.
19. **The oracle spec already sketches the shadow join and the narrow waist** (`elicitation-to-ir-oracle-design.md`, "Shadow join" section): offline, post-conversation, no interviewer change, seven relation classes, six metrics, and the explicit hypothesis that the waist may be only "evidence links, epistemic state, and explicit transformation/loss." This document operationalizes that sketch.
20. **Node identity is open** ([O] as recorded fog): mutation tools take caller-supplied stable ids, but "whether model-minted place/transition ids survive edit and regeneration cycles is unexamined. Mission 6's capture-to-node attachment cannot assume they do" (`MISSION.next.md`, M5 "Node identity fog").
21. **Mission 6's extraction ladder is recorded** (`MISSION.next.md`, M6): rung 1 = stub envelopes (proven); rung 2 = separate cheap extraction call emitting quotes/opaque blobs only; rung 3 = typed claims — the recorded Condition 5 failure mode, re-entered only to see the threshold. The observer/sweep mechanism is token-armed, fire-and-forget, queued, retried, with a fold gate and a periodic regroup the elicitor mostly does not consult.

---

## Candidate comparison

Labels: assessments are **[I]** unless marked **[P]** for this document's own judgment. "Condition 5 exposure" = risk of restoring typed mapping + in-loop LLM judgment + minute-scale ordinary turns.

### Candidate A — Complete independence (status quo, hardened)

Capture stays a provenance ledger of quote envelopes; the runbook IR stays a model-maintained Markdown workpiece; nothing references anything.

- **Provenance/auditability:** IR provenance is whatever the model writes into its own assumptions/unknowns sections. No mechanical link to user utterances; auditability rests on the cold-reviewer grader path. The recorded observability gap (fact 14) stays open.
- **Cross-turn synthesis:** unaffected — the model already synthesizes across turns into the IR; the best-observed behavior so far lives here.
- **Correction/supersession:** corrections live only as prose in the IR; no mechanism guarantees a correction supersedes the earlier statement rather than coexisting. Silent collapse of corrections is already a named hard-failure gate in the oracle — independence gives it no mechanical defense.
- **Identity stability:** no new identities required; also none gained. IR statements stay unidentifiable, so downstream consumers (Mission 5 typed map, gap-driven completion) cannot cite them.
- **Compaction/replay:** most robust — nothing depends on entry ranges or fences beyond the existing fence-scrape fog (fact 11).
- **Asynchronous extraction:** compatible with the observer-as-sweep plan (M6 rung 1) with nothing downstream.
- **Latency/Condition 5:** zero exposure — proven by both missions.
- **Completion/terminal decisions:** must come from IR-reading or grader-side criteria; the M5 principle (fact 18) is implementable over IR structure alone.
- **Target-formalism coupling:** none; the IR already couples to SDCPN through the runbook, capture stays domain-free.
- **Interviewer knows?** No — by construction.

### Candidate B — IR statements reference capture/evidence IDs (support links only)

Each material IR statement carries an annotation naming capture ids (or raw entry pointers) that support it, plus an epistemic mark and, for unsupported content, an explicit assumption/unsupported label. Nothing folds; the store stays quote-level.

- **Provenance/auditability:** the direct gain — every claim becomes checkable against a span; the `missing-evidence` pattern from the completion spec becomes available without typed payloads. This is the recorded "smallest useful join" if support links help without shaping conversation (`elicitation-to-ir-oracle-design.md`).
- **Cross-turn synthesis:** preserved — synthesis still happens in the model; links only record which quotes fed it. Fan-in > 1 links are evidence of synthesis, not a replacement for it.
- **Correction/supersession:** envelope `supersedes` exists (single-hop, active-heads-only) at quote level [O], so a corrected statement can re-point from superseded to successor captures. But IR-statement-level supersession has no mechanism — a retracted IR claim is just rewritten text. **[P]** Partial support only.
- **Identity stability:** **the hard dependency.** Requires (a) capture ids — proven [O]; and (b) *IR statement ids that survive model regeneration of the Markdown* — **not proven, not even existing** [O for absence, fact 11]. Without statement ids the links rot every turn. **[P]** Smallest viable form: link to capture ids from a durable IR surface, or hash-address statements, both new mechanisms.
- **Compaction/replay:** captures survive re-sweep idempotently [O]; but the evidence-span *pointers* point into the session log, and compaction behavior toward both pointers and the IR fence is unpinned (fact 11). Links compound the fence fragility.
- **Asynchronous extraction:** natural — a post-turn or post-conversation linker can attach/mend links without touching the interviewer.
- **Latency/Condition 5:** low but nonzero. If the *model* mints links in-loop, each IR update carries citation overhead (token cost, not minutes); if a linker is offline/async, near-zero. **[P]** The risk concentrates in whether link-maintenance becomes in-loop judgment.
- **Completion/terminal decisions:** enables evidence-backed gap reporting per IR section; does not by itself give precision-graded completion (needs typed payloads).
- **Target-formalism coupling:** low — links are envelope/pointer vocabulary, not kinds.
- **Interviewer knows?** Depends where linking lives: model-in-loop (yes, and it shapes behavior) vs. offline linker (no). The oracle's own stop condition forbids the shadow version from shaping questions.

### Candidate C — Capture fold produces proposed IR updates

Sweeps (observer-triggered, queued) fold active captures into *proposals* that update the runbook IR; the workpiece becomes what swept evidence accumulates into — the exact question the Mission 3 review posed (`MISSION.next.md`).

- **Provenance/auditability:** strong in theory (every IR change traceable to captures) — this is ADR-0003's design intent — but only if the fold is pure, i.e., typed. With M2's empty payloads a "fold" is LLM interpretation at read time, precisely what ADR-0003 forbids as unauditable [I, from fact 16].
- **Cross-turn synthesis:** the fold would have to *do* the synthesis mechanically — but cross-turn editorial synthesis is exactly what empty-payload captures cannot express. The candidate presupposes rung-2/3 extraction thickness.
- **Correction/supersession:** envelope-level supersession feeds a fold cleanly [I]; but the IR is model-rewritten text, so accepted/rejected fold proposals need their own identity and merge discipline against a mutating workpiece — an unowned mechanism today.
- **Identity stability:** requires stable capture ids [O] **and** stable IR-target addresses (section/node ids) that survive model regeneration — unproven (fact 20 analog at IR level). Both ends of every proposal link are shakier than anything proven so far.
- **Compaction/replay:** a fold over active captures is replayable if captures are (they are, [O]) — this is the candidate's genuine strength. But the proposal→IR-merge step reintroduces a stateful surface the Mission 3 stop lines explicitly exclude ("producing the IR or PN requires writing Mission 2's capture store or implementing template fill as apply-sweep").
- **Asynchronous extraction:** its natural home (observer + queued sweep + fold gate, `MISSION.next.md` M6) — but the fold gate "cannot fold unless the queue is valid" implies typed payload validation, i.e., rung 3.
- **Latency/Condition 5:** **highest exposure.** Extraction typing in any loop-adjacent position is the recorded Condition 5 signature (fact 8). Mitigations exist only if the fold is strictly off-loop and the elicitor never consults it — which reduces the candidate toward B-with-extra-machinery.
- **Completion/terminal decisions:** this is the only candidate that mechanically produces "evidence-backed gaps" per the completion spec's intent — but only with typed payloads; with quotes-only, gap reports degenerate to coverage counting.
- **Target-formalism coupling:** high — a meaningful fold needs payload types matching a target map (M5/M6), re-coupling the domain-free store.
- **Interviewer knows?** Must not (fold gate, elicitor-doesn't-consult-fold) [O as design]; anything the elicitor consults re-enters judgment on the turn path.

### Candidate D — One artifact: capture payloads and IR entries merge

The sweep payload *is* the template update (refused shape b) — the store and the workpiece become one persistence surface.

- **Provenance/auditability:** maximal if it worked; but merging destroys the separation that makes the IR a legible workpiece and the store an idempotent ledger. ADR-0003's acceptance oracle (a second projection consumes the model without rereading the transcript) becomes untestable because there is no independent register to consume [I].
- **Cross-turn synthesis:** must happen inside capture payloads — i.e., the model types synthesized artifacts during capture, the thickest possible extraction, and the interviewer is the only writer (sweeps are the sole write path [O], so synthesis would have to be extraction-thick).
- **Correction/supersession:** absent states and supersession exist at envelope level [O], but Markdown workpiece semantics (unknowns, assumptions, named losses as *document sections*) have no envelope equivalent; merging forces one of the two vocabularies to be abandoned or the envelope to grow IR semantics — breaking the domain-free waist.
- **Identity stability:** one identity system sounds simpler, but it must simultaneously satisfy content-derived dedup idempotence [O] *and* human/document-editing identity — two incompatible requirements being fused.
- **Compaction/replay:** replay of a merged artifact is undefined — is it re-swept (idempotent) or re-edited (not)?
- **Asynchronous extraction:** incompatible — the artifact must update in conversation to stay a workpiece, so extraction is in-loop by definition.
- **Latency/Condition 5:** **direct hit** — this is the exact shape of the old kernel's failure (template fill as sweep, typed claims in the loop). Both missions' stop lines name it.
- **Completion/terminal decisions:** conflated with document state; the completion spec's "derived boolean, never a gate" and "later capture can make a complete document incomplete" both break when document = store.
- **Target-formalism coupling:** total.
- **Interviewer knows?** Yes — the interviewer maintains the merged artifact; unavoidable.

**[P] Summary judgment:** A is the only candidate with zero Condition 5 exposure and the only one fully proven; B is the only candidate whose gains (auditability, gap discipline) are available without typed payloads; C presupposes rung-3 extraction and the never-exercised ADR-0003 fold; D replicates the known failure shape. The open empirical question separating A from B is measured by the shadow join below; the question separating B from C is whether support coverage with quote-level payloads stays high as synthesis fan-in grows.

---

## Shadow-join protocol

Post-conversation, offline, no interviewer change, no product write (`elicitation-to-ir-oracle-design.md` already constrains this; the stop line "if a shadow join requires in-loop extraction or changes the interviewer's questions, stop" is adopted verbatim). **[P]** below; the seven classes and six metrics follow the recorded spec's sketch, made concrete for empty-payload captures.

**Smallest procedure**

1. **Inputs:** one real Mission 3 run's artifacts — transcript (`history()`), the scraped `runbook-ir` fence, and the mechanical sweep output obtained by *re-running Mission 2's `applyCaptureSweep` over the run's settled user range after the interview* (or equivalent immutable envelope derivation in the evaluation harness). Captures are per-utterance quotes + pointers, payload `{}` — exactly the proven pipe, run backwards in time.
2. **Enumerate:** split the IR into material statements (atomic claims: facts, quantities, policies, absences, assumptions, losses, unknowns). Number them for the evaluation only — these ids are evaluation furniture, not product identity.
3. **Classify:** an offline grader (LLM grader with span citations, human-calibrated on hard calls per the oracle's middle-loop design) maps each statement to exactly one of:
   - **direct support** — one capture whose excerpt alone justifies the statement;
   - **multi-capture synthesis** — several captures jointly justify it, no single one does;
   - **inference** — a conclusion from captures that no capture states (the IR's own "assumptions" section distinguishes declared assumptions; see next class);
   - **explicit assumption** — the IR marks it as the agent's assumption/default, not user-derived (these stay *not* treated as user evidence, per the oracle's evidence-fidelity claim 4);
   - **unsupported content** — neither evidence nor an explicit assumption mark (a hard-failure signal, not a normal class);
   - **correction/supersession** — the statement supersedes or contradicts earlier captures/IR statements; record which captures are corrected and whether the earlier material remains visible;
   - **projection loss** — user-disclosed material the IR names as unrepresentable, omitted, or approximated (link to the capture(s) whose content is lost).
4. **Compute metrics** (definitions; all computable from the map + envelopes):
   - **Support coverage** — weighted share of material IR statements in direct-support, multi-capture, or explicit-assumption classes (importance-weighted using the oracle's hidden truth ledger where a case ledger exists). Unsupported content counts against it; projection losses do not, because loss is named.
   - **Synthesis fan-in** — median/upper-tail number of captures (and turns) feeding one statement. Fan-in ≈ 1 with verbatim quotes means quotes alone carry the meaning; high fan-in means meaning is editorial.
   - **Capture utility** — share of captures contributing to at least one statement (or to a named loss). Low utility = the ledger is recording things the workpiece never needs.
   - **Context dependence** — share of supported statements whose justification fails when the grader sees the supporting excerpt(s) without their surrounding turns. High context dependence = span-level provenance is honest but insufficient for audit.
   - **Correction integrity** — for conversations containing corrections: whether the superseded capture and the corrected statement both remain reachable and mutually linked, and whether any grader reconstruction of "current truth" from active captures alone reproduces the IR's current reading.
   - **Path sensitivity** — across replicated runs or reordered-evidence probes of the same case: does the support map (which claims are supported vs. synthesized vs. assumed) remain equivalent, even where prose differs? Divergent *support classes* under equivalent evidence is the signal that a fold would not reproduce.
5. **Record, don't act:** the map and metrics are evaluation evidence only. No IR annotation, no capture-store schema change, no interviewer prompt change.

**Instrumental note [I]:** with empty payloads, "direct support" tests whether the user's verbatim words justify the claim; "multi-capture" tests whether the meaning only exists across turns. That distinction — not capture content — is the actual measurement, and it is available *now* without any extraction model.

---

## Identity and lifecycle analysis

**Already proven [O]:**
- **Capture identity:** harness-minted durable id; content-derived dedup key (spans + payload, epistemic status excluded) proving idempotent re-apply over an identical settled range (M2 proof item 2; kernel §5).
- **Conversation identity (for the store):** principal + Flue conversation id, proven as the store key for the pipe.
- **Idempotent replay:** same range → same identities, twice.

**Recorded but unproven, or absent [O for the record, unproven in fact]:**
- **Net/conversation discriminator stability:** net-id-as-session-discriminator is an unproven M4 assumption; if it fails, the store rekeys (`MISSION.next.md`, M4; M2 close flag).
- **IR statement identity:** does not exist. The IR is one fenced Markdown block, rewritten by the model each time, recovered by scraping; no ids, no durable surface. Any join that addresses IR statements assumes an identity that has never been minted. **[P]** This is the largest unproven identity on the IR side of any seam.
- **Petri-net node identity:** mutation tools take caller-supplied ids; survival across edit/regeneration cycles unexamined; Mission 6's capture-to-node attachment must not assume it (`MISSION.next.md`, M5 fog).
- **Evidence-span pointers under compaction:** pointers resolve into the session-log archive (kernel §5); Flue compaction is default and unpinned (M4), and the `runbook-ir` fence surviving a compaction boundary is unpinned. Both the capture pointer *and* the IR fence have the same compaction exposure — a shared risk, not yet a shared mitigation.

**Lifecycle consequences [I]:**
- **Regeneration:** the IR is regenerated by the model throughout the conversation; even a perfect capture→statement link map is valid only against one IR revision. Any seam must define statement identity across regenerations (hash-of-content is the cheapest candidate; it breaks under benign rephrasing — itself measurable by the shadow join's path-sensitivity metric).
- **Replay:** a fold-based candidate (C) is replayable from active captures *only* if its merge step is also derived, not stored; the moment fold proposals persist into the workpiece, replay identity fractures.
- **Compaction:** unpinned for both ends of the seam. Before any join, Mission 4's compaction pin must cover (a) `runbook-ir` fence survival and (b) evidence-span pointer resolvability across the boundary. Neither is currently guaranteed.

---

## Completion and control

**[I]** The M5 principle (fact 18) — required fields and unresolved gaps determine ask / construct / deliver, never model self-report — is the control target. The oracle's hard-failure gates name the same enemy: "terminal delivery or 'complete' based on model self-report rather than evidence-bearing criteria."

**How evidence-backed gaps could inform control without joining capture into ordinary latency [P]:**

1. **Gap computation is a derived read, not a turn.** Whether gap evidence comes from support links (B) or a fold (C), the computation runs between turns or on demand — observer-triggered and queued (M6's recorded scheduler pattern), never inside the ask path. The elicitor's ordinary turns stay the proven 5–23s class.
2. **Gaps name the smallest next question.** The M3 fog answer already showed the failure mode: the agent delivered `partial-with-named-gaps` instead of returning to ask. A support map makes that mechanical: an unsupported or assumption-backed load-bearing statement *is* the gap; the named capture classes around it (declined vs. deferred vs. unknown-to-user, kernel §5.1's absence distinctions) determine whether re-asking is correct interviewing or nagging.
3. **Terminal decisions stay derived.** ask/construct/deliver read a gap report over (IR structure + support classes); nothing persists a `complete` value (completion spec's rule 1) and the report can flip back when later evidence contradicts (rule 16).
4. **The latency trap is specific and avoidable:** what killed Condition 5 was typed mapping and judgment *in the loop*, not the existence of capture. Control can consume evidence off-loop today (grader-side), and later via the observer path, without the interviewer ever calling a sweep tool or consulting a fold mid-question.

**What this cannot deliver without typed payloads [I]:** precision-graded completion (`below-required-precision`, admissible-status checks, rule 12/8 of the completion spec) needs slot-typed values; with quote-level payloads the gap report can say *that* something is unsupported but not *how far* a value falls below a demanded precision.

---

## Decision rules

Each rule names the shadow-join findings that would justify a stance; each candidate's falsifier is the finding that kills it.

1. **Continued independence (A).** Support: high synthesis fan-in + high context dependence — i.e., important IR material is cross-turn editorial synthesis that isolated quotes cannot justify, so span links would be decoration; and correction integrity is fine at prose level on graded cases. *Falsifier for A:* material IR statements are consistently supported by 1–2 verbatim excerpts with low context dependence, yet audits (cold reviewers, human reviews) still miss unsupported or silently hardened claims — evidence that links would add auditability the current path lacks.
2. **Support links only (B).** Support: low-to-moderate fan-in, high support coverage achievable at quote level, correction-integrity failures at quote level that links would fix, and evidence that links *added offline* improve grader/human auditability without shaping conversation. Prerequisites to even test: an IR-statement identity that survives one regeneration cycle (probe below). *Falsifier for B:* statement-identity cannot be stabilized across regenerations (links rot every turn), or link maintenance can only be done in-loop without degrading the teaching-turn latency class.
3. **Capture-to-IR proposal/fold (C).** Support: replication of equivalent IRs under order perturbation from active captures alone (path-sensitivity equivalence), fan-in staying tractable, *and* a rung-2/3 extraction that stays off the ordinary-turn path with the elicitor not consulting the fold — i.e., ADR-0003's fold exercised for real for the first time without returning to minute-scale turns. *Falsifier for C:* under order perturbation, equivalent evidence produces divergent support classes/active meaning (the fold is not a function of evidence), or any reintroduction of typed claims restores Condition 5 latency in ordinary turns (the recorded threshold reappears).
4. **Deeper merge (D).** Support: only if a single artifact demonstrably must be both idempotently sweepable *and* the model's editable workpiece — i.e., evidence that the ledger and workpiece answers are always identical and no independent re-projection is ever wanted. *Falsifier for D:* any observed case where idempotent-capture semantics and workpiece-editing semantics disagree (nearly guaranteed: absence states, section-level editing, and derived statuses have no common envelope representation) — and it is the explicitly refused shape with the recorded Condition 5 signature.

**Global stop conditions (adopted from the recorded stop lines):** any probe that puts a sweep tool on the interviewer, requires a model call to produce captures, wires the IR template to the store, or restores ordinary turns to minute-scale latency ends the probe and returns the evidence to mission design.

---

## Recommendation

**[P] Recommend: continued independence (A) as the production posture, with the shadow join (Candidate B-shaped, offline) as the *next evidence-gathering step* — nothing wired, nothing changed for the interviewer.** This is the only recommendation current evidence warrants: Mission 2's model-free pipe is proven and must stay intact as the floor; Mission 3's path works without capture and its construction proof is still open; every join shape stronger than B either presupposes the never-exercised ADR-0003 fold or replicates the recorded Condition 5 failure.

**Uncertainty, explicitly:**
- The evidence base is two real runs (one edit cycle apart), no replication, and a retrospective-only ledger — the oracle spec itself flags this as calibration material, not a baseline. Any metric computed today is directional.
- The decisive quantity — synthesis fan-in vs. support coverage at quote level — has never been measured even once.
- The IR has no statement identity, so even candidate B is blocked on an unproven prerequisite, not just on evidence.
- The narrow waist (evidence links + epistemic state + explicit transformation/loss) remains the recorded hypothesis, not a finding.

**Smallest probe that could overturn the recommendation:** take the existing Run 2 artifacts (transcript + scraped IR), run the mechanical M2 sweep over its settled range offline, have one calibrated grader produce the seven-class support map, and compute the six metrics. Cost: zero model elicitation, one grading pass. **Overturn condition:** if support coverage is high with fan-in ≈ 1 and low context dependence, independence loses its main defense and support links (B) become the justified next mission — still offline-first, gated on a statement-identity probe (hash one IR across one regeneration cycle and check survival). If fan-in and context dependence are high, independence is confirmed with data rather than caution, and the fold question waits for M5's typed map and M6's deliberate reintroduction ladder.

**Preserved invariants (completion criteria):** Mission 2's model-free, idempotent, empty-payload pipe is treated as the unamended floor throughout; nothing here wires capture into the live interviewer; Petri-net node identity is treated as open everywhere (M6 capture-to-node attachment is marked unassumable); every candidate carries an explicit falsifier and a Condition 5 analysis in the comparison and decision rules above.
