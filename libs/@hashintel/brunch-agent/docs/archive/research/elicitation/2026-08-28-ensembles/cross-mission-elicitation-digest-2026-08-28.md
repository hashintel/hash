# Cross-mission research digest: elicitation judgment, SDCPN investigation, IR obligations, capture/IR seam (2026-08-28)

Four read-only research compilations were produced in parallel as conversation deliverables on
2026-08-28 (background research agents; no repo files were edited by them). This file is the
durable digest of all four. The full syntheses — including each mission's complete proposition
/ obligation matrices with source citations and falsifying probes — live in the session transcript
of that date and are not reproduced here; this digest records conclusions, convergences, and the
probes each synthesis proposed.

Conventions: each synthesis separated **Observed** (directly supported by local sources),
**Inferred** (consequence of sources), and **Proposed** (the synthesis's own recommendation).
Labels below carry that sense but are compressed.

---

## Mission 1 — Universal elicitation synthesis

Question: which interviewing moves and failure modes are universally supported by the local
sources, independent of SDCPN/Petri-net semantics? Sources: the oracle spec, the two agentic
elicitation references, the runbooks spec, `elicitation.md`, the local literature synthesis and
frontier-model failure catalogue, `elicitation-completion.md`, `repertoire.yaml`, FE-1525.

**Executive model.** The interview is objective-driven evidence acquisition. Five moves:
(1) frame first — objective, accuracy bar, boundary, posture before process content, because
completeness is question-relative; (2) acquire through concrete cases, not abstractions — one
walked case, occasion probes, quantile ladders, contrastive probes, hypotheticals only from an
anchored incident; (3) keep epistemic separation visible everywhere — expert statement, inference,
assumption, unknown, not-yet-asked, conflict, correction, omission remain distinguishable in
conversation and IR; assent to agent-authored wording is never user evidence; (4) spend questions
by information value — batch only cheap independent breadth, probe one thread while deepening,
change technique when yield drops; (5) stop on criteria, never on vibes — close with summary,
named gaps, a clearinghouse probe, one correction chance; partial delivery carries deposits.

**Technique families (five, each with one mechanism):** frame-setting; case-anchored deepening;
epistemic bookkeeping; divergence work (tension is the highest-yield material and is destroyed by
silent resolution); economy and close.

**Failure-mode taxonomy with minimal pairs:** opening overload; schema-shaped questioning;
policy-vs-practice collapse; hedge→precise-value silent hardening; correction-vs-conflict
conflation (recency is not universal truth); unknown-vs-absent conflation ("I don't know the
budget" ≠ "there is no budget"); premature accommodation (burden cue ends the interview with
unnamed holes); agent-authored restatement treated as user evidence. Each has a pack-inject
minimal pair and a grader check.

**Material absences found in the current `elicitation.md`** (supported in repertoire or
literature but with no home in the file): clearinghouse probe as a closing ritual;
hypothetical-escalation precondition; clairvoyant definitional test before recording quantities;
contrastive/discriminating probes and the expert–novice contrast; long-range consistency probe;
probe-depth policy (never accept a first answer on a load-bearing fact); vagueness guard on the
elicitor's own questions (the single most frequent human interviewer mistake, 21/28); explicit
exception/absence sweep; declined-to-answer as a distinct conversational outcome feeding the IR
(no IR mark exists today); anti-leading guard; premortem phrasing for failure-focused objectives.

**Duplications found:** caveats/rabbit-holes vs failure-mode lists overlap; restatement rule
stated in three places; typology question children restate the last-time probe; the failure list
re-verbatim 8 of 15 catalogue entries (fine as distillation; must not grow a second catalogue).

**Too vague to change behavior:** posture guidance without an observable differential; "high
appetite" with no signal; "several turns produce nothing new" with no threshold (adjacent to the
representational-stability stopping rule the literature links to premature stopping);
"deepen before recording" with no named end state.

**Top tensions:** the 2–4 batching rule failed to prevent 4–10-question opening batteries in
both real runs (fix recorded in MISSION.next as an unowned edit; open whether the invariant
belongs in the system prompt or the number is unearned); probe-vs-clarify default on ambiguity;
criterion-based stopping needs the objective/questions table first-class in the IR; universal↔
target-formalism migration is unexercised (typology question-shapes may be universal moves in
SDCPN dress); grader fluency preference (FM-13) threatens variant selection.

---

## Mission 2 — SDCPN investigation synthesis

Question: what must an elicitor investigate so a later SDCPN can represent the expert's process —
stated in operational vocabulary only. Sources: the oracle spec, the SDCPN reference papers, the
inbox elicitation-to-PNs doc, all five skill resources, `petrinaut-core/src/ai.ts` (construction-
coverage evidence only; its interview policy was explicitly not imported and partly contradicts
Brunch teaching), FE-1525.

**Minimum sufficient investigation model (8 obligations, all objective-relative):** one objective
with a measure and expert-judgeable threshold; one walked case; a spine (what flows, trigger,
order, prerequisites); **input fate per load-bearing step — consumed / reserved-then-released /
read** (flagged as the most construction-determining and least-volunteered distinction); timing
on the steps the objective touches, typical first, tail only if the objective cares; contended
resources plus the *practiced* contention rule (never inferred from the published schedule);
failure/recovery on the touched paths; marked epistemic state. Everything else (continuous
quantities, condition-dependent rates, batches, external arrivals, calendar boundaries) enters
only when the stated question depends on it. A first construction is legitimate with any typology
unrepresented, provided its absence is marked, not silently filled.

**Typology verdict:** all six keep — but Grouped movement is incomplete vs siblings, Mode change's
directional-loss probe needs splitting into components (time / material / availability / what
cannot run next), Timed work should include waiting-vs-working, Threshold trigger covers crossing
but not **scaling** (wear→failure rate, temperature→boil-off). **Two additions justified by
sources plus concrete failure modes:** external arrival/demand (a throughput model with no
arrival account is a silent Poisson invention) and condition-conditioned behaviour. Rejected as
typologies: queue/waiting, priority/deadline rules, escalation/approval (each would double-count
or is premature without an observed miss).

**Interview/construction boundary.** The distinction inventory (consumed vs reserved vs read;
does the level cross; is the rule written or practiced; does the batch stay together) may shape
questions in operational words. Node vocabulary, encodings, distribution families, parameter
plumbing, and structural guarantees must not reach the expert. The six `Transform to PN` lines in
`elicitation.md` are construction knowledge in the wrong file — move to `pn-construction.md`
(already duplicated there); two-run non-observation of leakage is weak evidence either way.

**Missing behavior:** the return-to-elicitation loop from construction (FE-1525 fog 5, never
exercised) needs a short concrete trigger list (missing objective; missing spine; unclear input
fate on a capped resource; policy-without-practice-check; arrival account absent under a
throughput objective; one-in-ten question when the objective cares about tails). `checks.md`
should gain a vacuous-success guard (side-quest `parseSDCPNFile` `ok: true` on an empty
document), an arrival/spine check, and a vocabulary check on the delivery.

**Adversarial probe catalog (8, ledger-ready):** policy-vs-practice (SOP 45 min, practiced 90);
shared-resource contention (schedule-implied priority nobody follows); hidden waiting (20 minutes
of work, 4 days of queue); directional changeover loss (dark→light costs a shift); rare incident
mistaken for a rate; unknown distribution (do not fit exponential); grouped work that may split;
a continuous quantity that triggers nothing *and* the scaling relation the objective depends on.
Plus two cheap extras: newcomer probe and borderline-case probe.

---

## Mission 3 — IR obligations synthesis

Question: what the elicitation-to-IR workpiece must preserve and make usable, independent of the
current heading catalogue, judged against both real Mission 3 `.ir.md` artifacts. Sources: the
runbooks spec, both IR specs, completion spec, ADR-0003, `ir-template.md`, both real run IRs,
FE-1525, CONTEXT.md.

**Headline observation:** in both real runs the IR was composed wholesale at the end of
elicitation and emitted once — a post-hoc digest, not the maintained workpiece the template
describes. Whether incremental maintenance is an obligation or an aspiration is itself a finding.

**What worked:** the six-mark epistemic vocabulary (run 2 ≈20 inline "Not yet asked" marks — the
template's clearest success); objective sharpening demonstrably drove omissions (run 2's
idle-hold question); the Resources heading carried the run's most consequential discovery
(changeover crew contention); validation criteria filled meaningfully in run 2.

**Two dumping grounds confirmed:** *Situation notes* (mostly duplicates other sections; mixes
construction-phase decisions "Omitted from first net" as if elicitation-era) and *Projection
losses* (three obligations share one heading: representability losses, construction decisions,
elicitation gaps). The strongest single structural correction: **open the loss register at
construction and forbid pre-construction speculation.** Also observed: "must not claim" overlaps
Omissions; run 1's Validation criteria and Assumptions stayed placeholder; run 2's Conflicts
"None identified yet" is a claim, not a check result.

**Observed strain spots:** assumption entries routinely lack the required "how to check"; the
conflict supersession rule was dual-homed in run 1 (inline *and* bulk section — the rule half-
followed); inline marks vs bulk unknowns lists duplicate each other with no authoritative home;
direction-dependence of quantities (run 1's 3h-vs-6h washdown conflict) is the weakest
representational spot — flat prose lists where a per-(entity, product, direction) entry shape
is the candidate strengthening.

**Required distinctions (12)** — where Markdown convention suffices and where evidence suggests
stronger structure: expert-said vs agent-assumed (prose suffices; enforce why+check shape on
assumption entries); the absence kinds (not-applicable never exercised); conflict vs resolved;
deliberate omission vs gap; prescribed/practiced/unwritten (strongest per-entry-mark candidate);
typical vs tail; direction/context-dependence (weakest spot); incident vs rate;
**elicitation-time gap vs construction-time loss (observed evidence for stronger structure)**;
expert words vs paraphrase; note authorship/phase (currently invisible); objective-relative
depth vs schema fullness (a completion concern, not storage).

**Candidate structural families (hypotheses, no winner):** (A) case-slice narrative + epistemic
ledger (one unsettled-item ledger as the sole gap home); (B) entity/resource-centric register
with per-(entity, product, direction) quantity entries; (C) current shape tightened by
phase-separating authorship (expert-given / agent-assumed / construction-decided / loss-at-
construction). D — append-only journal — recorded only to bound the space; contradicts the
maintenance model with no observed correction event justifying it.

**Cold-review oracle:** seven tasks a transcript-blind reviewer should perform (state the
objective; reconstruct process and order; separate the five epistemic classes; name unresolved
conflicts; name smallest next questions; judge construction readiness without inventing the
spine; spot-check a claim's epistemic standing and typical-vs-tail shape). Tasks 3 and 6 have
never been tested against the real artifacts.

**Rejected re-entry (with the strain that would revive each):** closed kind catalog; slots/
demand rows/precision ladder; capture envelope + fold (ADR-0003 registers); typed completion
algebra; per-statement epistemic enums; typed per-capture loss categories; firesWhen/motif/
repertoire/plugin machinery. Re-earned as *content* regardless: granularity rule, symbolic name
references, prescribed/practiced distinction, quantile elicitation, objective-anchored completion
as prose discipline, rationale-on-everything, verbatim expert names.

---

## Mission 4 — Capture/IR seam synthesis

Question: whether and how Mission 2's capture ledger and Mission 3's runbook IR should ever
relate. Sources: mission archive (M2), MISSION/MISSION.next, CONTEXT, oracle spec, runbooks
spec, IR-plain spec, completion spec, ADR-0003, FE-1525, plus the targeted kernel §5 envelope
mechanics that ADR-0003 points to.

**Observed constraints:** the capture pipe is idempotent and model-free (stable ids, content-
derived dedup keys excluding epistemic status, empty payloads only in production); the
interviewer does not own sweeping; store keying is Flue conversation identity; envelope
semantics exist as design, not typed content; the typed three-register IR of ADR-0003 is desk-
validated only — its fold has never run; the completion spec presupposes register-2 support
links, which presuppose typed payloads; the IR has no identity system (fence-scraped, rewritten
wholesale, compaction exposure unpinned); latency classes are separated (teaching 5–23s vs
construct 162–271s; Condition 5 = typed mapping + in-loop judgment + minute-scale ordinary
turns); construction proof is open (parseSemanticAcceptance failures, vacuous side-quest parse);
node identity is unproven across edit/regeneration cycles.

**Candidate comparison:** A — complete independence: zero Condition 5 exposure, fully proven,
but leaves the recorded observability gap open (no IR-statement → source-evidence links).
B — support links only: the only candidate whose gains (auditability, gap discipline) are
available without typed payloads; hard dependency is IR-statement identity, which does not
exist. C — capture fold produces IR proposals: presupposes rung-3 typed extraction and the
never-exercised ADR-0003 fold; highest Condition 5 exposure. D — one artifact: replicates the
recorded Condition 5 failure shape; refused.

**Shadow-join protocol (proposed, offline, no interviewer change):** re-run Mission 2's
mechanical sweep over an existing Mission 3 run's settled range *after* the interview; split the
IR into material statements (evaluation furniture ids only); grade each into seven classes
(direct support / multi-capture synthesis / inference / explicit assumption / unsupported /
correction-supersession / projection loss); compute six metrics — support coverage, synthesis
fan-in, capture utility, context dependence, correction integrity, path sensitivity. Record only.
The decisive never-measured quantity: fan-in vs support coverage at quote level.

**Identity analysis:** proven — capture ids, dedup-key idempotence, conversation-keyed store.
Unproven — net-id discriminator, IR statement identity (largest gap), Petri-net node identity,
evidence-span pointers and the `runbook-ir` fence under compaction (shared risk, no shared
mitigation). Any join addressing IR statements assumes an identity that has never been minted.

**Completion and control:** gap computation must be a derived read between turns (observer
pattern, queued), never inside the ask path; gaps name the smallest next question — the
mechanical fix for fog 5's delivered-instead-of-asked failure; terminal decisions stay derived,
never a persisted `complete` value. Precision-graded completion needs typed payloads and is not
available at quote level.

**Decision rules:** independence is supported by high fan-in + high context dependence
(quotes alone cannot justify claims); support links by low fan-in + high coverage + link-
repaired auditability, gated on a statement-identity probe; the fold by path-sensitivity
equivalence under order perturbation plus off-loop extraction with the elicitor not consulting
it; deeper merge only if sweep-idempotent and editable-workpiece semantics always agree
(nearly guaranteed never).

**Recommendation (Proposed):** keep independence as the production posture; run the offline
shadow join over Run 2 artifacts (zero elicitation cost, one grading pass) as the next
evidence step. Smallest overturning probe: if support coverage is high with fan-in ≈ 1 and
low context dependence, independence loses its main defense and support links become the
justified next mission — still offline-first, gated on hashing one IR across one regeneration
cycle. If fan-in and context dependence are high, independence is confirmed with data and the
fold question waits for M5's typed map and M6's extraction ladder.

---

## Cross-mission convergences

Findings that multiple syntheses reached independently, which raises confidence:

1. **`Transform to PN` lines in `elicitation.md`** — M1 and M2 both classify them as
   construction-phase content in the wrong resource; `pn-construction.md` already duplicates
   them; move keeps the noticing/questioning content and consolidates net-shape knowledge in
   one home. Retention so far rests on two-run non-observation of leakage.
2. **The return-to-elicitation loop from construction is unexercised** — fog 5 recorded the
   agent delivering `partial-with-named-gaps` instead of asking. M2 proposes the concrete
   trigger list; M4 shows how a support map would make gap→smallest-next-question mechanical.
3. **IR statement identity does not exist** — M3 (inline-vs-bulk mark duplication, wholesale
   rewrite) and M4 (the hard blocker for support links) both hit it from different sides.
4. **The two-run evidence base is calibration, not a baseline** — every synthesis treats
   replication as the standing gate before structural change.
5. **Shared failure modes** — opening overload (M1 tension; M2's batching family), policy-vs-
   practice, hedge-hardening, and incident-vs-rate appear in both M1's minimal pairs and M2's
   adversarial catalog; usable directly as the oracle's hidden-ledger pack.
6. **Loss/gap phase confusion** — M3's observed mixing of elicitation gaps into the projection-
   loss heading matches M2's follow-up-trigger design (gaps return to elicitation; losses go
   to delivery) and M4's shadow-join separation of gap vs projection-loss classes.

## Standing probes proposed by the syntheses (candidates for mission design)

- Shadow join over Run 2 artifacts (M4) — cheapest, zero elicitation cost.
- Statement-identity probe: hash one IR across one regeneration cycle (M4 gate for links).
- Deliberate PN-vocabulary-leak probe to close the Transform-to-PN retention question (M1/M2).
- Opening-battery hard gate across ≥3 replicates; probe whether system-prompt placement of the
  batching invariant reduces violations (M1).
- Cold-reviewer tasks 3 and 6 (epistemic separation; construction readiness) run against both
  existing IR artifacts (M3).
- Order-perturbation / replicate runs to test path sensitivity and typology sufficiency (M2/M3/M4).
- Reordered-evidence and burden-cue pack injects from the minimal-pair catalogs (M1).

## What this digest is not

It is not a decision record: no schema was chosen, no file was edited, and the full proposition
/ obligation matrices with per-row source citations and falsifying probes live in the producing
session transcript. It preserves no new invariant beyond what the cited missions already
recorded; where a synthesis's recommendation was labelled Proposed, it remains a hypothesis
with a named probe.
