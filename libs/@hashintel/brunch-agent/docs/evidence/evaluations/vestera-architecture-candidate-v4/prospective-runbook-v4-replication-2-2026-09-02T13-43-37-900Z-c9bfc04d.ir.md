# Coatings Plant Production Scheduling Model

**Document Status:** Partial elicitation, interview stopped at turn budget exhaustion. Many operational details remain unresolved.

**Source:** Master scheduler interview, 2026-09-02

**Authorship Note:** All operational facts are from the scheduler unless marked [AGENT INFERENCE] or [ASSUMPTION]. Quantities and durations preserve the precision the scheduler used.

---

## Purpose and Objectives

### Primary Question
Whether it's worth holding a line idle when a same-family order is coming next, instead of loading whatever's available and paying for washdown later.

Current practice: Scheduler makes this decision by judgment 3–4 times per week. Cannot prove it saves anything. When ops director sees "Line 2: idle" on the board, scheduler gets questions.

### Secondary Question
Breakdown recovery: If a line goes down (e.g., filler jam, mill trip) at 6am, what's the least-bad reshuffle? What moves to another line, what can wait, what's about to make the operation late to a customer (e.g., Meridian)?

Occurs approximately once per week.

### Audience and Use
- For: The scheduler and their boss (ops director implied)
- Decision: Whether idle-holding practice saves money; which reshuffles are least-bad during disruptions
- Validation criterion: **NOT YET ASKED** — what observable behavior or comparison would make the model credible for this decision

---

## Boundary, Triggers, and Initial Conditions

### Demand Input
- Demand book drops from ERP every Monday morning
- Contains the week's committed customer orders with due dates
- Once in the book, the order has a due date and the scheduler owns hitting it
- Changes rare: happens maybe a couple times a month, usually pushing due dates out (not pulling in)
- Commercial sometimes gives advance heads-up (e.g., "Meridian placing Friday, you'll see it Monday"), but officially orders become real and schedulable Monday morning

**NOT YET ASKED:**
- What happens to orders that arrive mid-week or don't fit in the current week
- Whether demand is continuous or only the Monday drop
- Initial backlog or work-in-progress state at model start
- Typical weekly order volume, mix, size distribution

### Boundary
**PARTIALLY ESTABLISHED:**
- Inside: Three production lines (Line 1, Line 2, Line 3), changeover decisions, scheduling allocation, breakdowns
- Outside: ERP system, customer due dates, commercial order changes

**NOT YET ASKED:**
- Raw material supply and constraints
- Finished goods shipping and storage
- Maintenance as external or internal
- QA as gate or observation
- Packaging, palletizing, warehousing

---

## Resources

### Production Lines

**Line 1:**
- Slower than Line 2 [no rate given]
- **NOT YET ASKED:** Qualified product families, capacity, crew, failure modes

**Line 2:**
- Runs whites at approximately 45 units per hour
- Has a filler that jams every week or two (duration: half an hour if lucky, up to half a shift if something's really stuck or waiting on maintenance)
- **NOT YET ASKED:** Rates for other families, crew, other failure modes

**Line 3:**
- Not qualified for **[UNRESOLVED — answer cut off mid-sentence]**
- **NOT YET ASKED:** What it IS qualified for, rates, crew, failure modes

**NOT YET ASKED:**
- How many lines can be staffed simultaneously
- Shift patterns, crew size, cross-training
- Whether lines are interchangeable for a given product family
- Setup or startup requirements
- Concurrent operation constraints

---

## Products and Families

### Known Product Families and SKUs

**White Family:**
- VW-01: volume white, purchased by Meridian "by the truckload"
- VW-03: white, different sheen than VW-01 but same family

**Tint Family:**
- TC-08: tint product, example order was approximately 4 pallets

**NOT YET ASKED:**
- Complete family taxonomy
- What determines family membership (base chemistry, color range, sheen, other?)
- Other families (specialty mentioned once in passing)
- How many SKUs exist
- Typical order sizes by family or SKU
- Unit definitions (gallons? cases? pallets?)

---

## Activities and Process Flow

### Scheduling and Allocation (Monday)

**Performed by:** Scheduler

**Inputs:**
- Demand book (from ERP)

**Process:**
1. Pull demand book into Excel allocation sheet
2. Allocation sheet has columns for each line, rows for each order
3. Calculate for each order: SKU, quantity, divide by line rate, add changeover time
4. Stack assignments against due dates ("Tetris-ing")
5. Pencil in each order to a line and time slot

**Example calculation (VW-03):**
- 280 units
- Line 2 rate for whites ≈ 45 units/hour
- Run time = 6–7 hours
- Plus rinse time (following another white)
- Fits in a shift, due Wednesday, penciled in for Tuesday

**NOT YET ASKED:**
- Constraints applied during allocation (line qualifications, material availability, crew, other)
- How ties are broken
- Whether allocation is revised during the week
- What happens if an order doesn't fit

### Daily Huddle and Execution (e.g., Tuesday 07:30)

**Participants:** Scheduler, line leads, changeover crew, sometimes QA (if they need to flag something)

**Process:**
1. Scheduler walks through the day's plan for each line
   - Example: "Line 2, you're finishing VW-01 this morning, then we're loading VW-03 after the rinse. Line 1, you're wrapping the specialty, then we've got a tint coming..."
2. Crew preps materials
3. Changeover team stages what they need
4. When line is ready, they call it
5. Load the batch, mill starts, production begins

**NOT YET ASKED:**
- What "ready" means (criteria, checks)
- Material prep and staging detail
- Batch loading mechanics
- QA's role and gates
- How line leads communicate status
- End-of-run signaling

### Production Run

**PARTIALLY ESTABLISHED (from VW-03 example):**
- Duration depends on quantity and line rate
- VW-03: 280 units at ~45 units/hour = 6–7 hours

**NOT YET ASKED:**
- Whether runs can be interrupted, split, or paused
- Yield, scrap, rework
- In-process failures distinct from equipment breakdowns
- Quality checks during run
- What happens to output (staging, immediate shipping, warehousing)

---

## Changeovers

### White-to-White (Same Family, Different Sheen)

**Example:** VW-01 → VW-03 on Line 2

**Duration:** Approximately 20 minutes for a rinse

**Activities:** Rinse [detail not yet asked]

**Resources:** Changeover crew [NOT YET ASKED: size, duration of occupation]

### Tint-to-White (Different Families)

**Example:** TC-08 → white on Line 2 (hypothetical)

**Duration:** 3 hours for full washdown

**Additional consequence:** Scrap the first units while the line settles [settling duration and scrap quantity NOT YET ASKED]

**Activities:** Full washdown [detail not yet asked]

**Resources:** Changeover crew [NOT YET ASKED: size, duration of occupation]

### Other Changeover Types

**NOT YET ASKED:**
- White-to-tint duration and consequences
- Tint-to-tint (same family?)
- Within-tint-family changes
- Specialty family changeovers (mentioned once in passing context)
- Other families and their changeover matrix
- Whether direction matters (A→B vs B→A)
- Setup for first run of day or after idle period

---

## Disruptions and Recovery

### Line Down Events

**Frequency:** Approximately once per week

**Example causes:**
- Filler jams (Line 2 filler jams every week or two)
- Mill trips
- Other causes **NOT YET ASKED**

**Example timing:** "at six in the morning" (start of shift?)

**Duration:**
- Filler jam: half an hour if lucky, up to half a shift if something's really stuck or waiting on maintenance
- Other failures: **NOT YET ASKED**

### Recovery Decision (Partially Described, Then Cut Off)

When a line goes down, scheduler at the huddle is "scrambling" to figure out:

**Options (INCOMPLETE — answer interrupted):**
1. Push everything on the affected line back a few hours and hope nothing goes late
2. Pull something off the affected line and move it to Line 1 or Line 3
   - Line 1 is slower [impact NOT YET ASKED]
   - Line 3 isn't qualified for **[UNRESOLVED — cut off mid-sentence]**

**NOT YET ASKED:**
- Complete decision criteria
- What "about to make us late to Meridian" threshold means
- How line-down state is detected and communicated
- Repair/resume process
- Whether partially completed runs can move
- Costs of different recovery options
- Practiced priority rules
- Whether late deliveries have penalties or relationship consequences

---

## Holding Decision (Concrete Example: Last Week)

### Situation
- **Line:** Line 2
- **Time:** Last week, approximately 2 hours left in the shift
- **Just finished:** VW-01 (big run)
- **Visible in demand book:** VW-03 (white family, different sheen, same family as VW-01), due Wednesday, penciled for Tuesday next morning, "pretty good size" [exact quantity: 280 units]
- **Available alternative work:** TC-08 (tint order, approximately 4 pallets)

### Trade-off Recognized
- Load TC-08 now: requires tint-to-white washdown next morning (3 hours + scrap during settling) before VW-03
- Hold Line 2 idle: no washdown, only 20-minute rinse before VW-03

### Decision Made
- Held Line 2 idle
- Sent crew to help Line 1 with packaging backup (kept crew productive elsewhere)
- Kept the line clean

### Outcome
- Next morning: loaded VW-03, 20-minute rinse, up and running
- TC-08 ran two days later anyway (so no lost throughput for that order)
- **Savings NOT QUANTIFIED** — scheduler believes it probably saved money but cannot show it on a spreadsheet

### Decision Frequency
- This kind of call happens 3–4 times per week
- Scheduler second-guesses self about half the time

**NOT YET ASKED:**
- What factors make holding more or less attractive (time gap, order size, customer priority, backlog pressure, other)
- Whether crew can always be redeployed productively during idle holds
- Cost structure: crew idle cost vs washdown cost vs scrap cost
- Whether holding ever caused a late delivery
- Ops director's actual concern (utilization target? cost visibility? other?)

---

## Time and Calendar

### Known Time References
- Demand book: drops every Monday morning
- Daily huddle: 07:30 (assumed local time, likely start of day shift)
- Shift duration: **NOT YET ESTABLISHED** (VW-03 "fits in a shift" at 6–7 hours suggests shifts longer than 8 hours, or flexible, or context missing)
- "Six in the morning": example disruption time

**NOT YET ASKED:**
- Shift schedule (number of shifts per day, days per week, hours per shift)
- Breaks, handovers, start/stop times
- Weekend operation
- Maintenance windows
- Calendar effects on line rates or availability
- Lead time from order receipt to due date (typical, minimum, maximum)

---

## Open Questions and Unresolved Items

### Immediate Gaps (Mid-Sentence Interruptions)
1. Line 3 isn't qualified for **[WHAT?]** — answer cut off
2. When filler jams, moving work to Line 1 or Line 3 has complications: Line 1 slower, Line 3 qualification issue — **full decision logic incomplete**

### Process Structure
- Complete activity sequence from order receipt to delivery
- What happens at end of run (signaling, QA, staging, shipping)
- Material flow and preparation
- Quality gates and inspection
- Batch definitions and constraints
- Packaging and palletizing as separate or integrated

### Resources and Capacity
- Line rates for all families on all lines
- Line qualifications (which families on which lines)
- Crew size, shifts, cross-training, redeployment flexibility
- Changeover crew size and availability
- Maintenance as resource or external
- Material and storage constraints

### Product and Changeover Details
- Complete family taxonomy
- Full changeover matrix (all family-to-family combinations, durations, scrap)
- Whether changeover direction matters
- Settling time and scrap quantities
- Unit definitions and typical order sizes

### Disruption and Recovery
- All failure modes, frequencies, and durations
- Complete recovery decision logic
- Work-in-progress salvage or loss
- Late delivery consequences
- Practiced priorities and overrides

### Cost and Validation
- Cost structure (idle crew, washdown materials/time, scrap, late penalties)
- What "better" means quantitatively
- What observable behavior would validate the model
- Historical data availability

---

## Assumptions, Inferences, and Limitations

### Assumptions
None yet introduced by agent.

### Agent Inferences
- [AGENT INFERENCE] "Fits in a shift" for 6–7 hour run suggests shift length ≥8 hours, but not confirmed
- [AGENT INFERENCE] "Crew to help Line 1 with packaging backup" suggests packaging is labor-intensive and lines may share crew, but redeployment rules not established

### Known Limitations
- Interview stopped mid-answer; Line 3 qualification and full recovery logic incomplete
- No validation criteria established
- No cost structure elicited
- Only one concrete holding example; variation across cases not explored
- Breakdown recovery described in outline only; no concrete case walked through
- No discussion of what happens if model recommendation conflicts with scheduler's judgment

---

## Evidence Quality

- **Concrete case (VW-01 → idle → VW-03):** High — scheduler recalls specific line, products, timing, trade-off, and outcome
- **Demand book process:** Medium — described as regular practice, not walked as specific case
- **Changeover durations:** Medium — "approximately 20 minutes," "3 hours" are rounded; tail or variation not discussed
- **Line rates:** Low — "maybe 45 units an hour" is approximate and only one family-line combination
- **Failure frequencies:** Low — "every week or two," "once a week," "couple times a month" are rough recalls, not data-driven
- **Recovery decisions:** Very Low — described in outline mid-answer, no concrete case
- **Costs and savings:** None — scheduler explicitly cannot quantify

---

## Next Steps if Interview Resumes

### Smallest Consequential Gaps (in rough priority order)
1. **Complete the Line 3 qualification statement** — affects recovery options
2. **Complete the recovery decision logic** — secondary objective depends on it
3. **Establish validation criteria** — what would make model credible for the holding decision
4. **Walk one concrete breakdown-recovery case** — expose practiced decision structure
5. **Sweep changeover matrix** — which family transitions exist, durations, costs
6. **Establish line qualifications** — which families run on which lines
7. **Clarify cost structure** — what makes one decision "better" than another quantitatively
8. **Explore holding-decision variation** — what makes holding more/less attractive across cases

---

**End of Workpiece**

*This document represents the recoverable operational account as of interview stop. Construction of an SDCPN was not attempted. Many operational details required for faithful construction remain unresolved.*
