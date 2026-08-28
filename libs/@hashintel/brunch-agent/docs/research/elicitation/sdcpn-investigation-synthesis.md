# SDCPN investigation synthesis

Compiled 2026-08-28. Part of the
[runbook teaching synthesis](runbook-teaching-synthesis.md).
Read-only research compilation. Specs, ADRs, and evidence are history and reference, not marching
orders. Status labels: **Observed**, **Inferred**, **Proposed**. This note does not amend
`MISSION.md` or skill resources.

This document is research guidance for Brunch teaching: what an interviewer must investigate,
notice, deepen, and conserve before a simulation can represent an expert's process usefully. The
expert knows an operational system and is not a modeller. Interviewing stays in their vocabulary.
Prompting and teaching are Brunch-owned. Petri-net and Petrinaut API contracts are
Petrinaut-owned. Construction knowledge may shape what the interviewer notices; it must not become
what the expert is asked. `petrinaut-core/src/ai.ts` is coverage, not interview policy.

---

## Minimum sufficient investigation model

A useful first construction does not need a complete process encyclopedia. It needs a **slice
whose load-bearing distinctions are known, and whose holes are named**. Depth is relative to the
modelling question the expert actually has.

**Observed.** `checks.md` already states a first-construction floor: at least one objective in the
expert's terms; one concrete case walked end to end; the IR can locate goals, the process
boundary, the main activities and their order, and the resources those activities contend for;
unknowns, assumptions, and omissions are visible rather than silently filled. A fluent
conversation and a heading-full IR are not enough (`apps/brunch-agent/src/skills/sdcpn-modelling/checks.md`,
“Elicitation sufficiency”).

**Observed.** The oracle design's primary question is whether the conversation acquired
objective-relevant evidence and conserved its meaning, epistemic status, conflicts, gaps, and
losses — not whether the IR looks complete (`docs/specs/elicitation-to-ir-oracle-design.md`,
“Verification stance”, claims 1, 5, 6).

**Observed.** The original investigation catalogue
(`docs/inbox/eliciting-and-constructing-processes-to-PNs.md`, “Things the agent should
investigate”) and the current elicitation resource (`elicitation.md`, “What to investigate”) agree
on the operational clusters: what the process seeks and how it is judged; what starts a case and
what else must be true; who and what is involved and what is capped; what each step takes, uses,
produces, and can fail at; how work branches, retries, and recovers; how long things take and how
they vary; what people actually do versus what is written; what observation would make a result
good enough.

The smallest set that later construction can honestly consume is therefore not “every IR heading
filled.” It is these operational distinctions, **cut to the stated question**:

1. **The question.** What decision, comparison, or worry the model must help with, in their words
   — and what it must not claim. Without this, every later probe is uncalibrated.
   (`elicitation.md` “Posture…”, `ir-template.md` “Purpose and outcome”, `SKILL.md` Orient.)
2. **The case boundary.** What starts a case, what counts as done, what is inside, what is outside
   and why, over what horizon the answer must remain useful. (`elicitation.md` “Process boundary,
   triggers, and prerequisites”; inbox “Triggers”.)
3. **One walked occasion.** Arrival to leaving, in their names, before any property is swept
   across many cases. This is the spine: the main things that happen, in order, and what is
   occupied while they happen. (`elicitation.md` “Questioning and deepening”; both headless runs
   began this way, with different grain.)
4. **Distinctions that change what happens.** Not every attribute of every actor. Only properties
   the process treats differently — a line that cannot run a family, a crew that is only on days,
   a product that cannot follow another. (`elicitation.md` “Participants, locations, and
   resources”; `pn-construction.md` “A type of thing the process treats differently may become a
   colour; only when the IR says the distinction changes what happens.”)
5. **Use of the scarce things on that spine.** For each load-bearing input: used up, occupied and
   later freed, or only looked at. How many there are. What happens when two bits of work want
   the same one. (inbox “Steps” consume / reserved / read; `elicitation.md` contended-resource
   typology.)
6. **Time only as far as the question cares.** Whether a step takes time; typical duration; a
   worse tail if the tail is what would change the decision. Do not force a distribution the
   expert cannot observe. (`elicitation.md` timed-work typology; inbox “Does the step take
   time…”.)
7. **Unhappy paths that the question depends on.** What can go wrong, what then happens to the
   work in hand, whether that is ordinary or rare. A memorable incident is not a rate. (inbox
   “Failure modes”; `elicitation.md` branching typology and “A memorable incident is not a
   rate.”)
8. **Practiced rules where policy would mislead.** Who actually wins; what a newcomer gets wrong;
   the last time the written rule was overridden. (`elicitation.md` “Policies, exceptions, and
   practiced rules”; oracle ledger example `washdown-shared-crew`.)
9. **A check against the world.** What they would look at to say the result was accurate enough.
   Do not store their predicted answer as structure. (`elicitation.md` “Validation criteria”.)

That is the floor. Everything else is **deepening under strain**: a thread is opened because the
stated question depends on it, or because a walked case exposed a distinction the first account
omitted.

**Inferred from construction coverage, not as interview policy.** Petrinaut can later represent
durations, shared pools, inspect-without-taking, blocking, work arriving from outside, work
leaving, competing next steps, groups that move together, quantities that change while nothing
discrete happens, and comparisons under different conditions (`libs/@hashintel/petrinaut/docs/useful-patterns.md`;
`petrinaut-core/src/ai.ts` `petrinautDocSummaries`). Those capabilities tell the interviewer *what
kind of omission will make construction invent*. They do not license asking the expert for net
parts, code surfaces, or payload fields.

**Proposed cut of the floor versus deepening.**

| If the modelling question is mainly… | Deepen | Leave named as gap unless they volunteer |
| --- | --- | --- |
| Sequence, setup cost, who waits | Mode change, contention, practiced priority, calendar availability | Continuous wear, rare breakdown rates, environmental noise |
| “How often does it run dry / break / miss the window” | Thresholds they actually look at, typical and tail, what is occupied while waiting | Exhaustive actor attributes, structural proofs |
| “What if we change the rule” | What they may vary; practiced versus written; what observation decides the comparison | Autonomous optimisation logic, invented commercial weights |
| A one-off logical “can this deadlock” | Order, conservation, what can never happen | Stochastic dynamics, rare-event acceleration |

**Rabbit holes unless the objective requires them.** Formal 12-component specifications;
structural reachability/boundedness/liveness proofs once quantities are continuous
(`docs/reference/2026-08 SDCPNs for cyber-physical systems.md`, “Structural guarantees”);
stochastic differential noise; rare-event acceleration; lot-splitting and multi-depot fidelity
the published models themselves treat as simplifications; asking the expert to name a
distribution family; a continuous quantity nobody looks at and that starts or stops nothing;
min / most-likely / max; building the net in conversation; reading IR headings aloud.

**Advanced capability, disclosed later.** Comparisons under named conditions; tunability of a few
levers they already vary; typical-versus-tail as a named assumption rather than a fitted curve;
identity only when the IR already says the distinction changes routing. Monte Carlo batches,
search over parameters, visualisers, and engine step-size are construction and product concerns,
not interview content.

---

## Obligation matrix

Candidate homes: skill lifecycle; elicitation resource; IR obligation; construction guidance;
checks; advanced disclosed reference; cut.

Elicit / infer / construct means: **elicit** from the expert in their words; **infer** only if
marked assumed, with why and how to check; **construct** only after the IR exists, never as
interview content.

| Operational obligation | Why it matters | Source evidence | Elicit / infer / construct | Candidate home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Stated modelling question, audience, and what the result must not claim | Without a question, depth is uncalibrated and a full-looking IR can still have no process slice | `elicitation.md` Purpose, Posture; `ir-template.md` Purpose and outcome; `SKILL.md` Orient; oracle claim 5; `checks.md` “at least one objective” | Elicit | Skill lifecycle (Orient) + IR obligation | An interview that fills every heading but cannot say what decision the model is for still scores as complete | **Observed** |
| Appetite, time, accuracy, and tolerance for proposed assumptions | Sets how hard to press and when an assumption is licensed | `elicitation.md` Posture; `CONTEXT.md` Posture; Petrinaut `ai.ts` “make it up” hatch is explicitly *excluded* from Brunch elicitation (`MISSION.next.md` Ownership) | Elicit (stance); never treat terse assent as a license to invent | Skill lifecycle + elicitation resource | Tight time plus high accuracy with no named gaps still delivers “complete” | **Observed** |
| Slice boundary and horizon, with why the cut serves the question | Construction will otherwise import plant-wide trivia or omit the thing the question lives in | `elicitation.md` boundary before structure; inbox Triggers; gas-supply model scoped to tanks+tanker not the whole company (SDCPN blog) | Elicit | Elicitation resource + IR obligation | Expert names raw-material stalls as “flag when it happens”; interviewer still builds a materials net | **Observed** |
| One real case walked from arrival to leaving before property sweeps | First accounts omit waiting, exceptions, and who actually moved | `elicitation.md` Questioning; both headless runs; Run 1 got mill-to-fill backup *because* it walked stages; Run 2 abstracted the same stages and lost that wait | Elicit | Elicitation resource | Agent asks “what are your resources?” before any occasion, then files a tidy resource list with no occupancy | **Observed** |
| How each goal is actually judged, and any threshold they can judge | A qualitative “don’t get shouted at” cannot run; a number they do not use must not be invented | Inbox Goals/constraints; `elicitation.md` Goals…thresholds; situation pack: no penalty table; Run 2 conserved that ranking; Run 1 left “no numerical thresholds” | Elicit measures they use; infer a proxy only if marked, or record as **Loss** | Elicitation + IR (goals; projection losses) | Interviewer stores “95% on-time” though they never said a percentage | **Observed** |
| What they may vary, and what observation would make the result accurate enough | Distinguishes a decision-support slice from a predicted schedule; validation is not a forecast stored as structure | `elicitation.md` Posture + Validation criteria; Run 2 Validation (hold-vs-switch, line-down reshuffle); Run 1 Validation **Not yet asked** | Elicit | Elicitation + IR; targeted follow-up if missing before delivery | Expert wants “is idle-hold worth it?”; IR contains only a happy-path sequence and no comparison | **Observed** |
| What starts a case (clock, receipt, level crossing, breakdown) and what else must be true | Wrong trigger yields the wrong spine (weekly book vs telemetry vs wear) | Inbox Triggers; `elicitation.md` Process boundary; gas reorder-on-level vs consumption-counter deadlock (SDCPN blog); threshold-trigger typology | Elicit | Elicitation + IR | Consumption-counter policy modelled as “they order when it feels low” | **Observed** |
| Who decides, which locations matter, which resources are capped, and which properties change routing | A machine or crew named in passing is often the contended thing whose rule they have least examined | `elicitation.md` Participants… + contended typology; inbox Actors/Locations/Resources; situation pack one shared day-shift crew; Run 1 left crew “Not yet asked”; Run 2 conserved sharing and waiting | Elicit | Elicitation (notice) + IR; targeted follow-up when a named resource has no occupancy/contention | “Changeover crew came over” filed as colour and never asked whether two lines can want them at once | **Observed** |
| For each load-bearing step: inputs/outputs and whether each is used up, occupied then freed, or only looked at | This is the occupancy semantics construction needs; it is not a net shape | Inbox Steps 1–2 (consume / reserved / read); `pn-construction.md` shared resources reserved not consumed unless IR says used up | Elicit in operational language; construct the hold/release | Elicitation (activities) + construction guidance | Line is treated as consumed; second order can never start | **Observed** |
| Whether a step takes time, what is occupied while it runs, typical duration, and a tail *if the tail would change the decision* | Time is how contention and lateness become quantitative; a forced distribution is a fabrication | Inbox Steps 3; timed-work typology; `elicitation.md` “do not force a distribution”; “typical then one-in-ten worse” | Elicit typical/tail; infer a named parameter if they cannot observe a shape | Elicitation + IR (time) + construction; **not** a distribution-family question | Expert says “about four to six hours”; IR records LogNormal(μ,σ) as theirs | **Observed** |
| A duration that crosses a shift or calendar boundary is availability, not only work content | Evening washdowns wait for the day crew; driver hours force rest (fleet example) | `elicitation.md` lens “calendar boundary”; situation pack day-shift-only crew and Line 3; Run 2 conserved 6 AM–2 PM; truck-fleet EU hours (SDCPN blog) | Elicit | Elicitation lens, fired from timed work + contention | Washdown duration stored as three hours with no mention that it cannot start at 2 PM | **Observed** |
| What decides the next step: a person, a practiced rule, or a chance — and what each path produces | Collapsing a decision into a coin-flip, or a chance into a policy, mis-builds the branch | Inbox failure/unhappy paths; branching typology; oracle “policy vs practice” | Elicit the deciding mechanism; do not infer 50/50 (`pn-construction.md`) | Elicitation + IR (flow) | “If Line 2 is down we squeeze onto Line 1” stored as p=0.1 failure | **Observed** |
| Failure, retry, and recovery: what happens to the work, the case, and the scarce things | Recovery is often a different occupancy (tow + long repair vs planned service) | Inbox Failure modes; fleet roadside vs planned bay (SDCPN blog); situation pack Line 2 jam vs Line 1 mill motor; both IRs left breakdown as scenario-not-rate — appropriate to the scheduling question | Elicit occasion and whether rare or ordinary; **omit as rate** if objective is response not frequency | Elicitation + IR; construction only if IR supports it | Weekly filler jam stored as the same rate as a four-day mill-motor death | **Observed** |
| A memorable incident is not a rate; ask opportunities and period | Silent hardening of one story into λ | `elicitation.md` Questioning; branching caveat; situation pack “every week or two” vs “took four days once”; oracle hard-failure “silent hardening” | Elicit | Elicitation resource | “QA rejection ~1/quarter” filed as a per-batch probability with no period check | **Observed** |
| Who wins a shared resource, what overrides, a recent borderline case; do not infer the rule from a published schedule | Contention is where cyber and physical meet; the practiced rule is often unwritten | Contended-resource typology; oracle ledger `washdown-shared-crew` trap; situation pack _(believes)_ “overlap fine” vs Tuesday Line 3 idle; Run 2 conserved wait, left priority **Not yet asked** | Elicit practiced rule; if unknown, mark unknown — construction must not invent FCFS silently | Elicitation + IR (resources + policies); targeted follow-up; construction names the loss | Interviewer infers “Meridian always wins the crew” from the Line 2 audit rule | **Observed** |
| Written/normative language versus last actual occasion | Policy is not practice; unwritten vetoes are load-bearing | `elicitation.md` “we would / the rule is”; situation pack VW-02 after dark tint _(tacit)_; Run 2 acquired it after a family-boundary probe; Run 1 never reached it | Elicit | Elicitation resource | “Family switch is purely the family boundary” left standing after they volunteered VW-02 | **Observed** |
| Something proceeds because a level, count, or clock they actually look at crossed a line | Thresholds couple continuous state to discrete action; the wrong observable yields the consumption-counter deadlock | Threshold-trigger typology; gas telemetry reorder vs consumption trigger (SDCPN blog); inbox Triggers 1.3; situation pack PM on units-run | Elicit the observable and who/what flips it | Elicitation + IR (triggers/thresholds) | “They refill when the tank is low” with no number they look at, later constructed as an invented setpoint | **Observed** |
| A quantity that changes while nothing discrete happens *only if* the question depends on the trajectory or on a crossing | Filling, wearing, draining are real; unused continuous state is a rabbit hole | `elicitation.md` lens “warming, wearing, filling”; SDCPN blog DCPN/SDCPN levels; threshold caveat “a continuous quantity that triggers nothing usually does not belong”; gas level *does* trigger | Elicit rate or threshold if the question needs it; otherwise **Omitted** | Elicitation lens, not a default typology; construction only if IR has a crossing or a judged level | Ambient temperature elicited and modelled though nobody uses it and it drives nothing in-scope | **Observed** (caveat) / **Proposed** (keep as lens, not a seventh default typology) |
| Setup, changeover, restart, warm-up, handover: what is lost, and whether loss depends on direction | Sequence cost is often asymmetric; “not applicable” without asking hides it | Mode-change typology; situation pack white→tint 45 min vs tint→white 3 h; Run 2 conserved asymmetry; Run 1 had a 3 h vs “six hours total” conflict; fleet service vs recovery | Elicit last changeover and what cannot run next; ask the reverse direction | Elicitation + IR; targeted follow-up if one direction is timed and the reverse is not | Tint→white timed; white→tint assumed identical | **Observed** |
| Work that moves as a batch, run, lot, or load: what the group is, whether it must stay together, what a split costs | Run size is a decision (coatings); furnace waits for a count or a clock (fab); tanker load size couples to ullage (gas) | Grouped-movement typology (thin in `elicitation.md`); situation pack run sizing + minimum run; fab batch-of-4-or-3-hours (SDCPN blog); `pn-construction.md` grouped movement | Elicit; do not assume the group is atomic | Elicitation (needs the split question filled to match other typologies) + IR | Orders always constructed as unsplittable though they decide run size every week | **Observed** |
| Waiting that is not “the step takes that long”: blocked on a downstream hold, a queue, or someone else’s occupancy | Surface duration hides coupling; first accounts omit it | `elicitation.md` lens “we have to wait”; inbox “queues implied by waiting”; situation pack mill→fill tank _(tacit)_; Run 1 recorded ~20 min backup; Run 2’s order-level timed-work abstraction omitted it; fab WIP cap | Elicit by walking occupancy (“what were you waiting on?”); do not treat as extra duration | **Proposed** elicitation lens or typology “hidden waiting”; IR flow/time; construction only if IR names the hold | Agent records fill time as 11 hours and never asks why the mill stopped | **Inferred** (failure mode in runs) / **Proposed** (named obligation) |
| Incoming work the process does not control (book lands, loads posted, lots arrive) | Source of cases; rate vs weekly batch changes the spine | Inbox trigger-by-receipt; gas demand; fab stochastic arrivals | Elicit how work appears; construct arrivals only from IR | Elicitation (triggers) + construction | Weekly demand book modelled as a Poisson trickle because “arrivals are stochastic” | **Observed** |
| Work leaving, scrap, or absorption, if the question cares about loss or throughput | Ramp scrap after washdown; vented gas; lost loads | Inbox outputs on failure; situation pack ramp scrap _(doesn't know)_ quantity; Run 2 marked Unknown and omitted from first net (objective-permitted); gas relief venting | Elicit existence; quantity may be Unknown; do not invent | Elicitation + IR omissions | Ramp scrap invented as 5% per washdown because “there is always waste” | **Observed** |
| Conflicts kept dual; later corrections supersede rather than average | Averaging is silent hardening | `ir-template.md` Conflict / Maintenance; `pn-construction.md` not allowed to average; oracle hard-failure “silent collapse of a conflict”; Run 1 flagged 3 h vs 6 h | Elicit clarification; IR keeps both until settled | IR obligation + checks | Two washdown quotes averaged to 4.5 h | **Observed** |
| Every load-bearing value traceable to their words or marked assumed, with why and how to check | Assent to agent language is not evidence | `elicitation.md` Evidence; `ir-template.md` marks; oracle claims 3–4 and hard-failures; `CONTEXT.md` epistemic status | Elicit or mark; never construct from general plant knowledge (`pn-construction.md` Not allowed) | Elicitation + IR + checks | “Line 3 speed between 1 and 2” appears as theirs | **Observed** |
| Named gaps: Unknown / Not yet asked / Omitted / Loss — not empty headings | Construction must see the hole; deferral without a deposit is a failure mode | `ir-template.md`; `elicitation.md` deferral; `checks.md`; `SKILL.md` return path (unexercised as a loop: proof fog 5) | Elicit or explicitly omit | IR obligation + checks; return-to-elicitation is skill lifecycle | IR section blank; constructor fills from logistics folklore | **Observed** |
| Material the net cannot honestly hold, named at delivery | Qualitative politics, unnamed conditions, disconnected data | `pn-construction.md` Projection loss; `checks.md` Loss review; Run 2 named commercial weights and VW-02 definition loss | Record as Loss; do not interview them into fake precision | IR + construction delivery + checks | Unwritten Meridian ranking converted to dollar weights “so the metric can run” | **Observed** |
| Identity / typed distinction only when it changes what happens | Colour is construction; “properties that change the process” is elicitation | `pn-construction.md` mapping principles; SCPN product-on-tanker (SDCPN blog); `elicitation.md` properties that change what the process does | Elicit the distinction; construct identity later | Elicitation (properties) + construction | Every SKU becomes a token field though routing is by family | **Observed** |
| Comparisons (“what if we hold idle / line down”) as expert-facing intent, not as product scenario objects | They want to test decisions; the named configuration is construction | Run 2 purpose (hold vs switch, line-down reshuffle); `ir-template.md` What the model must answer; Petrinaut scenarios/experiments as *coverage*, not interview schema | Elicit the comparison; construct named conditions later | Elicitation (purpose/validation) + advanced disclosed reference for how a built model is compared | Interviewer asks them to fill in scenario parameter identifiers | **Proposed** (home split) |
| Stochastic noise on continuous trajectories (weather, drifting demand) | Answers environmental variability; far beyond first-slice scheduling | SDCPN blog SDCPN level; fleet road severity | Do not elicit unless the question is about that variability | Advanced disclosed reference; otherwise **cut** from default interview | Coatings sequencing interview asks for ambient-temperature mean-reversion | **Observed** (advanced) |
| Structural proofs (can this state be reached, can it deadlock) | Useful for untimed logic; do not apply once state is continuous | SDCPN blog “Structural guarantees”; plain PN gas deadlock | Only if the question is logical possibility and state stays discrete | Advanced disclosed reference / **cut** from default | Expert asked to enumerate every reachable marking | **Observed** (rabbit hole for typical ops questions) |
| Rare-event probabilities and acceleration methods | Safety-case class of question, not weekly scheduling | SDCPN blog “Probabilistic claims” | Cut unless the stated question is a rare catastrophe | Cut / advanced | Mid-air-collision methodology applied to washdown hours | **Observed** |
| Petrinaut payload fields, code surfaces, arc weights, inhibitor/read as interview content | Costs their vocabulary and buys nothing in elicitation | `SKILL.md` “Do not interview through places, transitions…”; proof claim 4; `MISSION.next.md` contracts are Petrinaut’s; FE-1516 hand-copy counterexample | Construct only, via mounted tools / generated schemas | Construction guidance; **cut** from elicitation | Expert asked which token type dimensions to add | **Observed** |
| IR headings read aloud as a questionnaire | Coverage looks orderly; tacit distinctions stay hidden | `ir-template.md` “Do not read these headings aloud”; `elicitation.md` schema-shaped rabbit hole; oracle hard-failure; both real runs still opened with 4–10 numbered questions (proof fog 1, `MISSION.next.md`) | Never elicit this way | Elicitation caveats + skill lifecycle (Orient must not become a battery) | Opening turn lists Purpose, Boundary, Metrics, Scope as four numbered questions before any case | **Observed** |
| Consume/reserve/read taught as PN implementation notes during interview | Inbox mixed operational question with “PN implementation” | Inbox Steps 2a–c “PN implementation: token is consumed…”; current `elicitation.md` already uses operational consume/reserved/read without token talk — keep that split | Elicit operational use; construct hold/release | Inbox is history; elicitation keep operational wording; construction keep mapping | Interviewer explains read arcs to the scheduler | **Observed** / **Proposed** (keep split) |

---

## Situation-typology assessment

Current teaching (`elicitation.md` “Situation typologies”; echoed in `pn-construction.md`
“Reusable construction patterns”; defined in `docs/specs/structurally-typed-elicitation-runbooks.md`
lexicon) names six shapes. They are question shapes, not node types.

### Timed work

**Evidence.** Inbox “Does the step take time”; elicitation typology; construction start /
in-progress / done; Petrinaut duration patterns (operational meaning: some work occupies time);
gas journeys, coatings run times, fleet driving.

**Helps notice.** Occupancy during work; typical versus tail; that time is often what the
objective cares about.

**Overfit risk.** Forcing a distribution family; treating blocked waiting as “the step takes 11
hours”; collapsing four stages into one timed run because the typology fires at the wrong grain
(Run 2 vs Run 1).

**Recommendation.** **Remain.** Keep “do not force a distribution” as a hard caveat. Pair with the
hidden-waiting lens so duration is not a dumping ground for queues.

### Probabilistic or branching outcome

**Evidence.** Inbox success/failure and unhappy paths; elicitation typology; competing next-step
pattern in Petrinaut docs; QA pass/fail; Line-down reshuffle as a *decision* branch.

**Helps notice.** Success is not guaranteed; two different next steps can follow; both paths must
be named or marked unknown.

**Overfit risk.** Treating a practiced decision (“put the tint on Line 3”) as a random split;
treating one vivid incident as a probability; inventing 50/50 (`pn-construction.md` already
forbids this).

**Recommendation.** **Remain**, do not split into “policy branch” vs “chance branch” as two
typologies — the useful question is already “what decides.” **Rewrite** the notice-when line so a
person or rule is a first-class decider, not an afterthought to sampling. Construction remains
“alternative outgoing paths,” not a dice roll unless the IR said chance.

### Contended resource

**Evidence.** Inbox capped resources; elicitation typology; oracle `washdown-shared-crew`;
situation pack shared crew; gas one tanker, two sites; fleet two bays / two techs; fab shared
chambers; proof fog 7: this typology actually steered Run 2.

**Helps notice.** A crew, bay, or machine named in passing; how many instances; who wins; what
overrides.

**Overfit risk.** Inferring the rule from a schedule or from another policy (Meridian-on-Line-2 ⇒
Meridian-wins-the-crew); asking contention on every named object including unconstrained ones.

**Recommendation.** **Remain.** It is the highest-value SDCPN-specific notice for cyber-physical
coupling. Keep the trap: do not infer the practiced rule.

### Threshold trigger

**Evidence.** Inbox trigger-by-threshold; elicitation typology; gas reorder and relief setpoint;
fleet wear threshold; fab condition 0.85; situation pack PM on units-run.

**Helps notice.** They look at a level, count, or clock; something starts or stops when it
crosses.

**Overfit risk.** Inventing a setpoint they do not use; modelling a continuous quantity that
triggers nothing (already caveated); missing that the *wrong* observable (consumption counter
ignoring boil-off) is itself a failure mode (SDCPN blog).

**Recommendation.** **Remain.** Keep the “observable in their world” check. Do not merge with
continuous-change: crossing is the discrete event; drifting is optional deepening.

### Mode change

**Evidence.** Elicitation typology (not in the inbox as a named pattern); coatings family
washdowns; directional loss; VW-02 “cannot run next”; fleet rest/handover; construction “timed or
costly transition between modes.” Proof fog 7: changeover typology steered Run 2.

**Helps notice.** Setup, changeover, restart, warm-up; loss that depends on direction; what you
cannot run next.

**Overfit risk.** Overlap with timed work (a washdown *is* timed work); recording “not applicable”
without asking; treating every product change as a full mode change when a rinse is not.

**Recommendation.** **Remain**, because directional loss and “what cannot follow” are not ordinary
duration. **Rewrite** to say: fire timed-work *and* mode-change together when setup occupies time;
the extra questions are direction and forbidden next.

### Grouped movement

**Evidence.** Thin in elicitation (no “questions that may help,” weaker checks); construction
formation/split; situation pack run sizing and minimum runs; fab lots/furnace batch; gas load
size vs ullage; Run 1 noted run-sizing as **Not yet asked**.

**Helps notice.** Batches, runs, lots, loads — the work unit may not be one item.

**Overfit risk.** Assuming the group is atomic; missing that split cost is a decision (coatings)
not a physical law; over-applying fab lot-splitting (blog itself treats that as a simplification).

**Recommendation.** **Remain and complete** to the same depth as the others: last time they split
or refused to split; what the group is; what a split costs. Do not merge into timed work.

### Missing typology: hidden waiting (proposed)

**Justification.** Sources plus a concrete failure mode. Elicitation already has the lens “we have
to wait.” Inbox lists queues implied by waiting. Situation pack holds the mill→fill tank as tacit
and as Marta’s buffer argument. Run 1 acquired it by walking stages; Run 2’s timed-work
abstraction at order grain omitted it. Fab WIP caps and gas “tanker still returning” are the same
shape: work is occupied but not progressing because something downstream or elsewhere is not
moving.

**Distinct from contended resource.** Contention asks “who gets the scarce named thing.” Hidden
waiting asks “you said it took eleven hours — what were you actually waiting on?” Merging them
produces the wrong follow-up (priority rule vs hold-up).

**Overfit risk.** Inventing buffers everywhere. Fire only when a duration story or “we had to
wait” appears, or when two stages share a small hold.

**Recommendation.** **Add as a lens first** (same family as “calendar boundary”), not as a seventh
default node-shape. Promote to a typology only if later runs still swallow blocking into duration
after the lens exists. Status: **Proposed**.

### Not added

- **Continuous evolving quantity** — already a lens; threshold trigger covers crossings; the
  blog’s dynamics level is progressive disclosure. Adding it as a default typology would fight
  the “triggers nothing” caveat.
- **Identity / colour** — construction when the IR already says the distinction changes routing.
- **Consume / reserve / read** — per-activity obligation, not a situation type.
- **Calendar / availability** — already a lens; fires from timed work + contention.
- **Exogenous arrivals / sink** — covered by triggers and outputs.
- **Policy vs practice** — a universal evidence obligation, not an SDCPN situation type.

---

## Interview/construction boundary

**Observed ownership.** Prompting and teaching are Brunch’s. TypeScript API contracts and payload
shapes are Petrinaut’s, consumed by import or generation, never hand-copied (`MISSION.next.md`
“Ownership and teaching mechanism”; FE-1516 as the standing counterexample). `petrinaut-core/src/ai.ts`
is the latest *coverage* reference for what a constructed net can hold. It is not interview policy
for Brunch. In particular, its “interview first” block talks in places/transitions, and its “make
it up / use sensible defaults” hatch is excluded from Brunch elicitation discipline.

**What SDCPN knowledge may do in the interview.** It may train the interviewer’s *attention*: which
phrases hide a branch, a wait, a crossing, a directional loss, a shared crew, a group that might
split, a calendar gate. It may license a targeted follow-up in the expert’s words. It may tell the
interviewer that a continuous quantity with no crossing and no judged level usually does not
belong. It may tell construction, later, which reusable occupancy shape fits an IR note.

**What it must not do.** It must not expose places, transitions, arcs, colours, tokens, firing
rules, guards, kernels, lambdas, dynamics equations, parameters-as-objects, arc weights, inhibitor
or read arcs, or distribution constructors. It must not ask the expert to choose among those.
`SKILL.md` already forbids interviewing through that vocabulary; both headless runs stayed in
washdowns, lines, and Meridian (proof claim 4). `Transform to PN` lines still sit inside
`elicitation.md` as typology children; the proof says they did not cause PN-shaped interviewing on
those runs (fog 2). That is evidence they were *survived*, not that they belong.

**Operational wording that already carries the semantics without the syntax.**

| Construction will later need to know | Ask / notice in their world |
| --- | --- |
| Something waits, holds, or is available | Where does it sit; what is free; what is blocked |
| Something happens | What do you actually do next |
| Order, branching, triggers | What has to be true; what if it isn’t; what do you look at |
| A type of thing treated differently | What would make you send it somewhere else |
| Continuous change | Filling, wearing, warming — at what rate, or at what line do you act |
| Shared resource | Used up, tied up until you finish, or only checked |
| Time with a non-memoryless shape | Typical, and one time in ten worse — not “which distribution” |
| Exclusive next steps | What decides, and what each path produces |
| Inspect without taking | Do you need it to still be there for someone else |
| Work from outside / work gone | How does a case show up; where does it leave |

**Progressive disclosure.** Construction resources stay out of ordinary questions (`SKILL.md`
Resource routing; oracle inner loop “No PN vocabulary in expert-facing questions”). Return from
construction may ask the *smallest operational question* the IR cannot fill (`SKILL.md` Return;
unexercised as a loop, proof fog 5). That return is still an interview turn, not a lecture on the
net.

**Petrinaut’s modeller-facing interview is a different job.** It assumes someone building in the
editor, groups 2–4 questions, and offers an escape hatch to invent values (`ai.ts`
`petrinautAiPrompt`). Brunch’s expert is not that person. Teaching from coverage (metrics,
comparisons, rates vs thresholds vs continuous change) is allowed. Copying that interview policy,
hatch, or field names into elicitation is not.

---

## Adversarial probe catalog

Each case is meant to distinguish **real investigation** (occasion, occupancy, practiced rule,
named hole) from **surface coverage** (heading filled, typology name assigned, number invented).
Several are already latent in the Vestera situation pack and the two headless IRs; they should be
reused as grader-only ledger entries, not as interviewer prompts.

### Policy versus practice

**Setup.** A written or confident generalisation (“family switch is purely the family boundary”;
“changeovers mostly overlap fine”) sits next to a tacit exception (VW-02 after dark tint; Tuesday
Line 3 idle).

**Surface coverage.** Files the generalisation. Never asks when that last actually happened, or
what a newcomer gets wrong.

**Real investigation.** Asks for the last occasion; hears the exception; files it under practiced
rules; keeps “not on any document.”

**Falsifier.** IR contains only the family-boundary washdown table after the expert volunteered
VW-02 (`elicitation.md` policy-vs-practice; situation pack tacit VW-02; Run 2 acquired it, Run 1
did not).

### Shared-resource contention

**Setup.** A crew, bay, or tanker is named once (“changeover crew came over”).

**Surface coverage.** Records the name. Infers “enough crew” from the published shift pattern.
Does not ask what happens when two lines want them at once.

**Real investigation.** Asks the simultaneous-demand question; distinguishes believed “mostly
fine” from the borderline Tuesday; leaves priority **Unknown** rather than inventing FCFS.

**Falsifier.** Oracle trap on `washdown-shared-crew`: do not infer the rule from the schedule
(oracle design case ledger; Run 1 miss; Run 2 partial — wait conserved, priority not asked).

### Hidden waiting

**Setup.** A long duration that is partly blockage (mill stopped because the small tank was full;
tanker still returning; WIP cap).

**Surface coverage.** Stores “fill took ten or eleven hours” as timed work. Abstracts stages away
because the objective was sequencing.

**Real investigation.** “When it took that long, what were you waiting on?” Files the hold as
occupancy, not extra processing.

**Falsifier.** Run 1 vs Run 2 IRs on the mill→fill tank; situation pack _(tacit)_ buffer argument.

### Directional changeover loss

**Setup.** White→tint 45 minutes, tint→white three hours; or “six hours total for two washdowns.”

**Surface coverage.** One “changeover time” field. Averages the two quotes. Does not ask the
reverse direction or “what can you not run next.”

**Real investigation.** Times both directions; asks whether SKU-within-family matters; catches
VW-02 as a forbidden next, not a duration.

**Falsifier.** Mode-change caveats; Run 1 conflict note vs Run 2 directional table.

### Rare incident mistaken for a rate

**Setup.** Line 1 mill motor took four days once; QA rejects about once a quarter; Line 2 filler
jams every week or two.

**Surface coverage.** One “failure rate” for “breakdowns.” A single story becomes λ.

**Real investigation.** Asks how many opportunities and over what period; keeps the four-day
outage as a scenario the scheduler wants to *respond* to, not as the base stochastic process,
when the objective is reshuffle.

**Falsifier.** `elicitation.md` “memorable incident is not a rate”; both IRs’ choice to leave
breakdowns as scenarios — that choice is correct *for this objective* and would be a miss if the
question were “how often do we lose Line 2.”

### Unknown distribution

**Setup.** “Four to six hours”; “about half a shift”; quality tracks scrap only as a monthly
percentage.

**Surface coverage.** Writes a textbook distribution, min/mode/max, or a precise scrap count as
theirs.

**Real investigation.** Typical, then one-in-ten worse if the tail matters; **Unknown** for scrap
quantity; named **Assumed** parameter if construction must proceed.

**Falsifier.** `elicitation.md` do not ask min/most-likely/max; `pn-construction.md` not allowed to
turn unknown into a textbook distribution; situation pack _(doesn't know)_ ramp scrap.

### Grouped work that may split

**Setup.** They decide run sizes; bigger runs amortise washdowns; minimum run “not worth starting
the mill”; fab lots that might split (blog: model forbade split).

**Surface coverage.** Every order is one atomic token. Never asks whether they split, combine, or
refuse a small run.

**Real investigation.** Last time they combined or split; what it cost; whether the group must
stay together.

**Falsifier.** Situation pack run sizing left **Not yet asked** in Run 1; grouped-movement
typology currently too thin to force the split question.

### A continuous quantity that triggers nothing

**Setup.** Tank level, wear, particle count, or ambient temperature appears in passing. Nobody
acts on it in-scope, or the objective is sequence not trajectory.

**Surface coverage.** Adds a drifting quantity because “SDCPNs have dynamics.”

**Real investigation.** “What do you actually look at?” If nothing starts or stops and the
question does not care about the trajectory, omit it and say why.

**Falsifier.** Threshold-trigger caveat; gas level *does* belong because reorder and stockout
depend on it — the probe is the unused quantity, not all continuous state.

### Extra probes the sources already name

- **Opening overload.** First interviewer turn is a numbered battery of four to ten questions
  before any case (both real runs; proof fog 1). Surface: “orientation.” Real: one or two
  questions that lock the modelling question, then a case.
- **Schema-shaped coverage.** Walking IR headings in order. Surface: complete template. Real:
  follow their thread; file afterwards (`ir-template.md`; oracle hard-failure).
- **Belief versus fact.** “Line 2 is twice Line 1” is true for whites and false for tints
  (situation pack). Surface: one speed ratio. Real: “does that hold for tints?”
- **Which stage is slow depends on the product.** Specialty crawls at mill; whites at fill
  (situation pack tacit). Surface: one rate per line. Real: a contrast question after the first
  timed-work answer.
- **Co-located work they never mention.** Informal habit of putting PM with a washdown already
  being paid (situation pack tacit). Surface: PM as a separate calendar. Real: “what would
  surprise a new scheduler.”
- **Invented weights.** Asking them to quantify Meridian vs small-account pain. Surface: an
  objective function. Real: they would have to invent it with commercial; record as **Loss**
  (`elicitation.md` “asking them to invent weights they do not use”).

---

## Current-material assessment

Authorities: the four skill resources as shipped; proof of how they behaved on two real runs plus
a construction side quest; standing ownership split. Keep / move / rewrite / cut below is
**Proposed** except where the proof already **Observed** a behaviour.

### `elicitation.md`

| Disposition | What | Why |
| --- | --- | --- |
| **Keep** | Purpose (non-modeller, no net during interview); universal questioning, evidence, stopping; operational “What to investigate” clusters; lenses; caveats; failure modes | These are the lines that steered Run 2 (slice-then-story, assumption marks, changeover/crew) without leaking PN vocabulary to Marta |
| **Keep** | Consume / reserved / read in *operational* language under activities | Matches the inbox investigation need without the inbox’s “PN implementation” notes |
| **Move** | Each typology’s “Transform to PN: …” line | Construction knowledge. Survived these runs (proof fog 2) but belongs in `pn-construction.md`. Leaving it in elicitation is a boundary leak waiting for a worse model |
| **Rewrite** | Branching typology “notice when” so a person or practiced rule is a decider, not only a probability | Prevents policy-as-coin-flip |
| **Rewrite** | Grouped movement to the same depth as the others (questions, split cost, checks) | Currently thinner; run-sizing was a load-bearing miss |
| **Rewrite** | Timed work: explicit warning that a long duration may be hidden waiting, not processing | Addresses Run 2’s stage abstraction |
| **Keep as lens, do not promote by default** | Warming/wearing/filling; calendar boundary; “we have to wait” | Sufficient if hidden waiting is named as a lens; a seventh typology is not yet earned |
| **Cut** | Nothing wholesale; do not add Petrinaut interview policy or “make it up” | `MISSION.next.md` exclusion |
| **Do not add** | Domain examples (Vestera, fleet, fab) | Proof claim 3: no scenario facts in resources |

### `ir-template.md`

| Disposition | What | Why |
| --- | --- | --- |
| **Keep** | Workpiece role; “do not read headings aloud”; epistemic marks; operational heading families; situation-note shape (Notice / What we know / Open questions / Record for construction); maintenance (expert’s words, supersession) | Cold utility and conservation (oracle claims 2, 3, 7); both real IRs used the marks |
| **Keep** | Empty sections present with `Not yet asked` or `Omitted` | Construction can see the hole |
| **Rewrite (light)** | Situation-note “Record for construction” should stay IR-facing (“what occupancy later needs”), not a mini net sketch | Prevents the template from becoming a back door for PN syntax |
| **Cut** | Do not turn headings into an expert-facing questionnaire or a closed kind/slot table | Semantic typing is deferred (`structurally-typed-elicitation-runbooks.md`); completion-spec demand rows are a different, unimplemented IR |
| **Do not add** | Petrinaut field names as IR slots | Contracts are Petrinaut’s |

### `pn-construction.md`

| Disposition | What | Why |
| --- | --- | --- |
| **Keep** | Consume IR not transcript; mapping in operational-to-occupancy language; named inferences; allowed vs forbidden approximation; projection loss; typology-shaped worked examples with no plant | Matches construction job; examples already avoid domain facts |
| **Keep** | “When tools are mounted, generated schemas are the only authority for payload fields” | Aligns with ownership; the paid construction run failed on provider schema, not on this sentence (proof side quest) |
| **Rewrite** | Receive the “Transform to PN” lines moved from elicitation, still as occupancy shapes, not interview talk | One home for construction patterns |
| **Cut / do not expand** | Hand-copied payload field contracts, example JSON nets, code-surface cheatsheets from `ai.ts` | Standing counterexample FE-1516; proof: schema detail is a tool-runtime problem |
| **Keep (construction-only)** | Tool sequence at the level of “inspect, add types/parameters/places/transitions/connections, inspect again, correct rejections” without reproducing object shapes | Procedure for the construct phase; must never migrate into elicitation |

### `checks.md`

| Disposition | What | Why |
| --- | --- | --- |
| **Keep** | Elicitation sufficiency as objective-relative floor, not heading fullness; IR checks (source or Assumed; conflicts not averaged; spine without invention); loss review; stopping outcomes | Matches oracle hard-failures and `checks.md` “Not enough” list |
| **Rewrite (light)** | Sufficiency bullet on resources should require *occupancy and practiced contention if a shared thing was named*, not merely that resources can be “located” | Run 1 could “locate” a crew and still miss contention |
| **Rewrite (light)** | Sufficiency should mention validation-as-observation when the purpose is a comparison | Run 1 left validation unasked though the opening purpose was decision testing |
| **Keep in this file only** | Parser/tool validity, exclusive modes, reserved resources returned | Construction checks; not interview |
| **Do not add** | A heading-by-heading completeness catalogue | Would cause the schema-shaped failure the oracle gates on |

### Skill lifecycle (`SKILL.md`, adjacent)

Not in the four-file ask, but it is where Orient currently licenses an opening battery.
**Observed:** both real runs asked four numbered orientation questions before walking a case,
against `elicitation.md` “An opening battery is a failure.” **Proposed:** Orient remains
“establish the modelling question and boundary,” not a four-item form. That edit is recorded as
unowned in `MISSION.next.md`; this synthesis only notes the conflict.

---

## Completion notes

Every obligation above is **objective-relative**: the floor is a questioned slice with a walked
case, occupancy of scarce things, and named holes; deepening follows strain from that question.
Every row cites a source, has one lifecycle home, and names a probe that would show the
obligation was theatre.

The teaching recommendation is operational: occasions, what they look at, what is tied up, who
waits, what cannot follow, what they would trust as accurate enough. It does not hand-copy
Petrinaut API contracts, and it does not turn IR headings into a questionnaire for the expert.

**Observed** behaviour to conserve: interview in their vocabulary; construction resources out of
ordinary questions; epistemic marks; changeover and shared-crew notice when sequence is the
question.

**Observed** behaviour to correct: opening batteries; construction knowledge still nested under
elicitation typologies; grouped-movement teaching too thin; timed work at the wrong grain
swallowing hidden waiting; return-from-construction asking the smallest next question still
unproven.

**Proposed** and not yet earned as default interview content: a seventh typology for hidden
waiting (lens first); continuous noise, structural proofs, rare-event methods, and editor
scenario objects (advanced or cut).
