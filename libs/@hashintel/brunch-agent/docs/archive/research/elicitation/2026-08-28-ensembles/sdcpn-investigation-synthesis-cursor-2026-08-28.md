# SDCPN investigation synthesis

> Provenance: read-only research compilation produced 2026-08-28 by a background research agent
> in the Cursor session behind this digest; companion to
> `cross-mission-elicitation-digest-2026-08-28.md`. Filed as `-cursor-` to avoid collision with
> same-titled documents produced by other agents. Reproduced verbatim.

**Scope.** This is research compilation #2 of the four syntheses requested in `docs/specs/elicitation-to-ir-oracle-design.md`: the SDCPN investigation obligations that must be satisfied before construction, stated in operational vocabulary, without exposing places, transitions, arcs, colours, or Petrinaut payload fields to the expert. Provenance convention follows the spec's requirement (`source claim → universal or SDCPN-specific → lifecycle phase → home → falsifying probe`), collapsed into the obligation matrix below.

**Sources used.** `apps/brunch-agent/src/skills/sdcpn-modelling/{SKILL,elicitation,ir-template,pn-construction,checks}.md`; `docs/specs/elicitation-to-ir-oracle-design.md`; `docs/reference/2026-08 SDCPNs for cyber-physical systems.md`; `docs/reference/SDCPN Library - Ideas.md`; `docs/inbox/eliciting-and-constructing-processes-to-PNs.md`; `libs/@hashintel/petrinaut-core/src/ai.ts` (as construction-coverage reference only); `docs/evidence/proofs/implementations/fe-1525-headless-runbook-pn.md`.

**Petri-net/Petrinaut contract stance.** `ai.ts` is used only as evidence of *what construction must eventually cover* (process structure & timing; observables/metrics; scenario and parameter appetite; the extensions-gated feature families: colours, stochasticity, dynamics, parameters). Its interview policy (2–4 grouped questions, "make it up" escape hatch, place-naming-as-code-surface) is Petrinaut-owned and **contradicts** Brunch teaching (opening overload is a named failure mode; a value the expert did not give must never pass as theirs); it is deliberately not imported. No payload field names appear below.

---

## Minimum sufficient investigation model

The smallest objective-relative set of operational distinctions that supports later construction, anchored in `checks.md` ("elicitation sufficiency") and oracle claim 1 in the spec ("load-bearing, discoverable material… without exhaustive process trivia"):

1. **One objective on record** — what the model must answer, for whom, what it must not claim, and one measure with a threshold the expert can actually judge (elicitation.md "Goals, constraints, measures, and thresholds"). Without this, depth has no denominator; "structure before any objective is on record" is a named rabbit hole.
2. **One walked case** — a concrete instance from arrival to leaving (universal teaching; confirmed as a line that steered the real runs in fe-1525 fog 7).
3. **A spine** — what flows through the process, what happens to it, and in what order (checks.md: "construction could proceed without inventing a missing spine"). This includes the trigger that starts a case and the prerequisites beside it.
4. **Input fate for the main activities** — for each load-bearing step: is each input consumed, reserved-then-released, or only read (inbox doc, "Steps" 2; checks.md PN-validity: reserved resources must be returned). This is the single most construction-determining operational distinction that experts never volunteer unprompted.
5. **Time on the steps the objective touches** — does it take time, typical duration, and a tail only if the objective cares (elicitation: "Before a quantity, ask whether the typical case or the bad one matters").
6. **Contended resources + the practiced contention rule** — which people/machines/bays are capped, who wins when two jobs want one, and whether the rule is written or practiced (elicitation typology "Contended resource"; fe-1525 fog 7: the contended-crew and changeover lines actually steered the real runs).
7. **Failure and recovery on the paths the objective touches** — what decides the branch, roughly how often, what happens to the work in hand (elicitation typology "Probabilistic or branching outcome").
8. **Marked epistemic state** — Unknown / Not yet asked / Assumed / Conflict / Omitted / Loss (ir-template.md). This is not extra content; it is what makes the other seven honest.

Everything else scales with the objective: continuous quantities, condition-dependent rates, batches, external arrivals, calendar-boundary effects, and policy-vs-practice divergences enter only when the stated question depends on them ("Depth is objective-relative. Do not probe a thread that no stated question depends on."). A first construction is legitimate with any typology entirely unrepresented, provided its absence is `Not yet asked` or `Omitted` rather than silently filled.

---

## Obligation matrix

| Operational obligation | Why it matters | Source evidence | Elicit / infer / construct | Candidate home | Falsifying probe | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Objective, measures, thresholds** | | | | | | |
| What the model must answer, for whom, what it must not claim | Depth is objective-relative; "what it must not claim" prevents an overreaching delivery | elicitation.md Purpose; ir-template.md "Purpose and outcome"; oracle claim 7 (cold reconstruction) | Elicit | Elicitation resource + IR obligation | Construct a plausible net while the objective is still blank; if the conversation proceeds smoothly, the obligation is decorative — it should not be | Established |
| Measures with expert-judgeable thresholds (tolerated probability, quantities to keep above/below) | Converts qualitative goals into something the net can answer; threshold trigger typology presupposes it | elicitation.md Goals section; inbox doc "Goals/constraints" 6; SDCPN ref (reorder point, wear threshold) | Elicit | Elicitation resource + IR obligation | Ask the expert "what would be unacceptable?" — if no numeric-or-observable answer exists anywhere, and the agent invents one, hard failure (silent hardening) | Established |
| **Boundary, trigger, prerequisites** | | | | | | |
| What starts a case (schedule, receipt, threshold crossing, event) and what else must hold | The spine's entry point; prerequisites (approval, resource free) become enabling conditions, not free fires | elicitation.md Boundary/trigger; inbox doc "Triggers" 1–2 | Elicit | Elicitation resource + IR obligation | "What if the trigger condition never comes / the approval never arrives?" — an expert hesitation exposes an invented boundary | Established |
| What is explicitly outside the boundary, and why that serves the objective | Prevents scope creep and names omissions honestly | elicitation.md Posture; ir-template.md Posture/Omitted | Elicit | Elicitation resource + IR obligation | Present an in-passing topic ("while you're at it, the loading dock…") — the agent must be able to name why it is out without deferring it vaguely | Established |
| **Participants, locations, resources** | | | | | | |
| Who is involved and who *decides* at each step | Decisions are where policy vs practice and branching live; "what they decide" is in the current text but easy to miss | elicitation.md Participants; inbox doc "Actors" 2 | Elicit | Elicitation resource | Ask about a step with two named people; if the IR cannot say who decides, the question was never asked | Minor gap: current text has it but no typology reinforces it |
| Which locations matter and how they relate (not an exhaustive map) | Locations gate availability ("a duration that crosses a calendar boundary depends on availability") | elicitation.md Locations + Lenses (calendar boundary); inbox doc "Locations" | Elicit | Elicitation resource | Ask what happens to work that spans a shift/handover/weekend — silent availability modelling is a projection loss | Established (lens), untested |
| Which resources are capped, how many instances, and their distinguishing properties | Capped resources create the contention the objective usually cares about; properties (qualification, product compatibility) change what can run where | elicitation.md Resources; inbox doc "Resources" 2; SDCPN ref fab (machine qualification bitmask) | Elicit | Elicitation resource | "How many are there, and has work ever queued for one?" — if the agent never asks for instance counts, contention is guesswork | Established |
| The *practiced* contention rule (who wins, what overrides) | The expert has least examined it; inferring it from a published schedule is a named trap | elicitation.md Contended resource caveat; spec ledger example `washdown-shared-crew` trap | Elicit (mark Unknown if unanswerable) | Elicitation resource + IR (policies) | Check the runbook IR: any priority rule without "last borderline case" evidence is suspect | Established |
| **Activities, inputs, outputs, resource use** | | | | | | |
| Per load-bearing step: inputs and their fate — consumed, reserved-and-released, or read | Determines whether the net returns resources or destroys them; the checks gate "reserved where the IR says reserved" depends on it | inbox doc "Steps" 2a–2c (consumed/reserved/read); elicitation.md Activities; checks.md PN validity | Elicit | Elicitation resource + IR obligation + checks | Hand the agent a case where a van or fixture is used and released; if the IR cannot say "released as it arrived" vs "used up", construction will guess | Established, high priority |
| Whether the step can fail and what it outputs when it does | Branching and recovery flow from it; failure output may be a different kind of thing, not just a path | elicitation.md Activities; inbox doc "Steps" 4–5c | Elicit | Elicitation resource | "What does the failed thing look like — same part, or a different one?" If never asked, failure outputs get invented | Established |
| **Branching, retries, failure, recovery** | | | | | | |
| What decides the branch, roughly how often, and what each path produces | Both paths must exist or be marked unknown; one vivid incident is not a probability | elicitation.md Branching typology; universal "memorable incident is not a rate" | Elicit (rate only as expert's rough estimate; never as agent inference unmarked) | Elicitation resource | Feed one dramatic story and no base rate; a passing agent invents a probability or asks min/likely/max | Established |
| Unhappy paths: conditions that enter them, fate of work in hand, recovery shape | Retries vs scrap vs rework are operationally different and net-divergent | elicitation.md Flow/failures; inbox doc "Failure modes" | Elicit | Elicitation resource + IR | "When it failed last, what happened to the half-done work?" — absence of that question is detectable in the IR | Established |
| **Timing, rates, variability, tails** | | | | | | |
| Typical duration; tail only when the objective cares; no forced distribution | Forcing a distribution the expert cannot observe is a named caveat; unspecified tails may become named parameters, honestly | elicitation.md Timed work caveat; inbox doc "Steps" 3a–3b; checks.md (parameter for unknown rate is allowed-if-named) | Elicit typical; infer tail shape → must be marked Assumed | Elicitation resource (typical); construction guidance (parameterization) | Ask for a distribution's shape the expert never saw data on; the agent should push back, not fit | Established |
| Arrivals and demand the process does not control (rates, spikes, seasonality) | Every reference model has an exogenous arrival process (customer draw rate, posted loads, arriving lots); first accounts systematically omit it | SDCPN ref (draw rate 0.80/h, loads posted at stochastic rates, lots arriving stochastically); elicitation.md Lenses ("an input the system does not control") | Elicit (or from records — must be sourced, not assumed) | Elicitation resource (as a lens/typology); IR (Time/quantities) | "Walk me through how work arrives" — if the IR has activities but no arrival account and the objective is throughput, construction must return to elicitation | **Missing as a typology** — see typology assessment |
| Hidden waiting (queues implied between and inside steps) | "We send it out and it comes back Friday" conflates work with queue; waits are where contention bites | elicitation.md Lenses ("we have to wait"); universal "queues implied by waiting"; SDCPN ref (truck waits for delivery+return) | Elicit (ask what is occupied vs what is merely not-done) | Elicitation resource | Decompose one turnaround into working-vs-waiting; if the agent cannot say which parts the expert waits *on*, waits were never separated | Gap: present as a lens phrase only; no question shape |
| Calendar/availability dependence of durations | A 6-hour journey crossing a shift boundary is not a 6-hour duration | elicitation.md Lenses (calendar boundary) | Elicit | Elicitation resource | Give a step that finishes at 17:30 and ask what happens next | Established (lens), untested |
| **Continuous quantities and condition-dependence** | | | | | | |
| Which continuous quantities exist and whether anything depends on them (triggered, or scaling a rate/duration) | A continuous quantity that triggers nothing and scales nothing does not belong (named caveat); but quantities that *scale* rates (wear→failure, temperature→boil-off) are load-bearing and easy to flatten into constants | elicitation.md Threshold trigger caveat + Lenses (warming/wearing/filling); SDCPN ref (failure rate grows with condition; boil-off scales with ambient temperature) | Elicit what is watched and what reacts; construct the dynamics form | Elicitation resource (what depends on what); advanced disclosed reference (dynamics machinery) | "Does an older/loaded/dirty one behave differently?" — if the agent records a constant when the expert says "it depends on its state", condition-dependence was silently flattened | **Partially missing** — threshold trigger covers crossing, not scaling; see typology assessment |
| **Policies, exceptions, practiced rules** | | | | | | |
| Document vs practice, unwritten rules, exceptions that override "always/never" | Policy hardened into practice is a hard-failure class ("silent hardening… of policy into a practiced precise value") | elicitation.md Policies typology + universal "normative language is policy"; spec hard-failure gates | Elicit | Elicitation resource + IR (policies) | Quote the manual at the expert and ask when the rule was last broken; the agent must record both accounts as a Conflict if they diverge | Established |
| What a newcomer gets wrong | A cheap, reliable probe for tacit distinctions no heading reaches | elicitation.md Policies ("what a newcomer gets wrong") | Elicit | Elicitation resource | Drop the topic entirely; nothing in the run fails loudly — this is a candidate for a targeted follow-up trigger rather than a check | Established but uncovered by any gate |
| **Groups** | | | | | | |
| What the batch is, whether it must stay together, what a split costs, what forms it (count or clock) | Batch formation and splitting change throughput semantics; the fab model *cannot* represent lot-splitting and says so as a loss | elicitation.md Grouped movement; SDCPN ref fab (batch 4 lots or 3 h; lot-splitting named simplification) | Elicit; construct the formation/cost encoding | Elicitation resource; construction guidance; IR loss section | Ask whether a half-batch can ship; if the agent assumes atomic batches unasked, or never asks, both are detectable | Established; note formatting gap below |
| **Validation and delivery posture** | | | | | | |
| What observation or replay would make the result accurate enough | Sets the acceptance bar; explicitly excludes storing the expert's predicted answer as structure | elicitation.md Validation criteria | Elicit | Elicitation resource + IR | If the IR's validation section echoes the objective's measure verbatim, it was paraphrase, not a distinct question | Established |
| What the expert wants to vary between runs / what-if comparisons they actually want | Defines the parameter and scenario surface construction should aim at, in objective terms ("baseline vs surge", "policy A vs B") | ai.ts interview triad item 3 (construction-coverage evidence); elicitation.md Posture ("what they may vary") | Elicit the *intent*; construct maps it to tunable values | Elicitation resource (intent); construction guidance (realization) | Check the IR: if no "what would you change between runs" question is traceable, the delivery cannot offer scenarios without inventing intent | Gap: no IR home for scenario intent beyond validation criteria — candidate home is validation criteria, extended |
| Epistemic marks (Unknown / Not-yet-asked / Assumed / Conflict / Omitted / Loss) | Every hard-failure gate depends on marks being in place, in the section where the hole is | ir-template.md; spec hard-failure gates | Agent bookkeeping (neither elicit nor infer — it is fidelity discipline) | IR obligation + checks | Plant a hedge ("usually about twenty") and see if it survives as "about twenty" or hardens to "20" | Established |
| **Explicitly construction-only** | | | | | | |
| Place/transition/arc realization, start/in-progress/done shapes, guards, priorities, formation transitions, parameter naming, layout | Buys nothing in conversation and costs its vocabulary | elicitation.md rabbit holes ("Building the net in conversation"); pn-construction.md patterns; fe-1525 fog 2 (Transform lines did no harm but are construction knowledge) | Construct | Construction guidance (move homes here — see typology assessment) | Inspect transcripts for net vocabulary reaching the expert | Established; homes need moving |
| Named inference/approximation/loss at delivery | Cold reader must reconstruct intended process and assumptions from the IR alone | pn-construction.md Inference and projection loss; checks.md Loss review; oracle claim 7 | Construct (with IR recording the loss) | Checks + construction guidance | Deliver silently "released as it arrived" — the check should catch an unnamed default | Established |

**Targeted follow-up-question triggers.** Which obligations, when missing at the moment construction is about to start, should generate *one smallest next question* rather than a gap note (SKILL.md "Return from construction" is the mechanism; fe-1525 fog 5 found it unexercised — the agent delivered `partial-with-named-gaps` instead):

1. Missing objective or measure → must return to elicitation, not construct.
2. Missing spine (trigger, order) → must return (checks.md already says this).
3. Input fate unclear for a capped resource → ask one question ("when the crew finishes, do they go straight to the next job or back to a pool?").
4. A contention rule stated as policy with no practice check → ask the occasion, not the rule.
5. An arrival account absent while the objective is throughput/timing → ask how work arrives.
6. A "typically N" duration with the objective explicitly caring about tails → ask the one-in-ten question, then stop.

Everything else stays as a marked gap; the trigger list must stay short or it becomes a schema-shaped checklist through the back door.

---

## Situation-typology assessment

The typologies are declared as question shapes, not node types ("Each pattern below is a question shape, not a node type to assign"), which is the right anti-caricature posture under the three laws (a pattern name retrieves relevant properties; it is not a blueprint). Assessment per typology:

**Timed work.**
- *Evidence:* inbox doc "Things that take time" (the original module); elicitation typology; fe-1525 fog 7 (universal timing lines steered runs).
- *Helps notice:* occupation during the step, typical vs tail, source-or-assumed discipline.
- *Risks overfitting:* every step acquiring a duration interview; forcing distributions (its own caveat guards this); conflating work time with waiting time (its largest blind spot — hidden waiting is not in its "notice when").
- *Verdict:* **keep**, with one edit — "notice when" should include "or time is spent waiting rather than working", and its PN-transform line should move out (see boundary section).

**Branching outcome.**
- *Evidence:* inbox doc "Things with probabilistic branching outcomes"; elicitation typology; universal incident-vs-rate rule.
- *Helps notice:* both paths, deciding condition, frequency roughness.
- *Risks overfitting:* binary framing — experts describe three-way outcomes ("fine / rework / scrap") and the shape nudges two paths; a vivid incident becoming a probability (caveat present and correct).
- *Verdict:* **keep**; reword "roughly how often" to allow "and what's the third outcome" framing, or fold that into the question list.

**Contended resource.**
- *Evidence:* spec oracle ledger example (`washdown-shared-crew`, trap: do not infer the rule from the published schedule); fe-1525 fog 7 (steered the real run); elicitation typology; construction pattern.
- *Helps notice:* instance counts, practiced priority, overrides, borderline cases. Strongest typology against the real runs.
- *Risks overfitting:* seeing contention everywhere and probing resource politics no stated question depends on; treating a named-but-uncapped entity as contended.
- *Verdict:* **keep** unchanged.

**Threshold trigger.**
- *Evidence:* SDCPN ref (reorder point, wear threshold, relief setpoint); elicitation typology; inbox doc Triggers 1c.
- *Helps notice:* the observable actually watched, who/what flips it, what starts or stops.
- *Risks overfitting:* (a) harvesting thresholds for quantities that trigger nothing (its caveat covers this); (b) the deeper miss: quantities that never cross but **scale** — wear raising failure rates, temperature scaling boil-off, product type stretching durations. The typology's "notice when" covers crossing only; the lenses cover scaling in one line, but nothing organizes a question shape for "what does this state change the *rate* of?".
- *Verdict:* **keep, and extend** — either add a "condition-conditioned behaviour" typology (evidence: SDCPN ref fab — "breakdown rate grows exponentially with condition", furnace step time ±15% by product type; concrete failure mode: a worn machine modelled with a fresh machine's failure rate is a silently wrong answer to every reliability question) or promote the lens line into a full question shape. Splitting is justified by sources and a concrete failure mode; the two are operationally distinct questions to an expert ("what gets decided at a level?" vs "does condition change how often/how long?").

**Mode change.**
- *Evidence:* elicitation typology (setup, changeover, restart, warm-up, handover; "what is lost"; "whether loss depends on direction"); fe-1525 fog 7 (changeover steered the run); construction pattern (directional loss on the transition).
- *Helps notice:* loss during change, unrunnable next state, "ask before recording not-applicable".
- *Risks overfitting:* under-specifying *which* loss — setup time, scrap, yield dip, and availability are different losses an expert distinguishes naturally; the directional question is present but buried as a clause, and the adversarial case (directional changeover loss) shows it is the most commonly flattened component.
- *Verdict:* **keep**; split the "what is lost" probe into its components (time / material / availability / what cannot run next) so the direction question lands.

**Grouped movement.**
- *Evidence:* SDCPN ref fab batch formation (4 lots or 3 hours) and the lot-splitting loss; elicitation typology.
- *Helps notice:* group identity, must-stay-together, split cost.
- *Risks overfitting:* least-developed typology — no "questions that may help", no caveats, no check line (inconsistent with siblings); no formation trigger question (what makes a batch go: count, clock, or order?).
- *Verdict:* **keep but complete** to the sibling format (formation trigger, split permission, split cost, questions, caveat); do not merge with threshold trigger — a batch going at count-4 is a trigger, but the load-bearing investigation is group identity and split economics, which threshold-trigger cannot hold.

**Missing typologies — additions justified by sources and concrete failure modes:**

- **External arrival / demand** (proposed above in the matrix). Evidence: every reference domain has an exogenous arrival process the modeller must know (draw rate 0.80/h, loads posted at stochastic rates, lots arriving stochastically, morning-commute demand in the cellular library idea); concrete failure: a throughput-answering model with no arrival account — the agent invents a Poisson source. Distinct from timed work and branching: it is about cases entering the system, not steps inside it.
- **Condition-conditioned behaviour** (proposed above, as an extension of or split from threshold trigger).
- **Rejected additions:** "queue/waiting" as a typology — waiting is a property of timed work and contended resources; a separate typology would double-count. "Priority/deadline rules" — this is policy-vs-practice territory with a known home; a typology would duplicate. "Escalation/approval" — a prerequisite plus a delay, both already covered; adding it would be premature prescriptiveness without a run that missed it.

**Overall sufficiency verdict:** the six typologies are not prematurely prescriptive (they are question shapes with caveats and checks), but they skew toward *what the agent will draw* rather than *what makes cases come into existence and what state does to rates* — hence the two additions, plus the grouped-movement completion and the timed-work waiting note.

---

## Interview/construction boundary

The precise rule, derivable from SKILL.md ("Do not interview through places, transitions, arcs, colours, tokens, or firing rules"), elicitation.md rabbit holes ("Building the net in conversation… places and transitions buy nothing and cost their vocabulary"), and fe-1525 claim 4:

**May shape questions (formalism-informed, expert-safe):**
- The *distinction inventory*: does it take time; is the input consumed, reserved, or read; is success guaranteed; what does the branch decide; what does the level cross; is the rule written or practiced; does the batch stay together. These are SDCPN-load-bearing distinctions expressible entirely in operational words ("when the van's done, does it go back to the pool, or is it yours until Friday?").
- The *epistemic posture*: typical vs bad case before any number; occasions rather than generalisations; policy must be checked against practice; an incident needs opportunities-and-period before it is a rate.
- The *objective-relative depth rule*: no thread without a stated question depending on it.

**Must not reach the expert (construction-owned):**
- Node vocabulary and topology (places, transitions, arcs, tokens, guards, weights, initial marking).
- Encodings and their consequences (start/in-progress/done decomposition; read-arc equivalents; formation transitions; reserved-token return).
- Distribution machinery and families (lognormal, exponential, Ornstein-Uhlenbeck); the expert is asked for typical and one-in-ten, never for a distribution class.
- Parameter/scenario/extension plumbing; Petrinaut tool names, payload fields, or schema shapes; metrics as code.
- Structural guarantees (reachability, boundedness, liveness) and rare-event methods — these inform *construction validation* and the delivery's claims, not the interview.

**The one-way valve:** typology PN-transform lines currently sit inside `elicitation.md` as children. fe-1525 fog 2 observed they did no harm on two runs, but they are construction knowledge in the wrong resource, and the spec's inner-loop check ("No PN vocabulary in expert-facing questions; construction resources remain out of elicitation") treats the file location as the boundary of trust, not observed behaviour. The typologies' *noticing/questioning/recording* content stays in elicitation; their transform content has an existing home in `pn-construction.md`'s "Reusable construction patterns," which already duplicates it.

---

## Adversarial probe catalog

Each case names the operational trap, the wrong behaviour, and the evidence an oracle could cite (usable as hidden-ledger entries per the spec's case design).

1. **Policy versus practice.** *Pack:* "The SOP says changeover takes 45 minutes" plus an unstated practiced 90 minutes when product changes colour direction. *Wrong:* agent records 45 min as the duration, or asks nothing about the last actual changeover. *Right:* asks when it last happened, records both as a Conflict if they diverge. *Ledger trap:* `do not record the document as practice`. (Source: universal normative-language rule; spec hard-failure "silent hardening of policy".)
2. **Shared-resource contention.** *Pack:* one two-person crew; two lines that both want it; a published schedule implying a priority nobody follows. *Wrong:* agent infers the priority from the schedule, or never asks for instance counts. *Right:* asks what happens when both want it at once, elicits the practiced rule or marks it Unknown. (Source: spec ledger example; elicitation caveat.)
3. **Hidden waiting.** *Pack:* "We send the sample out and it's back Friday" — 20 minutes of work, 4 days of queue. *Wrong:* agent records a multi-day step duration, or drops the wait. *Right:* separates occupied-from-waited-for; asks what the sample is doing in between and whether it can be expedited. (Source: "queues implied by waiting"; SDCPN ref SPN section — journey time vs return-trip separation.)
4. **Directional changeover loss.** *Pack:* cleaning from dark to light tint costs an extra shift; light to dark does not. *Wrong:* agent records one symmetric "changeover ≈ 2 h" or marks the mode change "not applicable" without asking. *Right:* asks the last changeover in each direction, records directional loss. (Source: mode-change typology "whether loss depends on direction"; fe-1525: directional washdowns were the real case's heart.)
5. **Rare incident mistaken for a rate.** *Pack:* a vivid tank-venting story, told once, no base data. *Wrong:* agent turns it into a failure probability or a distribution parameter. *Right:* asks how many opportunities over what period; if unanswerable, marks Unknown and proceeds without inventing. (Source: universal "memorable incident is not a rate"; hard-failure class "invented content".)
6. **Unknown distribution.** *Pack:* "inspection takes about twenty minutes, sometimes an hour when the lab's backed up," no data, and the expert cannot say more. *Wrong:* agent asks min/likely/max and fits an exponential (memoryless delivery "arriving in minutes" is exactly the pathology the SDCPN reference documents). *Right:* records typical + tail-if-objective-cares, parameterizes the rest, names it. (Source: "do not force a distribution the expert cannot observe"; SDCPN ref DCPN section on exponential failure.)
7. **Grouped work that may split.** *Pack:* furnace batches of four lots; a rush order wants two lots out early. *Wrong:* agent assumes batches are atomic without asking, or never asks what forming the batch costs in waiting. *Right:* asks what the group is, whether it must stay together, what a split costs — and records a Loss if splitting is real but the agreed scope excludes it (the fab model's named simplification is the honest precedent). (Source: grouped-movement typology; SDCPN ref lot-splitting.)
8. **A continuous quantity that triggers nothing.** *Pack:* a monitored ambient temperature the team logs but no decision reads — *and*, in the same case, boil-off that scales with it. *Wrong, both directions:* the agent models the logged temperature "for completeness" (the threshold-trigger caveat violated), or dismisses the whole thread and silently drops the temperature-dependent boil-off the stockout question depends on. *Right:* asks what reacts to it; keeps the inert quantity out, keeps the scaling relation. (Source: elicitation caveat "a continuous quantity that triggers nothing usually does not belong"; SDCPN ref boil-off scaling with ambient temperature.)

Two additional cheap probes worth folding into the oracle ledger (not new typologies): the **newcomer probe** ("what does someone get wrong in their first month?" — surfaces a tacit rule no heading would reach) and the **borderline-case probe** (the last time two jobs wanted the crew at once — the only reliable access to practiced contention rules).

---

## Current-material assessment

Per-file, keep / move / rewrite / cut. No files were edited.

**`SKILL.md` — keep.** The five-phase lifecycle and resource routing are sound and proven (fe-1525 claims 1–2). One small amendment candidate: phase 5's return-to-elicitation trigger list is not yet specified anywhere as concrete obligations (see matrix follow-up triggers); when it lands, it belongs here or in `checks.md`, not as new elicitation prose.

**`elicitation.md` — mostly keep; targeted rewrite and moves.**
- *Keep:* the universal questioning/evidence/prioritization/stopping sections; the eight "What to investigate" headings (they are IR section homes, not a questionnaire, and the IR template explicitly forbids reading headings aloud); the lenses; the caveats/failure modes.
- *Move:* all six `Transform to PN` lines out of the typologies into `pn-construction.md` (which already carries equivalent patterns). The typologies' Notice/Information/Questions/Record/Caveats/Checks content stays. Also move the "situation notes" mechanism conceptually: it is already duplicated in the IR template, and elicitation need not repeat it.
- *Rewrite:* the typologies section per the assessment above — complete Grouped movement to the sibling format; add the external-arrival and condition-conditioned question shapes; add waiting-separation to Timed work's "notice when"; split Mode change's loss probe into components; add "who decides" reinforcement to Participants.
- *Do not:* turn the eight headings or the typologies into a checklist the agent can march through; the spec's mistake taxonomy already names that failure.

**`ir-template.md` — keep.** The epistemic vocabulary, supersession rule, and empty-section discipline map directly to the spec's hard-failure gates. One candidate addition: validation criteria could gain an explicit home for "what they would vary between runs" (scenario intent), sourced from ai.ts's coverage triad but phrased operationally. The `Situation notes` repeat-block is the right non-questionnaire way to file typology-shaped findings.

**`pn-construction.md` — keep; receive the moved content; tighten.**
- *Keep:* mapping principles, allowed/not-allowed inference lists, projection-loss section, the worked examples, and the Petrinaut tool discipline (which correctly defers to mounted schemas rather than restating them — consistent with the FE-1525 side-quest decision not to copy payload fields).
- *Receive:* the typology transform lines, so construction is the single home of net-shape knowledge.
- *Tighten:* the "Inference and approximation" list should explicitly name the two flattening defaults the adversarial catalog targets — symmetric changeover where the IR recorded direction-dependence, and constant rates where the IR recorded condition-dependence — as *not allowed without a named loss*.
- *Cut:* nothing.

**`checks.md` — keep; extend with negative checks.**
- *Keep:* elicitation sufficiency, IR checks, PN validity, loss review, stopping outcomes.
- *Add (sourced from fe-1525):* (1) a **vacuous-success guard** — the side quest showed `parseSDCPNFile` returning `ok: true` on an empty legacy document; a check should require a non-empty, semantically inspected net (the proof already demands this in prose; make it a named check); (2) an **arrival/spine check** — if the objective is throughput- or timing-shaped and the IR has no arrival account, construction does not proceed; (3) a **vocabulary check** on the delivery — no place/transition/arc language in the expert-facing summary; (4) the return-to-elicitation trigger list (the five or six smallest next questions above) so the unexercised loop of fe-1525 fog 5 has content.

**Cut outright:** nothing in the current skill resources is unearned. The closest to a cut candidate is the `Transform to PN` children (moved, not deleted) and, if the typology set grows, any further typology lacking both a source and an observed run failure — the typology list should be capped by evidence, the same discipline the AGENTS.md "deepen only under observed strain" law applies to design.

---

**Completion check.** Every obligation above is objective-relative (depth gated on the stated question), carries a source citation, has exactly one lifecycle home, and has a probe that could disprove its usefulness (a failing probe means the obligation is decorative and should be cut, not that the agent failed harder). No Petrinaut API field names or payload contracts appear; the IR headings are treated as filing homes and explicitly forbidden as an expert-facing questionnaire; construction-only material is confined to construction and checks.
