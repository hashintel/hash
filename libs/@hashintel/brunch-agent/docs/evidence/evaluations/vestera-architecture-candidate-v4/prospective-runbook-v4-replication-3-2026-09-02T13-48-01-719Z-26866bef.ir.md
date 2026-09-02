# Process-Model Workpiece

## Purpose and posture

### What the model must answer, compare, or support

**Expert evidence:** "What I *really* want to know is whether it's ever worth holding a line idle to wait for a same-family order instead of paying for an expensive washdown. I do it by gut now — like, I'll sit Line 2 for an hour rather than wash down for one pallet of tint — but nobody can prove whether that's smart or not."

**Expert evidence:** "And when a line goes down at six in the morning, I'd love to know what to re-shuffle instead of just improvising at the huddle. Where are all the changeover hours actually going? Would reordering runs claw some back?"

**Working account:** The model must support testing scheduling decisions:
- Whether to batch orders by product family versus accepting expensive washdowns
- Whether to hold a line idle waiting for a same-family order
- How to recover and re-sequence when a line fails
- Where changeover time is consumed
- Whether reordering runs reclaims changeover time

**Expert evidence:** "We need to get the weekly demand book out on time — that's the thing that actually matters. Late orders get me shouted at."

**Working account:** The scheduling decisions must be evaluated while maintaining on-time delivery of the weekly demand book.

### Who will use it and how

**Expert evidence:** The user is the master scheduler at a coatings plant. Their boss requested a simulation model to test scheduling decisions before making them.

**Working account:** The scheduler will use the model to evaluate sequencing and recovery choices before committing them to the actual operation.

### Boundary, horizon, and accuracy expectation

**Expert evidence:** Weekly demand book; Monday arrival, Tuesday allocation complete, production and shipping by end of week (Thursday/Friday target).

**Working account:** One-week planning horizon. The model boundary includes order arrival through shipment. ERP demand book generation is outside the boundary (arrives as input). Post-shipment delivery is outside the boundary.

**Not yet asked:** Required accuracy for decision confidence; tolerable prediction error; whether historical comparison data exists.

### Available time and assumption appetite

**Not yet asked:** How soon the model is needed; tolerance for assumptions versus additional data gathering.

### What the result must not claim

**Not yet asked:** Constraints on model scope or claims.

## Operational account

### Goals, measures, constraints, and thresholds

**Expert evidence:** "We need to get the weekly demand book out on time." Late delivery triggers complaints.

**Working account:** Primary constraint is meeting order due dates. Trade-offs include changeover cost versus idle time, and schedule recovery options when disruptions occur.

**Not yet asked:** Quantitative targets (e.g., percent on-time); cost structure (idle time cost, changeover labor cost, late delivery penalty); threshold for "too late."

### Boundary conditions, triggers, prerequisites, and initial state

**Expert evidence:** "I start with the demand book — it drops out of ERP every week, usually Monday morning. It's roughly 30 to 60 orders, each one's got an SKU, a quantity, and a due date."

**Working account:**
- Demand book arrives Monday morning from ERP
- Contains 30-60 orders per week
- Each order specifies: SKU, quantity (in gallons), due date

**Not yet asked:** Exact timing of Monday arrival; whether arrival can be delayed; whether emergency orders arrive mid-week; distribution of order sizes; distribution of due dates within the week; initial line states at week start (what's running, what family was last produced); initial QA queue; whether demand book ever arrives incomplete or changes after arrival.

### Participants, locations, flowing things, and resources

#### Production lines

**Expert evidence:** "...start sketching out which lines can handle what. Then I juggle it on the sheet — that's my Excel allocation — mapping orders onto the three lines..."

**Working account:** Three production lines available for order allocation.

**Line 2:**
- **Expert evidence:** "Line 2's the fast one."
- **Expert evidence:** "Line 2's filler jams every week or two — maybe half an hour to half a shift to clear it and get running again. That one's regular enough I almost plan around it."
- **Working account:** Fastest line; filler jams occur every 1-2 weeks; jam clearing takes 0.5 to ~4 hours.

**Line 1:**
- **Expert evidence:** "Line 1's mill motor is the scary one. Rare, but when it goes, it *goes*. Took four days once. That's the kind of thing that blows up the whole week."
- **Working account:** Mill motor failures are rare but severe (one instance: 4 days downtime).

**Line 3:**
- **Expert evidence:** "Line 3's still pretty new, so we haven't built up the history yet, but it's been pretty reliable so far."
- **Working account:** New line, reliable to date, limited failure history.

**Not yet asked:** Whether all lines can produce all product families or have capability restrictions; line capacities; exact failure frequency distributions; whether lines can be started/stopped at will or have setup/shutdown time; shift coverage and calendar availability for each line.

#### Changeover crew

**Expert evidence:** Referenced in "...we need the changeover crew to come wash it down..."

**Working account:** A changeover crew performs line washdowns and changeovers. They must be available before a line can switch product families.

**Not yet asked:** Changeover crew size; how many lines they can service simultaneously; their availability (shifts, breaks); whether they can be interrupted or reassigned; contention when multiple lines need changeover simultaneously.

#### QA lab

**Expert evidence:** "...the batch sits in QA hold — typically about four hours, longer if it's end of week and the lab's backed up. Two people in that lab."

**Working account:** QA lab staffed by 2 people. Batches wait in QA hold.

**Not yet asked:** QA test duration versus queue wait; whether "QA hold" is pure waiting or includes active testing time; why end-of-week is slower; QA capacity (batches per hour or day); whether QA operates on same calendar as production; prioritization when backed up.

#### Product families and flowing things

**Expert evidence:** "We've got three families: **base whites**, **tinted colours**, and **specialty clears**."

**Working account:** Three product families:
- Base whites
- Tinted colours
- Specialty clears

Each order specifies an SKU. Orders flow as discrete batches (identified by order, quantity in gallons).

**Not yet asked:** How many SKUs total; how SKUs map to families; whether family membership is strict or some SKUs span families; typical family distribution in weekly demand book; whether orders can be split across lines or must be produced as one batch.

#### Holding tanks

**Expert evidence:** "There are holding tanks between stages — small ones — so product sort of flows through."

**Working account:** Small holding tanks buffer product between production stages.

**Not yet asked:** Tank capacities; whether tank size limits batch size; whether tanks can hold multiple batches or are dedicated to one batch in progress.

### Activities, inputs, outputs, and resource use

#### Allocation (scheduling activity)

**Expert evidence:** "I look at what's due when, what families they're in, and start sketching out which lines can handle what. Then I juggle it on the sheet — that's my Excel allocation — mapping orders onto the three lines, trying to group families together to avoid the expensive washdowns. By Tuesday morning I've got something that looks feasible..."

**Working account:** Scheduler allocates orders from demand book to lines, grouping by family where possible. Allocation complete by Tuesday morning.

**Inputs:** Demand book (read, not consumed)
**Outputs:** Order-to-line assignments with sequencing
**Resource use:** Scheduler (outside model boundary for allocation itself)

**Not yet asked:** Whether allocation is re-done during the week; what "feasible" means quantitatively; whether allocation is done manually or with optimization tool; who approves the allocation.

#### Changeover / washdown

**Expert evidence:** "First, the line has to be ready for it — if it just finished a white, we need the changeover crew to come wash it down, maybe three hours for tint-to-white direction, less if we're lucky."

**Expert evidence:** "If you're staying inside a family — like white to white, or one tint to another tint — it's just a quick rinse. Maybe 20 to 30 minutes. The changeover crew flushes the lines, checks it's clean, and you're good to go."

**Working account:** Changeover prepares a line to produce the next order's family. Duration depends on family transition:

**Within-family changeover:**
- **Expert evidence:** "Maybe 20 to 30 minutes."
- **Working account:** Quick rinse; 20-30 minutes duration.

**Between-family changeover:**
- **White to tint:** ~45 minutes (Expert evidence)
- **Tint to white:** ~3 hours, full washdown (Expert evidence: "...about three hours — because any pigment carryover wrecks a white batch")
- **Specialty in or out either way:** ~2 hours (Expert evidence)

**Not yet asked:** All four specialty transition directions (white↔specialty, tint↔specialty); whether "less if we're lucky" indicates distribution or contextual variation; exact boundaries of 20-30 minute range; whether changeover can be interrupted and resumed.

**Inputs:** Line (reserved: unavailable during changeover), changeover crew (reserved)
**Outputs:** Line ready for specified family
**Resource use:** Line is unavailable for production during changeover; changeover crew is occupied.

#### Production run (mix → mill → tint and letdown → fill and pack)

**Expert evidence:** "Once the line's clean, we start the run. It goes through four stages in order: **mix, mill, tint and letdown, then fill and pack**. There are holding tanks between stages — small ones — so product sort of flows through. The whole run takes however long the math says based on the line rate, plus some time to fill up the tanks at the start."

**Expert evidence:** "For a tint on Line 2? Probably about... I don't know, four or five hours for 500 gallons, something like that. Line 2's the fast one. The sheet does the arithmetic — each product-line pair's got a rate in there, so it's fill-up time plus units divided by rate."

**Working account:** Production run processes an order through four stages in series: mix, mill, tint and letdown, fill and pack. Product flows through holding tanks between stages.

**Duration formula (Expert evidence):** fill-up time + (units / rate), where rate is product-line specific.

**Example (Line 2, 500 gallons, tinted product):** 4-5 hours total production time (Expert evidence: "Probably about... I don't know, four or five hours").

**Inputs:**
- Line (reserved: unavailable during production)
- Order specification (read: SKU, quantity)
- Raw materials (consumption not yet discussed)

**Outputs:**
- Completed batch ready for QA
- Line returns to available state (in the family just produced)

**Not yet asked:** Fill-up time values by product or line; line rates (gallons/hour) for each product-line combination; whether all four stages must complete before shipping or if partial completion is possible; raw material consumption rates and availability; whether production can be paused and resumed without penalty (aside from breakdowns); operator staffing.

#### QA hold

**Expert evidence:** "When filling's done, the batch sits in QA hold — typically about four hours, longer if it's end of week and the lab's backed up. Two people in that lab."

**Working account:** Completed batches wait in QA hold. Typical duration 4 hours; longer at end of week when lab is backed up.

**Inputs:**
- Completed batch (reserved: cannot ship until released)
- QA lab capacity (reserved or read, unclear)

**Outputs:**
- Batch cleared for shipment, or
- Batch failed (not yet discussed)

**Not yet asked:** QA failure rate; what happens to failed batches; whether QA is active testing or passive hold time; exact QA capacity and contention model; end-of-week duration; whether QA operates weekends; prioritization rules.

#### Shipping

**Expert evidence:** "Once QA clears it, it ships. If we timed it right, it goes out Thursday or Friday and hits the due date. If we didn't... well, that's when I get the phone calls."

**Working account:** QA-cleared batches ship. Target ship days: Thursday or Friday to meet due dates.

**Inputs:** QA-cleared batch (consumed: leaves the system)
**Outputs:** Order fulfilled

**Not yet asked:** Shipping capacity; shipping schedule/windows; whether shipping can be expedited; late-shipment consequences (quantitative penalties).

### Case and process spine: flow, branching, joining, failure, retry, and recovery

#### Primary case: Order fulfillment

##### Trigger or admission

**Expert evidence:** Demand book drops Monday morning with 30-60 orders.

**Working account:** Each order (SKU, quantity, due date) enters the process when the demand book arrives Monday morning.

##### Ordered account and references

**Working account, following expert account:**

1. **Order arrival:** Order appears in demand book (Monday morning)

2. **Allocation:** Scheduler assigns order to a specific line and determines sequence, grouping by family to minimize expensive changeovers (completed by Tuesday morning)

3. **Wait for line ready:** Order waits until its allocated line is available and completes any preceding work

4. **Changeover (if needed):** If the line's last family differs from this order's family, changeover crew performs washdown/rinse (duration per family transition table in Activities section)

5. **Production run:** Line processes order through four stages: mix → mill → tint and letdown → fill and pack (duration: fill-up time + quantity/rate; example 500 gal tint on Line 2: 4-5 hours)

6. **QA hold:** Completed batch waits for QA clearance (typically 4 hours, longer end of week)

7. **Ship:** QA-cleared batch ships (target: Thursday or Friday)

##### Branches, joins, waits, failures, recovery, and outcomes

**Waits:**
- After allocation, before line ready
- After changeover decision, if changeover crew busy (Not yet asked: changeover crew contention policy)
- During QA hold

**Failures and recovery:**

**Line breakdown during production:**

**Expert evidence:** "Line 2's filler jams every week or two — maybe half an hour to half a shift to clear it and get running again."

**Expert evidence:** "You pick up where you left off. The crew clears the jam, checks the filler's running clean, and keeps going. The batch that's already through the earlier stages is sitting in the tanks waiting, so once the filler's back up, you just keep filling."

**Expert evidence:** "Now, if it's a *long* stoppage — like more than a shift — sometimes the batch in the mill tank starts settling or skinning over and QA gets nervous. But for the usual jams? Half an hour, hour? You just restart and finish."

**Working account:**
- Short stoppages (0.5 - 1 hour): Production pauses, then resumes. Batch waits in holding tanks. No loss.
- Long stoppages (>1 shift): Batch may degrade (settling, skinning in mill tank); QA may reject (outcome not yet established).
- Line 2 filler jams: every 1-2 weeks, 0.5 to ~4 hours downtime, resume production after clearing.
- Line 1 mill motor failure: rare, severe (one case: 4 days).

**Expert evidence:** "When something goes down, whatever was supposed to run on that line either waits or I scramble to move it. That's the 06:00 call I'm talking about — you show up and Line 2's dead, and now you're re-planning the week at the huddle with everyone staring at you."

**Working account:** When a line fails, affected orders either wait for repair or are reallocated to another line. Scheduler re-plans at morning huddle.

**Not yet asked:** Exact reallocation policy; how often orders are moved versus waiting; whether moving an order incurs penalty; what happens when no line is available; whether partial batches can be salvaged; QA rejection rate for degraded batches; recovery from multi-day outages.

**QA failure:**

**Not yet asked:** Whether QA ever fails batches; rework or scrap policy; retry; whether failed batches can be reprocessed.

**Outcomes:**
- **On-time shipment:** Batch ships by due date (success)
- **Late shipment:** Batch ships after due date (triggers complaints, per expert evidence)
- **Not yet asked:** Whether orders are ever cancelled, diverted, or scrapped.

##### Objective dependencies

The stated objectives depend on:
- **Changeover time consumption:** Family transition durations and sequence decisions determine total changeover hours.
- **Idle versus washdown trade-off:** Decision to hold line idle waiting for same-family order versus accepting expensive between-family changeover.
- **Recovery from line failure:** Reallocation options and their changeover/timing consequences.
- **On-time delivery:** Cumulative time through allocation, wait, changeover, production, QA, and shipping versus due dates.

### Time, quantities, arrivals, and stochastic behavior

**Arrivals:**
- **Expert evidence:** Demand book "drops out of ERP every week, usually Monday morning."
- **Working account:** Weekly batch arrival, typically Monday morning, 30-60 orders per week.
- **Not yet asked:** Exact time Monday; variability in arrival time; whether mid-week emergency orders occur.

**Changeover durations:**
- Within family: 20-30 minutes
- White to tint: ~45 minutes
- Tint to white: ~3 hours
- Specialty in or out: ~2 hours (directions not fully specified)
- **Not yet asked:** Distribution (point values, ranges, or stochastic); whether "less if we're lucky" indicates randomness.

**Production run durations:**
- **Expert evidence formula:** fill-up time + (quantity / rate), where rate is product-line specific.
- **Expert evidence example:** Line 2, 500 gallons tinted product: "four or five hours."
- **Not yet asked:** Fill-up time values; line rates for all product-line combinations; Line 1 and Line 3 rates; distribution versus point estimates.

**QA hold:**
- Typical: 4 hours
- End of week: longer (amount not specified)
- **Not yet asked:** Distribution; end-of-week duration; whether "hold" is queue time, test time, or both.

**Breakdown frequencies and durations:**
- Line 2 filler jam: every 1-2 weeks, 0.5 to 4 hours (per shift) to clear
- Line 1 mill motor: rare, one instance 4 days
- Line 3: reliable, no data yet
- **Not yet asked:** Exact frequency distributions; MTBF and MTTR; repair time distributions; whether breakdowns are truly random or have patterns.

**Order quantities and due dates:**
- **Expert evidence:** Orders have quantities (in gallons) and due dates.
- **Not yet asked:** Distribution of order sizes; distribution of due dates within the week; family distribution in typical demand book.

### Policies, exceptions, practiced rules, and contextual regimes

**Allocation policy:**

**Expert evidence:** "I look at what's due when, what families they're in, and start sketching out which lines can handle what. Then I juggle it on the sheet — that's my Excel allocation — mapping orders onto the three lines, trying to group families together to avoid the expensive washdowns."

**Working account:** Scheduler manually allocates orders to lines, prioritizing family grouping to reduce changeover time, while considering due dates and line capabilities.

**Expert evidence:** "I do it by gut now — like, I'll sit Line 2 for an hour rather than wash down for one pallet of tint."

**Working account:** Practiced policy includes holding a line idle to wait for a same-family order rather than incurring expensive between-family changeover. Threshold is judgment-based (example: 1 hour idle acceptable to avoid tint washdown for small order).

**Not yet asked:** Formal priority rules; tie-breaking when multiple orders could run next; maximum acceptable idle time by context; whether allocation ever optimizes versus heuristic; approval process.

**Reallocation policy when line fails:**

**Expert evidence:** "When something goes down, whatever was supposed to run on that line either waits or I scramble to move it."

**Working account:** Orders on failed line either wait for repair or are reallocated to another line. Decision made at morning huddle.

**Not yet asked:** Reallocation criteria (when to wait versus move); priority for reallocated orders versus already-scheduled orders on other lines; whether partial progress is considered.

**QA priority:**

**Not yet asked:** Whether QA processes batches FIFO, by due date, or another rule; end-of-week backup causes.

### Validation evidence and data sources

**Expert evidence:** "The sheet does the arithmetic — each product-line pair's got a rate in there, so it's fill-up time plus units divided by rate."

**Working account:** Scheduler maintains an Excel sheet with product-line rates and calculates run durations.

**Expert evidence:** "But honestly, the lines never quite do what the sheet says. I blame breakdowns and slow QA, but there's always something."

**Working account:** Actual performance differs from calculated plan. Known causes include breakdowns and QA delays; other unidentified variation exists.

**Not yet asked:** Historical production data availability; whether actual run times, changeover times, breakdown logs, QA times are recorded; data quality and completeness; whether model validation will use historical replay or expert judgment; acceptable match between model and history.

## Cross-cutting issue ledger

- **Specialty changeover times in all directions** — affects: Activities > Changeover; unresolved: whether white↔specialty and tint↔specialty all take ~2 hours or have different durations; consequence: cannot accurately model specialty family changeover costs; re-enter when: scheduler can specify all four specialty transition directions.

- **Line rates and fill-up times** — affects: Activities > Production run, Time quantities; unresolved: no numeric values for line rates (gallons/hour) by product-line pair, no fill-up time values; consequence: cannot calculate production run durations; re-enter when: scheduler provides rate table or access to the Excel sheet.

- **Breakdown frequency and duration distributions** — affects: Participants > Production lines, Time quantities, Case spine > Failures and recovery; unresolved: Line 2 filler jams "every week or two" and "half an hour to half a shift" are ranges, not distributions; Line 1 motor failure frequency unknown (one 4-day incident mentioned); Line 3 insufficient data; consequence: cannot model stochastic line failures accurately; re-enter when: historical breakdown logs available or scheduler can estimate frequencies and duration distributions.

- **QA capacity and queue behavior** — affects: Participants > QA lab, Activities > QA hold, Time quantities; unresolved: whether 4-hour hold is queue wait or test time; QA processing capacity (batches/hour); why end-of-week is slower and by how much; prioritization rule; consequence: cannot model QA bottleneck or contention; re-enter when: QA process details and capacity data available.

- **Line capability restrictions** — affects: Participants > Production lines, Activities > Allocation, Policies; unresolved: whether all three lines can produce all product families or have restrictions; consequence: may incorrectly model allocation flexibility; re-enter when: scheduler specifies line-family compatibility matrix.

- **Raw material availability and consumption** — affects: Activities > Production run; unresolved: whether raw materials are always available or can constrain production; consumption rates; consequence: may miss a real constraint; re-enter when: scheduler indicates whether material availability affects scheduling.

- **Calendar, shifts, and operating hours** — affects: Time quantities, all activities; unresolved: shift structure, weekend operation, holidays, crew availability by time of day/week; consequence: cannot model time-of-day or day-of-week effects accurately; re-enter when: scheduler provides operating calendar.

- **Order splitting and batching** — affects: Case spine, Activities > Production run; unresolved: whether large orders can be split across lines or multiple runs, or must be produced as one batch; consequence: may incorrectly model production options; re-enter when: scheduler clarifies order batching rules.

- **Late delivery consequences** — affects: Goals measures constraints; unresolved: quantitative penalty, customer tolerance, prioritization of at-risk orders; consequence: cannot evaluate scheduling decisions in cost or service-level terms; re-enter when: scheduler or management provides late-delivery cost structure or service-level targets.

## Construction notes

**Not yet attempted.** Construction will require resolution of several cross-cutting issues, particularly line rates, breakdown distributions, and QA capacity, before faithful SDCPN construction is possible.

## Delivery status

### What this workpiece currently supports

This workpiece captures:
- The scheduling objectives: testing family batching decisions, idle-versus-washdown trade-offs, and recovery from line failures while meeting weekly due dates.
- The process spine for order fulfillment: allocation → wait → changeover (if needed) → production (mix, mill, tint/letdown, fill/pack) → QA hold → ship.
- Family-based changeover time structure with some durations.
- Line failure behavior: short stoppages resume; long stoppages may degrade batches; reallocation occurs when lines fail.
- Qualitative resource contention (lines, changeover crew, QA lab) and operational policies (family grouping, gut-based idle decisions).

### Consequential gaps

The workpiece does **not** yet support quantitative simulation or decision analysis due to:

- **Missing production rates:** No line rates or fill-up times; cannot calculate run durations beyond the single 500-gallon Line 2 example.
- **Incomplete changeover matrix:** Specialty family transition directions not fully specified.
- **Unknown breakdown behavior:** Breakdown frequency and duration remain ranges or single anecdotes, not distributions.
- **Unspecified QA capacity:** QA hold time drivers (queue versus test) and capacity model unknown.
- **Missing calendar and availability data:** Shifts, operating hours, crew availability not established.
- **No late-delivery cost model:** Cannot evaluate trade-offs without knowing consequence of missing due dates.
- **Unknown validation criteria:** What observation or historical match would make the model credible for its intended use.

### Net status

**Construction not attempted.** Interview stopped before completing elicitation. No Petri net has been constructed or validated.
