# Universal elicitation synthesis

Compiled 2026-08-28. Part of the
[runbook teaching synthesis](runbook-teaching-synthesis.md).
Read-only research compilation. Specs, ADRs, prior prompts, and research notes are evidence and
hypotheses, not automatically current authority. Status labels: **Observed**, **Inferred**,
**Proposed**. This note does not amend `MISSION.md` or skill resources.

**Scope.** Interviewing judgment that should work for any expert-knowledge capture into a durable
workpiece, independent of later formal construction.

**Primary evidence.** Current teaching: `apps/brunch-agent/src/skills/sdcpn-modelling/elicitation.md`,
`ir-template.md`, `SKILL.md`, `checks.md`. Compiled repertoire:
`libs/@hashintel/brunch-agent/packages/core/src/repertoire.yaml`. Research notes:
[elicitation-strategy-literature](elicitation-strategy-literature.md),
[frontier-model-elicitor-failure-catalogue](frontier-model-elicitor-failure-catalogue.md). Design
hypotheses: `docs/specs/elicitation-to-ir-oracle-design.md`,
`docs/specs/structurally-typed-elicitation-runbooks.md`, `docs/specs/elicitation-completion.md`,
`docs/reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md`,
`docs/reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md`. Observed runs:
`docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md` and the two 2026-08-28
headless transcripts it cites.

This document does not prescribe destination-formalism investigation, construction mapping, or
interface contracts. Interview questions stay in the expert's operational vocabulary.

---

## Executive model

Good elicitation is an **information-seeking policy over unresolved meaning**, not a walk down a
destination outline.

The smallest coherent loop the sources support:

1. **Stance before structure.** Take what the model must answer, for whom, with what time and
   accuracy, and what sits inside the boundary — as interview stance, not as a numbered form.
   Completeness is relative to those questions, not to heading fullness or conversational fluency.
2. **One real case, then one property.** Walk a remembered occasion from arrival to leaving in the
   expert's words. Only then survey a single property across what that case revealed. Follow their
   thread; file into the workpiece afterwards.
3. **Deepen the unusable answer before recording it.** Vague quantifiers, normative “we would,”
   hedges, and memorable incidents are not yet values. Ask for the last time, what was attended
   to, how they would know, and — for quantities — typical then tail. Do not ask bare “why.”
4. **Keep origin and grade visible.** A value the expert did not say is assumed, unknown, omitted,
   or dropped — never theirs. Restatement is for correction; settled wording is theirs; assent to
   the agent's phrasing is not. Tension is asked about; a later correction supersedes; a genuine
   disagreement is kept as two accounts.
5. **Stop on named gaps, not on politeness or polish.** Name what is missing or assumed and let
   them choose. When they stop, open no new topic. Deliver the best current workpiece with
   deposits. A fluent interview, a syntactically full document, or the model saying “complete” is
   not enough.

The governing failure this model is built to prevent: **the agent treats its own plan, schema,
restatement, or fluency as evidence**, and therefore hardens, invents, overloads, accommodates, or
declares done.

---

## Proposition matrix

Lifecycle phase uses the skill's modes (`SKILL.md` Lifecycle): **orient**, **elicit**, **maintain
IR**, **check/deliver**. Construction is out of scope here.

Candidate home is one of: system prompt; skill body/lifecycle router; progressively disclosed
teaching resource; IR template; checks; nowhere/cut.

| Proposition | Source evidence | Lifecycle phase | Candidate home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- |
| Completeness is relative to the stated questions the workpiece must support, not to heading fullness, turn count, or fluency. | Literature §4.2 (Sargent, question-relative validity); repertoire `rabbit_holes` “Depth where nothing depends on it”; `elicitation.md` Prioritization; oracle design Claims 1 and 5; `checks.md` Elicitation sufficiency “Not enough: a fluent conversation…” | orient, check/deliver | checks (criterion); skill body (do not self-declare done) | Same case, two objectives of different width: the wider-objective run still stops when the IR is “full,” or the narrower one keeps probing trivia the objective does not use. | Observed as teaching; unproven as behavior. |
| Take time, purpose, confidence, and assumption-tolerance as **stance**, not as a form. | Repertoire runbooks.construct.kickoff “The posture”; `elicitation.md` Posture; ADR-0007 cited there. | orient | skill body (one-line invariant); teaching resource (how to sample without a battery) | First-turn numbered orientation list of four-plus independent questions vs one stance question: if the battery yields more load-bearing facts per expert-burdened minute, “not a form” is wrong. | Observed as teaching; **observed as currently failing** (both 2026-08-28 runs opened with numbered batteries *before* reading `elicitation.md` — proof Fog 1). |
| Establish inside / outside / why / time horizon before asking how the system is built. | Literature §1.2 opening-five and responses-before-structure; repertoire kickoff “Define the boundary and horizon,” “Purpose before structure”; `elicitation.md` Posture. | orient | teaching resource | A run that asks structure first still recovers the same objective-relevant facts with equal or lower burden, and the IR's purpose section is no worse. | Observed as literature + teaching. |
| Ask what they may vary, what response decides success, and what observation would make the result accurate enough. | Literature §1.2 table (questions 2–4); repertoire kickoff “Name factors and the accuracy bar”; `elicitation.md` Posture last sentence. | orient | teaching resource | Omitting the accuracy/observation question still produces an IR a cold reader can use to name the smallest next check; or asking it produces invented “success metrics” the expert does not use. | Observed as teaching; Mission 3 IRs still lacked numerical thresholds (`runbook-headless-…10-56-59…md` IR Goals). |
| Begin the slice with a bounded three-to-six-step account; do not request a diagram. | Literature §1.2 ACTA bounded opener; repertoire kickoff “Purpose before structure”; `elicitation.md` Questioning first bullet. | elicit | teaching resource | Unbounded “tell me everything” vs 3–6-step cap: if the cap truncates load-bearing branches the expert would have volunteered, the cap hurts. | Observed as teaching. |
| Walk one real case from arrival to leaving before sweeping a property across cases. | Repertoire movements.slice “One concrete case end to end”; trajectory “Slice, then sweep”; `elicitation.md` Questioning + Prioritization; proof Fog 7 (slice-then-story steered the run). | elicit | teaching resource | Sweep-first vs case-first on the same pack: if sweep-first acquires more load-bearing practiced rules per turn, slice-first is wrong. | Observed (teaching + Mission 3 attribution). |
| Prefer “when did that last happen, and what did you do?” to a generalisation. | Literature §2.2 CDM; repertoire techniques “Ask for the last time”; `elicitation.md`. | elicit | teaching resource | Last-time probes vs general “how does it work” on the same thread: if last-time yields only anecdote and misses the practiced rule, or the general question yields the same rule cheaper, the preference fails. | Observed as teaching. |
| Never ask “why do you do it this way?” as the primary probe; ask for an occasion and what was attended to. | Literature §2.4 (Nisbett & Wilson; Ericsson & Simon); repertoire “No bare why”; `elicitation.md`. | elicit | teaching resource | Pair: bare-why vs occasion+cues. If bare-why uniquely surfaces a load-bearing rule that occasion-probes miss, drop the ban. | Observed as literature-backed teaching. |
| Vague terms (“usually”, “roughly”, “mostly fine”) hide a distribution or exception; deepen before recording. | Repertoire lenses “Vague terms and quantifiers”; FM-14; `elicitation.md`. | elicit, maintain IR | teaching resource; IR template (refuse silent precision) | Record the hedge as a precise value without a clarification turn and see whether a cold reader treats it as expert fact; if graders cannot tell the difference, the rule is unenforceable in prose IR. | Observed. |
| Normative language (“we would”, “the rule is”) is policy, not practice; ask when that last actually happened. | Literature §2.3 policy-vs-practice detector; repertoire lens; `elicitation.md`; criteria research Polarity/modality. | elicit | teaching resource | Pair: “the rule is X” vs “last Tuesday we did Y.” If the agent files both as one practiced rule, the detector failed. If asking last-time always collapses a real standing policy the expert never enacts, the detector overfits. | Observed. |
| After a substantive answer, ask how they would know — what they are actually looking at. | Literature §2.2 ACTA universal cue follow-up; repertoire lens “Cues the expert relies on”; `elicitation.md`. | elicit | teaching resource (not every turn — load) | Cue follow-up after every answer vs only after load-bearing answers: if the former tanks discoveries per turn without adding checkable observables, the “after any” wording is too strong. | Observed as teaching; cadence uncalibrated. |
| Before a quantity, ask whether typical or tail matters; then typical, then one-in-ten worse/better; do not ask min / most-likely / max. | Literature §1.4 (Holm & Barra 69% triangular error; SHELF/IDEA quantiles); repertoire “Mean or tail,” “Quantiles, never three points”; `elicitation.md`. | elicit | teaching resource | Force min/mode/max vs quantile script on the same duration: if the triple is closer to a later checkable observation, the anti-triangular rule fails *for this expert class*. | Observed as literature; one-in-ten wording is repertoire convention, not a measured optimum. |
| A memorable incident is not a rate; ask opportunities and period. | Repertoire “One incident is not a rate”; `elicitation.md`; literature §1.4 stories-for-rare. | elicit | teaching resource | Incident-only IR records a frequency that a later “how often / over what period” would have contradicted. | Observed as teaching. |
| Batch two to four related survey questions only when they share a frame; probe one thread when deepening; an opening battery is a failure. | Repertoire licenses “Batch breadth, sequence depth” (explicitly one-run-vindicated); FM-12 (condition 1: 29 questions; condition 2: groups of 3–5 scored better); `elicitation.md`; proof Fog 1 (4–10 numbered questions still appeared). | elicit | skill body (hard: no battery before first answer); teaching resource (2–4 shared-frame) | (a) Opening battery vs one question: if the battery does not cause dropped answers or lower acquisition, FM-12's interaction cost is overstated. (b) Strict one-question vs 2–4: if 2–4 always drop items, revert to one. | Observed that overload happens and that smaller groups once helped; **the 2–4 number is Inferred**, not a proven optimum. Literature §8 also argues against batching. |
| Follow the expert's thread; do not interview by workpiece headings. | Repertoire smell “Schema-shaped questioning”; `elicitation.md` Caveats; `ir-template.md` “Do not read these headings aloud”; oracle hard-failure “schema-shaped interviewing”; runbook spec Structural schema. | elicit | skill body (one line); IR template (already says it) | Agent that reads IR headings as questions vs thread-following: if heading-order acquires more ledger facts with equal burden, schema-shaped is not a failure. | Observed as teaching; Mission 3 did not prove absence (proof says opening overload, not heading-catalogue failure). |
| When several turns produce nothing new, change technique (story, contrast, absences) rather than more of the same. | Literature §2.4 yield monitor (unstructured yield collapses); repertoire trajectory “Change technique when yield drops”; `elicitation.md` Prioritization. | elicit | teaching resource | Forced technique-switch vs continued open questions after a dry stretch: if switch does not raise new objective-relevant facts, the monitor is theatre. | Observed as literature; not seen in Mission 3 (interview truncated by construct command). |
| Depth is objective-relative; do not probe a thread no stated question depends on. | Repertoire rabbit_hole + license “Decline a sweep”; `elicitation.md` Prioritization. | elicit | teaching resource | High-appetite run that declines an off-objective thread vs one that follows it: if the declined thread was load-bearing for the stated objective, the decline rule failed. | Observed as teaching. |
| When appetite is high, follow the slice; when time is tight, synthesise and invite correction. | Repertoire trajectory “Select by posture”; `elicitation.md` Prioritization. | elicit | teaching resource | Time-pressured synthesise-and-correct vs continued slice: if synthesis silently hardens hedges, the tight-time bias is harmful. | Inferred (ADR-compiled; no Mission 3 time-pressure condition). |
| You may propose an assumption to unblock, stated as yours, with why and how to check; never as theirs. | Repertoire licenses “Say what you would assume”; FM-06/07; `elicitation.md` Evidence; `ir-template.md` Assumed; oracle Claim 4. | elicit, maintain IR | IR template (mark); teaching resource (license) | Unmarked precise value in IR with no expert span (baseline silent-assumption audit; FM-06 signature). If marked assumptions are ignored at construction equally often as unmarked ones, the mark does not help. | Observed. |
| Defer only by recording what is missing, why, and where it would come from. | FM-02/03; catalogue “Licensed deferral is a deposit”; repertoire license; `elicitation.md` Evidence. | elicit, check/deliver | IR template (Unknown / Not yet asked / Omitted); checks | “We'll get that later” with no IR deposit vs deposit: if the deposit is never used at close, it is ceremony. | Observed as failure class; Mission 3 did not exercise licensed deferral. |
| A value the expert did not give must not appear as theirs. | Repertoire smell “A value the expert did not give”; FM-07; `elicitation.md` Evidence; oracle hard-failure fabricated fact. | maintain IR | IR template + checks | Plant a load-bearing IR fact with neither span nor Assumed mark; a checker that still passes has no teeth. | Observed. |
| Restate in your words for correction; capture their settled wording, not bare assent to yours. | Literature §5.1 check-reflect; FM-15; repertoire “Restate to check”; `elicitation.md`; `ir-template.md` Maintenance. | elicit, maintain IR | teaching resource + IR template | Agent restates a rule; expert says “yes”; IR quotes the agent's sentence as expert evidence. If graders treat that as conservation, the rule is unenforced. | Observed. |
| When two answers tension, say so and ask; do not pick one silently. | Repertoire lens “Two answers in tension”; literature §5.1 consistency probe; `elicitation.md`; criteria Conflict handling; oracle silent-collapse gate. | elicit, maintain IR | teaching resource; IR template (Conflict) | Pair: two contradictory practiced rules. Silent merge vs surfaced ask. If recency-wins matches later expert correction *and* the first statement was a correction, recency can be right — so the probe must label correction vs disagreement first (see tensions). | Observed as teaching. |
| Correction supersedes the earlier active content and notes the replacement; it is not two live facts. | `ir-template.md` Maintenance; repertoire smell “Correction recorded twice”; criteria Revision and correction. | maintain IR | IR template | “Make that Monday, not Friday” leaves both active under the same heading. | Observed as teaching. |
| Distinguish not-mentioned, unknown, absent/not-applicable, declined, and deferred. | Criteria Absence states; challenges §6/§9; `ir-template.md` Unknown / Not yet asked / Omitted; completion spec items 9–11 (typed; **not** Mission 3 machinery). | maintain IR | IR template (marks); teaching resource (how to ask) | Pair: “I don't know the budget” vs “there is no budget.” If both become empty or both become “no budget,” the distinction failed. | Observed as criteria + IR marks; **elicitation.md does not teach the questions** — Inferred gap. |
| Semantic enough ≠ destination-schema enough; do not chase sink fields as if they were meaning. | Challenges §2 completion contract; criteria Semantic vs target completeness; runbook spec investigation vs questionnaire. | elicit, check/deliver | skill body (interview in expert vocabulary); checks (sufficiency is objective-relative) | Interview that mechanically fills every IR heading vs one that leaves Not yet asked on unused sections: if heading-filling wins acquisition of load-bearing facts, the distinction is wrong for this IR. | Observed as research hypothesis; Mission 3 IR still has empty/not-yet-asked sections by design. |
| Before delivering, summarise, state missing/assumed, give one chance to correct. Do not end because they seem busy; name gaps and let them choose. | Repertoire close “End properly,” “Press without trapping”; FM-04; `elicitation.md` Stopping; literature incorrect ending 19/28. | check/deliver | skill body + teaching resource | Burden cue (“I have to go”) → silent close with holes unnamed vs named choice. If naming gaps never changes the expert's stop decision and never improves the IR, the script is courtesy only. | Observed as teaching. |
| When they stop, open no new topic; deliver the best current result with gaps named. | Repertoire “Honour a stop”; `SKILL.md` Partial delivery; `elicitation.md` Stopping. | check/deliver | skill body | Stop signal followed by a new topic battery. | Observed as teaching; Mission 3 “stop” was a construct command, which *did* open construction rather than honouring an expert stop — different phase. |
| A fluent conversation is not completion; neither is model self-report. | FM-01, FM-13; repertoire smell “Fluent and empty”; oracle hard-failure terminal delivery on self-report; `elicitation.md` last line; `checks.md` Not enough. | check/deliver | checks | Agent says “we have enough” while load-bearing discoverable ledger facts were never asked (FM-08 signature). | Observed. |
| A clearinghouse “what didn't I ask?” is a cheap correction, not coverage proof. | Repertoire rabbit_hole “Clearinghouse as coverage”; literature §5.1; FM-08 never-asked blindness. | check/deliver | teaching resource (use); checks (do not treat as complete) | After clearinghouse “nothing else,” a hidden ledger fact remains unasked. If the agent marks complete, the rabbit hole fired. | Observed. |
| Assumptions and deliberate omissions are different deposits. | Literature §4.1 Robinson; repertoire close “Separate assumptions from simplifications”; `ir-template.md` Assumed vs Omitted; `elicitation.md` weaker (assumption license only). | maintain IR, check/deliver | IR template | Collapsed “limitations” list: a knowledge hole and a scoped-out region become indistinguishable to a cold reader. | Observed as literature + IR; elicitation.md under-teaches it. |
| Local restatement for correction; one full read-back at close — not whole-model restatement as progress. | Repertoire rabbit_hole; literature §4.4 walkthrough vs stability; `elicitation.md` Caveats. | elicit, check/deliver | teaching resource | Mid-interview full IR recap vs local check: if mid recaps increase correction of load-bearing errors more than they cost turns, the rabbit hole is overstated. | Observed as teaching. |
| Documents and schedules are propositions to confirm, not practice. | Literature §2.1 work-as-done; repertoire rabbit_hole “Document treated as practice”; `elicitation.md` Caveats. | elicit | teaching resource | Agent copies a stated schedule into practiced policy without “when did that last actually happen.” | Observed as teaching. |
| Hypotheticals only after a real case is on record; otherwise they return policy. | Literature §2.3; repertoire slice “Escalate hypotheticals only from a real case.” **Absent from elicitation.md.** | elicit | teaching resource | Unanchored “what would you do if…” vs variation of a narrated case: if unanchored matches later observed practice equally well, the precondition is unnecessary. | Observed as literature; not in current elicitation.md. |
| Use the expert's vocabulary in questions; do not interview in destination-schema terms. | Challenges §6; oracle Claim 6; `SKILL.md` Resource routing; proof Claim 4 (washdowns, line names — not construction vocabulary). | elicit | skill body | Expert-facing questions that use construction jargon vs operational terms: if jargon still acquires the same facts, the ban is stylistic. | Observed on Mission 3 for construction-vocab leakage (did not happen). Universal schema-term leakage still open. |
| Teaching that is only in a lazily loaded resource will not constrain the first turn. | `SKILL.md` “Read elicitation.md before asking substantive questions”; both 2026-08-28 transcripts ask numbered orientation questions in the activate-skill turn, before `read_skill_resource`. | orient | skill body or system prompt (the first-turn constraint); not elicitation.md alone | Move “no opening battery” into the always-on/skill body; if first-turn batteries persist, the home is still too weak (model disposition). | Observed. |
| Capture meaning and evidence before committing to a destination shape; projection may be lossy if loss is named. | Challenges governing principle; criteria Semantic conservation / Loss-aware projection; oracle conservation + gap discipline. | maintain IR, check/deliver | IR template (Loss, Omitted); checks | Silent drop of a fallback preference / hedge / conflict in the IR with no Loss/Conflict mark. | Proposed as architecture; the *distinctions* are Observed in IR marks. |
| Equivalent evidence in different orders should yield equivalent active meaning; genuine corrections stay visible. | Criteria Path independence; oracle Claim 8. | maintain IR | checks (evaluation); not a live interview script | Same fact set, two orders: active IR meaning diverges without a correction/conflict mark. | Proposed (evaluation); not a Mission 3 result. |
| Premortem (“it already went wrong”) for rare/catastrophic, demanding mechanism not sentiment. | Literature §2.2 (~30% more causes, Mitchell et al.); repertoire techniques Premortem. **Absent from elicitation.md.** | elicit | progressively disclosed teaching (rare-event branch) | Premortem vs “what keeps you up at night” on a rare failure: if premortem adds no mechanism the incident probe missed, cut it. | Observed as literature; not current elicitation.md. |
| Offer concrete tradeoff pairs rather than abstract weights. | Literature §2.1 swing weighting; repertoire “Trade weights through choices”; `elicitation.md` Caveats “Asking them to invent weights they do not use.” | elicit | teaching resource | Direct “what weight?” vs pairwise choices: if the expert already uses a numeric weight and the pairwise ritual distorts it, the ban is wrong. | Observed as teaching. |

Rows **not retained as universal interview behavior** (cut or parked in other syntheses): typed
`evaluateCompletion` algebra (`elicitation-completion.md` — kernel history); CDM full probe tables
and ACTA eight-probe scripts as always-on text (too bulky; disclose on strain); plugin/runtime
hourglass criteria (authoring, not interviewing); construction mapping, situation typologies, and
investigation heading catalogue (`elicitation.md` What to investigate / Target-formalism — not
universal).

---

## Technique families

### 1. Stance before structure

The interview exists to answer named questions at a named accuracy, inside a named boundary, under
a named time appetite. Those facts set which threads deserve depth. They are sampled from the
first exchanges, not administered as a questionnaire.

**Moves:** one or two purpose/boundary questions; refuse a structural tour until an objective is on
record; later decline sweeps the objective does not use.

**Counter-technique:** opening batteries that *look like* posture (purpose, metrics, scope, horizon
as Q1–Q4) while violating load. Current runs show this collapse is the default.

### 2. Slice, deepen, then survey

Two shapes of stretch: a **slice** (one case, one thread, end to end) and a **sweep** (one property
across what the slice revealed). Deepening happens on the unusable answer *before* recording and
*before* switching topic.

**Moves:** bounded step-list; last-time story; cue follow-up; shared-frame batch only on survey
questions; return to a new case when a sweep exposes a miss.

**Counter-technique:** heading-order coverage; generalisation-first; more of the same open
questions when yield drops.

### 3. Practice, cues, and grade — not slogans

Experts report policy, ideals, and vivid exceptions fluently. Usable content is what happened,
what they looked at, and how wide the quantity is.

**Moves:** policy-language detector → last instance; no bare why; vague-term pause;
typical-then-tail; incident ≠ rate; hypotheticals only as variations of a narrated case; pairwise
trades instead of invented weights.

### 4. Provenance as a recording discipline

The workpiece is a compiler from conversation: hypotheses stay labelled. The agent may propose,
rest, or omit, but may not launder that work as expert speech.

**Moves:** Assumed / Unknown / Not yet asked / Conflict / Omitted marks; restatement for correction
then their wording; deferral with a deposit; assumptions ≠ scoped-out simplifications.

### 5. Cross-examine without capturing the gavel

Tension is information. The agent holds both utterances and asks. It does not average, does not
always believe the latest line, and does not treat “yes” to its own sentence as origin.

**Moves:** consistency probe; discriminating case anchored in a real one; keep disagreements;
supersede corrections.

### 6. Criterion-based close, deposited partials

Stopping is a choice about remaining obligations, not a vibe. Fluency, representational
stability, user hurry, and “I think we're done” are all known false stopping rules.

**Moves:** name remaining load-bearing gaps; let them choose; honour a stop with no new topic; one
close read-back; clearinghouse as last correction not as proof; checks that read the IR, not the
transcript's tone.

### 7. Bound the conversational bill

Question cost is part of quality (oracle dimension “Conversation quality and burden”). The
high-value unit is one answerable question whose answer would change the workpiece.

**Moves:** no independent battery before the first answer; 2–4 only when they share a frame
(provisional); local not global restatement midstream; expert vocabulary.

---

## Failure modes and minimal pairs

Compact taxonomy from FM-01–15 plus Mission 3. Prevention is split: **technique** can change
question shape; **workpiece/checks** must make silent grade-change and never-asked holes visible
(catalogue Reflection: guidance cannot police what the model cannot see about itself).

| Family | Failure | Minimal pair (left should not equal right) | High-value probe |
| --- | --- | --- | --- |
| Opening overload | Plan completeness presented as one usable turn (FM-12; proof Fog 1; Bano incorrect opening 15/28). | “What must this model answer for you?” **vs** numbered Q1–Q4 on purpose, metrics, horizon, and boundary. | First assistant turn: count independent questions before any user answer. Fail if ≥4 or if any question's framing depends on an unanswered sibling. |
| Schema-shaped questioning | Destination outline becomes the script (repertoire smell; oracle gate; IR template warning). | Expert says “washdowns kill the week” and the next question follows that thread **vs** “now, participants; now, activities; now, policies.” | After a rich case, next question either deepens a named object in that story or jumps to an unread heading. |
| Policy versus practice | Normative fluency recorded as what happens (literature §2.3; repertoire lens). | “We always wash between families” **vs** “last Tuesday the crew skipped it because Meridian was due.” | Expert uses “we would / the rule is / supposed to”; agent either asks last instance or files a practiced rule with no instance. |
| Hedge versus precise value | Silent hardening (FM-06; baseline “every week or two” → exact interval). | “Maybe a couple dozen” **vs** “24 units.” | Hedge in transcript, precise scalar in IR with no clarification turn and no Assumed mark. |
| Correction versus conflict | Recency-as-truth or duplication (criteria; IR Conflict vs Maintenance supersession). | “Make that Monday, not Friday” (one active date, history noted) **vs** “Ops says Friday, QA says Monday” (both live). | Inject both: a self-correction and a two-source disagreement. Fail if both are merged, or if both are left as equal active facts under one heading. |
| Unknown versus absent | Null collapse (criteria Absence states; completion spec 9–11). | “I don't know the scrap count — quality would have to pull it” **vs** “there is no scrap tracking.” | Pair in one case. Fail if both become empty, both become “no scrap,” or unknown is treated as zero. |
| Premature accommodation | Burden treated as completion (FM-04; repertoire Burden and impatience). | “I'm out of time” → named remaining gaps and a choice **vs** “Thanks, I'll wrap up” with holes unnamed. | Burden cue while a discoverable load-bearing fact remains unasked. |
| Agent-authored restatement treated as user evidence | Unlicensed influence (FM-15; restatement license). | Expert: “yes” to agent's paragraph; IR quotes **expert's** later settled words **vs** IR quotes the agent's paragraph as source. | Restate a rule in agent diction; accept only “yeah.” Fail if that diction becomes the IR's expert voice. |
| Never-asked coverage blindness | Self-report cannot name what was never in context (FM-08). | Topic never raised, gap list also omits it **vs** `Not yet asked` on a demanded section. | Hidden ledger fact, no suitable question, IR claims completeness or omits the hole. |
| Deferral without deposit | Promise instead of record (FM-02/03). | “Quality has the number” stored as Unknown + source **vs** “we'll get that in a later session” and nothing in the IR. | External-source answer; inspect IR after the turn. |
| Fluent incompleteness | Rapport mistaken for coverage (FM-13; Bano-clean / gap-rich baseline). | Polished summary, empty demanded section **vs** awkward interview, filled case + named unknowns. | Score conversation smoothness and acquisition separately (oracle vector). |
| Invented content | Coherent fill of a hole (FM-07). | Load-bearing rule with no words and no Assumed **vs** same rule marked Assumed with a check. | Grader span check on every load-bearing IR sentence. |
| Representational-stability stop | Model stops changing ⇒ done (literature §4.4; FM-01 pleasantry loop). | IR unchanged for three turns, demanded questions unused **vs** explicit remaining questions. | Dry stretch then close without a criterion check. |

**Mission 3-specific observation (interviewing only).** Construction-from-IR was commanded
mid-interview; the agent built a partial IR and did not return with the smallest next question
(`fe-1525-headless-runbook-pn.md` Fog 5). That is a **lifecycle-router** miss (`SKILL.md` Return
from construction), adjacent to premature delivery, not a new interviewing technique.

---

## Current-material assessment

File: `apps/brunch-agent/src/skills/sdcpn-modelling/elicitation.md`. Assessment of the **universal**
portions; target-formalism sections are noted only where they contaminate interviewing.

### Keep

- Posture as stance (time, purpose, confidence, assumption appetite), boundary/horizon,
  factors/response/accuracy — keep the substance, not the implication that this is a first-turn
  checklist.
- Objectives before structure; bounded 3–6-step start; one real case before a sweep.
- Last-time; no bare why; vague-term pause; policy-vs-practice; cue follow-up; typical-then-tail;
  incident ≠ rate; restatement-not-assent; tension-as-ask.
- Assumption license; deferral-with-deposit; no silent expert-attribution.
- Slice then sweep; change technique on dry yield; objective-relative depth.
- Close script: summarise, name gaps, honour stop, fluency ≠ done.
- Caveats that are universal: schema-shaped questioning; structure before objective; document ≠
  practice; whole-model restatement; invented weights.
- Failure-mode *names* that match the catalogue (silent hardening, invented content, never-asked,
  opening overload, ambiguity bypass, unlicensed influence, premature accommodation, deferral
  without deposit).

### Move

- **First-turn load rules** (“opening battery is a failure”; read teaching before substantive
  questions) cannot live only here. Both real runs asked batteries in the skill-activation turn,
  before `read_skill_resource`. Home: `SKILL.md` / always-on router, as a hard constraint on the
  first expert-facing message.
- **Epistemic marks and supersession vs conflict** belong authoritatively in `ir-template.md`
  (already partly there). Elicitation teaching should point at those marks and teach the
  *questions* that produce them, not duplicate the legend.
- **Sufficiency / fluency ≠ done / no precise value without source or Assumed** belong in
  `checks.md` (already partly there) so close cannot be a vibe in the teaching file alone.
- **“What to investigate,” lenses, situation typologies, Transform-when-constructing** are not
  universal. They should not share the always-elicitation attention budget with interviewing
  judgment. Keep them out of the universal layer; if they remain in this file, they need a
  brighter split so the model can follow thread instead of typology catalogue.

### Rewrite (too vague to change behavior)

- “Opening overload” — no signature (count, independence, “before first answer”). Repertoire and
  FM-12 are specific; this file is a label.
- “Batch two to four… An opening battery is a failure” — two rules glued; the 2–4 license is
  one-run-vindicated and contradicted by literature anti-batching; rewrite as (1) hard: no
  independent battery before first answer, (2) soft: shared-frame survey only, with the
  uncertainty visible.
- “When appetite is high… when time is tight…” — no observable test; reads as mood.
- “Change technique — a story, a contrast, absences” — names without triggers or example
  questions.
- Failure-mode section — names without signatures. Either fold into the matching positive rule or
  import one-line signatures from the catalogue / repertoire `failure_modes`.
- Compound first bullet (“Objectives before structure. A bounded three-to-six-step account…”)
  packs two phases; agents in the transcripts treated “orientation” as a four-question form.

### Cut (from the universal layer of this file)

- Duplicate restatements of slice/sweep, assumptions, and failure names that already appear as
  positive rules.
- Target-formalism investigation list and typology blocks, if the job of this file is universal
  judgment. They are not “wrong”; they are the wrong layer for *this* compilation and they compete
  with thread-following.
- “You do not build the net during the interview” / construction mapping children — lifecycle
  router already says not to read construction to frame questions (`SKILL.md`). Repeating
  construction-shaped children in elicitation teaching is the contamination the runbook spec
  warned about (proof Fog 2: they did not cause jargon in these runs, which is weak reassurance,
  n=2).

### Absent

- **Correction vs conflict** (IR template has both operations; elicitation.md only has “tension”).
- **Unknown vs absent vs not yet asked vs declined** as *questions to ask*, not only as IR stamps.
- **Hypotheticals only from a real case** (in repertoire; not here).
- **Assumptions vs deliberate omissions** as a close discipline (repertoire close; weaker here).
- **Clearinghouse is not coverage** (repertoire rabbit hole; not here).
- **Name the grade / press without trapping** (repertoire licenses).
- **Propose structure for correction**, marked as the agent's (repertoire license; FM-15
  boundary).
- **Premortem** as a rare-event branch (repertoire; literature-strong).
- **Clairvoyant test** when a quantity is ill-defined or two sources may be answering different
  questions (literature §1.4, §5.3).
- **First-turn routing**: teaching is loaded too late to prevent the failure the file names.

### Duplication across the package

`elicitation.md` universal bullets are a compression of `repertoire.yaml`
lenses/techniques/movements/licenses/smells/failure_modes/runbook cells. `ir-template.md` repeats
restatement and correction. `checks.md` repeats hardening and fluency. That compression is
intended (runbook spec: two layers may merge in the rendered skill), but it currently **loses
signatures and licenses** while **keeping catalogue-shaped investigation text** that the
universal layer should not own.

---

## Tensions and open questions

1. **Where the first-turn constraint lives.** Teaching says no opening battery and read elicitation
   before substantive questions. Production path loads that teaching lazily. Both Mission 3 runs
   violated the rule. Unresolved: always-on one-liner vs accepting dispositional overload vs a
   mechanical turn-shape check (oracle inner loop already lists opening-battery detection as a
   cheap observation).

2. **Batching.** Repertoire: 2–4 shared-frame is a licensed departure from one-question guidance,
   one-run-vindicated. Literature §8: mental models surface late; anti-batching; vagueness is the
   most frequent human mistake. FM-12 shows 29 questions is worse than 3–5, not that 3–5 is
   optimal. The current sentence in elicitation.md papers over this.

3. **Posture sampling vs opening-five vs overload.** Literature wants five early *kinds* of
   information (decision, responses, factors, accuracy, scope) and “do not ask structure first.”
   Combined with “not a form” and “opening battery is a failure,” the agent has no legal way to
   collect five kinds except sequentially — which the model has not done.

4. **Conflict mark vs supersession.** IR template: keep both on Conflict; replace on later
   correction. Elicitation.md: one tension rule. Without a discriminating question (“are you
   correcting yourself, or do two practices coexist?”), both operations are un-teachable.

5. **Who owns never-asked holes.** Catalogue assigns coverage blindness primarily to machinery
   (declared demands). Mission 3 deferred typed completion. Prose `Not yet asked` plus checks is
   the current substitute. Unresolved whether that can bound path dependence (FM-09 complementary
   misses) without a hidden ledger — which is an evaluation instrument, not a product schema
   (oracle Case design).

6. **Guidance vs workpiece for semantic integrity.** Catalogue's main result: better interviewing
   changes question shape; silent hardening, invention, drop-on-rewrite, and false completion need
   durable state. A Markdown IR with marks is a bet that technique+prose can carry those
   distinctions. Mission 3 showed marks appearing; it did not show they prevent hardening (oracle:
   no statement→evidence links yet; n=1 per teaching edit).

7. **Close ritual vs construction command.** SKILL.md wants smallest next question on
   construction-discovered gaps. Proof Fog 5: agent named gaps and delivered partial. Unresolved
   whether that is correct partial delivery or a skipped elicit loop — and it is lifecycle, not a
   missing interview tip.

8. **Clairvoyant test, premortem, full CDM/ACTA catalogues.** Strong in the literature synthesis
   and repertoire; almost absent from elicitation.md. Unresolved whether compression was correct
   (too bulky for the skill body) or a real loss. Disclose-on-strain is the runbook spec's
   intended home; it is untested.

Do not treat `elicitation-completion.md` as the current stop rule: it specifies a typed kernel
function Mission 3 explicitly did not restore. Keep its *distinctions* (unknown is not a value;
conflict fails conservatively; stop ≠ complete); leave the algebra parked.
