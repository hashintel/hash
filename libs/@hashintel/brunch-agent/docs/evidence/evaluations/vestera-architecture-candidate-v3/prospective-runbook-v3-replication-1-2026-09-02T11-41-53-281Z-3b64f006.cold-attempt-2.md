# Cold IR review — prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006

## Verdict
- Overall cold utility: **3.2 / 4**
- Downstream semantic readiness: **conditional**
- Confidence: **high**
- One-sentence diagnosis: Excellent epistemic discipline and actionable gap identification create a reliably reconstructable skeleton, but missing quantitative parameters and initial conditions prevent objective-credible modeling without explicitly conditional assumptions.

## Reconstructed model

### Purpose and decisions
The scheduler needs to test scheduling decisions before production execution. Four simulation questions drive the model: on-time delivery performance, changeover hours consumed, whether alternative sequences reduce changeover time, and optimal reshuffles when Line 2 fails. Success measures are on-time delivery (especially for penalty-risk customer Meridian), changeover hours (management wants these reduced), and recovery sequencing capability. The weekly planning horizon runs Monday morning (demand book arrival ~8 AM) through Friday shipping, sometimes slipping to Monday.

### Boundary and horizon
The model starts when the ERP demand book drops Monday ~8 AM and ends when orders ship after QA clearance. Inside scope: scheduling, line allocation, production execution, QA hold, shipping. Outside scope: ERP demand generation and materials supply (noted as occasionally short but not detailed). One-week planning cycle. Weekly demand is 40-60 orders, each specifying SKU, quantity, and due date.

### Operational flow
Each order progresses: demand book → scheduler allocation → sequenced slot → changeover → production run (mix → mill → tint/letdown → fill/pack) → QA hold (~4 hours whites, sometimes full day specialty) → ship. Production uses three lines with different speeds, qualifications, and shift patterns. Holding tanks exist between mill and fill; Line 2's tank is better than Line 1's tiny tank. Daily 7:30 AM huddles adjust the schedule for overnight events and problems. The scheduler groups orders by product family (whites, tinted colors, specialty clears) to minimize expensive family-switches.

### Resources and constraints
**Line 1:** Slower baseline speed, qualified for everything (all whites/tints/specialty clears), two shifts, reliable, tiny holding tank.

**Line 2:** ~2x Line 1 speed on whites, qualified for whites and tints only (never piped for specialty resins), two shifts, better holding tank, **hard constraint: Meridian whites must run here** (customer audited this line), **reliability issue: filler jams every week or two** (duration "couple hours" to "half a shift").

**Line 3:** Speed between L1 and L2 (closer to L2), being qualified product-by-product (can run most whites, some tints not yet signed off, specialties qualified more recently), day shift only unless overtime approved.

**QA lab:** 2-person team, runs tests, backs up end of week.

**Changeover times (known):** white→white 20-30 min (quick rinse), white→tint ~45 min, tint→white 3 hours (full washdown; pigment carryover ruins white). All changeovers produce ramp scrap (first few units don't meet spec), worse after big washdowns.

### Variation, failures, and policies
**Line 2 jam disruption** (every week or two): When Line 2 jams mid-run, scheduler chooses from three options based on maintenance estimate, qualified line availability, and urgency: (1) wait it out if 1-2 hours and run almost done; (2) move rest of run to another qualified line if downtime ≥half shift and capacity available; (3) scrap in-progress and restart later (almost never—too wasteful). Meridian orders with tight due dates trigger more aggressive moves; small distributor orders that can slip favor waiting.

**Practiced policies:** Group by product family when possible; prefer white-to-white sequences over white-tint-white (avoid 3-hour washdown); Meridian orders get priority under contention (penalty/delisting risk).

**Other disruptions mentioned but not quantified:** Batch QA failures requiring adjust-and-retest, materials occasionally short.

**Stated trade-off dilemma:** If Line 2 finishing a white and another white order "coming in a couple hours," hold line idle vs. wash down to tint? Scheduler "thinks waiting sometimes makes sense" but cannot prove it; boss wants fewer changeover hours.

### Validation expectations
The model should show on-time delivery performance, count changeover hours, allow testing alternative sequences, and support pre-planning reshuffles when Line 2 fails. The scheduler is the primary user; management is the audience for changeover reduction analysis.

## Scorecard

| Subdimension | Score (0–4) | Evidence and rationale |
| --- | ---: | --- |
| **Objective and decision legibility** | 4.0 | "Primary simulation questions" (four bulleted) and "Intended decision support" (three bulleted) are crisp. "Success measures" explicitly ties on-time delivery to Meridian penalty risk and changeover hours to management directive. "Target Representation Notes" acknowledges formalism unknown. No conflation of simulation questions with construction format. |
| **Process and relationship reconstructability** | 3.5 | "Process Spine: One Order From Demand Book to Ship" provides step-by-step VW-01 walkthrough with stages, performers, constraints applied, timing. "Resources: Production Lines" documents three lines with speed relationships, qualifications, shift patterns, and reliability. "Disruptions and Recovery" details Line 2 jam three-option logic with decision factors. Missing: quantitative rates, fill-up times, shift hours, holding tank capacities—but all flagged as NOT YET ASKED and listed in "Open Questions" §1-10. |
| **Constraints, variation, and policy/practice legibility** | 3.0 | "Scheduling Constraints and Policies" separates hard constraints (Meridian→Line 2, specialty clears→L1/L3 only, Line 3 SKU qualification) from practiced policies (family grouping, white-sequence preference, Meridian priority). "Disruptions and Recovery" explains three-option jam response with decision factors and contextual examples. "Trade-off under uncertainty" names the wait-vs-washdown dilemma scheduler cannot yet prove. Gap: tint→tint and specialty changeover times not asked; Line 3 qualification list not asked; wait-time thresholds in practice not asked (all in "Open Questions"). |
| **Epistemic legibility** | 4.0 | Exemplary use of "NOT YET ASKED" inline (15 instances) and consolidated in "Open Questions and Unresolved Material" with subsections for critical-but-not-asked, consequential unknowns flagged by scheduler, deliberate simplifications (none yet), assumptions (none yet), conflicts (none yet), contextual variations. "Known" vs. "NOT YET ASKED" sections in "Quantities, Rates, Time" clearly separate available from missing data. "Reality qualifier" quotes scheduler's own caveat. "Initial Conditions and State" explicitly marks as NOT YET ASKED. No invented facts. |
| **Gap actionability** | 3.5 | "Open Questions" §1-13 prioritizes gaps as "Critical for construction." Each item is specific (e.g., "units/hour for product-line combinations," "tint-to-tint changeover time"). "Consequential gaps that block faithful construction" translates missing data into modeling consequences (prevent accurate time modeling, sequencing cost, stochastic behavior, simulation start, fit-for-purpose assessment). "Validation and Evidence Sources" lists NOT YET ASKED questions about credibility criteria and historical data availability. Minor gap: does not always state which downstream decision each question unlocks, though inference is usually clear. |
| **Reader effort and navigability** | 2.5 | Logical section hierarchy; "Process Spine" walkthrough is findable. "Scheduling Constraints" and "Disruptions" are separate sections. However: (1) changeover times scattered between "Process Spine" §5 and "Quantities, Rates, Time"; (2) Line 2 jam details in "Disruptions" but jam frequency also appears in "Quantities, Rates, Time" NOT YET ASKED; (3) daily huddle in "Process Spine" §3 but not cross-referenced in "Disruptions" where it appears again; (4) some readers may want product family definitions closer to constraints that reference them. Important material is present but requires spot-checking multiple sections. |

**Overall cold utility:** (4.0 + 3.5 + 3.0 + 4.0 + 3.5 + 2.5) / 6 = **3.2**

## Load-bearing assumptions

**None explicitly introduced.** The IR states "Assumptions: None explicitly introduced yet" and does not treat unasked questions as resolved. This is appropriate discipline given the available evidence.

**Implicit dependency:** The reconstruction above assumes the demand book structure (SKU, quantity, due date per order) is complete—but the IR does not ask whether orders have other attributes (priority flags, customer constraints beyond Meridian, split-shipment rules). This dependency is not load-bearing for the stated skeleton but would become so if the model tried to represent all practiced priority rules.

## Contradictions or ambiguities

**Line 2 downtime duration:** "Maintenance estimate at huddle: 'at least a couple hours'" vs. "Actual duration: 'more like half a shift.'" The IR correctly treats this as contextual variation (estimate vs. actual for one event), not a contradiction. However, the IR does not ask whether "half a shift" jam durations are typical or exceptional, creating ambiguity about the stochastic distribution needed for modeling.

**"Couple hours" for incoming white order:** In "Trade-off under uncertainty," the scheduler considers whether another white order is "coming in a couple hours." The IR does not ask whether orders actually arrive during the week or all appear Monday, creating ambiguity about whether this phrase means "due in a couple hours" (from the Monday demand book) or "arriving mid-week" (demand book is incomplete). This ambiguity is consequential for modeling intra-week dynamics.

**QA hold "backs up end of week":** Does this mean QA duration increases, QA queue depth increases (waiting for 2-person lab), or both? The IR notes the congestion but does not ask which resource or timing constraint drives it.

**Ramp scrap "not so bad" vs. "worse after big washdowns":** Relative comparison without quantities. The IR correctly flags scrap quantities as NOT YET ASKED but does not ask whether "not so bad" means operationally negligible (model can ignore) or consequential (model must represent). This creates ambiguity about whether scrap affects scheduling decisions or only costs.

## Smallest next questions

Ranked by downstream modeling impact:

1. **Production rates (units/hour) for each product family × line combination, and hours per shift.** *Unlocks:* Accurate time modeling for any sequence; determines whether capacity constraints bind; enables testing alternative sequences for changeover reduction.

2. **Complete changeover time matrix (tint→tint, all specialty combinations, whether times vary by line).** *Unlocks:* Accurate sequencing cost; determines whether family-grouping policy is optimal or can be refined; enables simulation of scheduler's wait-vs-washdown dilemma.

3. **Initial state at Monday 8 AM (line status, WIP, QA queue, prior week carryover).** *Unlocks:* Simulation start; determines whether weekly planning is independent or coupled to prior state.

4. **Line 2 jam frequency distribution and downtime duration distribution.** *Unlocks:* Realistic stochastic disruption modeling; determines whether jam recovery is occasional edge case or weekly planning driver; enables pre-planning reshuffles (stated objective).

5. **Line 3 SKU qualification list (which tints not yet signed off, which specialties qualified).** *Unlocks:* Accurate line eligibility constraints; determines available recovery options when Line 2 jams; affects family-grouping feasibility.

6. **Historical validation data availability (past demand books, run logs, changeover records, downtime logs) and credibility criteria.** *Unlocks:* Model calibration; determines whether model can be validated against observed performance or must rely on face validity; informs parametric vs. structural uncertainty.

7. **Due date distribution in demand book and product family distribution.** *Unlocks:* Realistic demand scenarios for testing scheduling decisions; determines whether on-time delivery is hard or easy under typical load; affects Meridian priority policy impact.

## Material that is difficult to find or use

**Changeover time information** is split: white→white, white→tint, tint→white in "Process Spine" §5; ramp scrap qualitative description also in §5; tint→tint and specialty times noted as NOT YET ASKED in §5; changeover times listed again under "Quantities, Rates, Time: Known." A reader constructing a changeover time matrix must check both sections.

**Line 2 jam disruption mechanics** appear in "Disruptions and Recovery" but jam frequency also appears in "Quantities, Rates, Time: NOT YET ASKED" as "every week or two → distribution?" A reader assessing whether jams are material to weekly planning must cross-reference.

**Daily huddle** is introduced in "Process Spine" §3 as adjustment mechanism, mentioned again in "Disruptions and Recovery" as where scheduler learns maintenance estimate, but not indexed or cross-referenced. A reader asking "how does the scheduler learn about overnight events" must search or know to check process spine.

**Product family definitions** (whites, tinted colors, specialty clears) appear in "Product Families and Distinctions" but are referenced throughout constraints, policies, and changeover sections without always restating what they mean. A reader unfamiliar with coatings might not immediately recognize "specialty clears" as a third family distinct from whites.

**Line speeds** are stated relationally (Line 2 ~2x Line 1 on whites, Line 3 between L1 and L2 closer to L2) in "Resources: Production Lines" and repeated in "Quantities, Rates, Time: Known," but the VW-01 example ("800 units on Line 2 for whites took about half a shift") appears only in "Process Spine" §6. A reader trying to infer absolute rates must combine sections.

## What can safely proceed from this IR

**Conceptual model structure:** The three-line, multi-stage (mix→mill→tint/letdown→fill/pack), family-grouped, disruption-recovery model structure is clear. A downstream modeler can sketch a Petri net topology with places for lines, stages, QA, and shipping without inventing relations.

**Qualitative constraint logic:** Meridian→Line 2 hard constraint, specialty clears→L1/L3 only, Line 3 SKU qualification (even without the list), and practiced family-grouping policy can be represented symbolically or as eligibility matrices.

**Three-option jam recovery skeleton:** The decision tree for Line 2 jams (wait, move, scrap) with contextual factors (maintenance estimate, qualified line availability, urgency) is reconstructable as conditional branching logic. A parametric model can proceed with placeholder thresholds explicitly marked as assumptions.

**Validation intent:** The four simulation questions and three success measures provide a clear objective function for model design. A modeler knows the model must count changeover hours, track on-time delivery, and support sequence testing—not, say, optimize inventory or labor costs.

**Epistemic boundary:** The IR's discipline about NOT YET ASKED prevents a downstream modeler from silently inventing rates, changeover times, or failure distributions. The "Open Questions" section provides a checklist for conditional-model documentation.

## What cannot safely proceed

**Quantitative time modeling:** Without production rates (units/hour), fill-up times, shift hours, and the complete changeover time matrix, a model cannot accurately simulate "does it all fit in the week" or "how many changeover hours" or "better sequence reduces changeover time." Any constructed model would have to invent these values or leave them as named parameters requiring calibration.

**Stochastic disruption modeling:** Without Line 2 jam frequency and duration distributions, QA failure rates, or materials shortage frequency, a model cannot realistically simulate recovery decisions or estimate on-time delivery risk. The "every week or two" phrase is too vague for sampling.

**Initial conditions:** Without knowing Monday 8 AM line states, WIP, or QA queue, a simulation cannot start. The model could assume clean slate (all lines empty, no carryover) but this would be a load-bearing assumption requiring explicit documentation.

**Line 3 eligibility decisions:** Without the SKU qualification list, a model cannot accurately simulate whether moving a jammed Line 2 run to Line 3 is feasible. A model could use a placeholder "X% of SKUs qualified" parameter, but this loses the SKU-specific structure the scheduler uses.

**Validation against reality:** Without historical data (past demand books, run logs, downtime logs) or credibility criteria from the scheduler, a constructed model cannot be calibrated or validated. It could be internally consistent but not objective-credible for the stated decisions.

**Wait-vs-washdown trade-off resolution:** The scheduler's stated dilemma cannot be resolved without knowing (a) whether "couple hours" for incoming white orders is a real intra-week arrival or a due-time phrase, (b) quantitative chang
