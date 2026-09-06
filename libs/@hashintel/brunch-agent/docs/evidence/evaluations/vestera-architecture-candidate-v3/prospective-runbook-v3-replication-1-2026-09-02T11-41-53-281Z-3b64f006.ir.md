# Coatings Plant Production Scheduling Model

## Model Purpose and Objectives

**Primary simulation questions:**
- Are orders getting out on time?
- How many changeover hours are being consumed?
- Is there a smarter sequence that reduces changeover time?
- What is the best reshuffle when Line 2 goes down?

**Intended decision support:**
- Test scheduling decisions before making them in production
- Evaluate trade-off: hold line idle waiting for same product-family order vs. wash down and run next order
- Pre-plan responses to Line 2 filler failures

**Success measures:**
- On-time delivery (especially Meridian customer - risk of fines and delisting if late)
- Changeover hours (boss wants these reduced to recover capacity)
- Ability to recover lost time through better sequencing

**Audience:** Master scheduler and management

## Process Boundary and Triggers

**Boundary:**
- Starts: Monday morning ~8 AM when demand book drops from ERP
- Ends: Orders ship after QA clearance (typically by Friday, sometimes slips to Monday)
- Inside boundary: Scheduling, line allocation, production execution, QA hold, shipping
- Outside boundary: ERP demand generation, materials supply (mentioned as occasionally short, not detailed)

**Trigger:** 
- Weekly demand book arrives Monday ~8 AM
- Spreadsheet with 40-60 orders per week (can reach 60 when busy)
- Each order: SKU, quantity, due date

**Horizon:** One-week planning cycle (Monday-Friday)

## Product Families and Distinctions

**Product families** (operation treats these differently due to changeover costs):
- **Whites** — high volume
- **Tinted colors** — moderate volume
- **Specialty clears** — handful per week

**Operational distinction:** Switching between families is expensive; scheduler groups by family when possible.

## Resources: Production Lines

### Line 1
- **Description:** Old workhorse
- **Speed:** Slower (baseline)
- **Qualification:** Everything — all whites, all tints, all specialty clears
- **Availability:** Two shifts normally
- **Notes:** Reliable; tiny holding tank between mill and fill (backs things up)

### Line 2
- **Description:** Fast line
- **Speed:** About 2x Line 1 speed on whites ("that's where you really see it")
- **Qualification:** Whites and tints only; cannot run specialty clears (never piped for specialty resins)
- **Availability:** Two shifts normally
- **Special constraints:** Meridian whites MUST run on Line 2 (customer audited this line years ago)
- **Reliability issue:** Filler jams every week or two
- **Notes:** Better holding tank between mill and fill than Line 1

### Line 3
- **Description:** Newest line
- **Speed:** Between Line 1 and Line 2, closer to Line 2's speed
- **Qualification:** Being qualified product-by-product; can run most whites, some tints (some tint SKUs not yet signed off), and specialties (qualified more recently)
- **Availability:** Day shift only unless overtime approved
- **Notes:** Still expanding qualification list

**NOT YET ASKED:** Specific list of which SKUs are qualified on Line 3.

## Process Spine: One Order From Demand Book to Ship

**Source case:** Meridian order VW-01 (high-volume interior white), 800 units, due Friday

### 1. Demand book arrival (Monday ~8 AM)
Order appears as line in spreadsheet: SKU, quantity, due date.

### 2. Scheduler builds allocation sheet
- **Activity:** Match orders to lines, sequence them
- **Performer:** Master scheduler
- **Approach:** Group orders by product family when possible (minimize expensive family-switches)
- **Constraints applied:**
  - Meridian whites → Line 2 (mandatory)
  - Specialty clears → Line 1 or Line 3 only
  - Line 3 → only if SKU qualified and capacity available
- **Time estimation:** Quantity ÷ rate + fill-up time + changeover time
- **Check:** Does it all fit in the week?

**NOT YET ASKED:** Specific rates (units/hour) by product-line combination. Scheduler has these "in my head — or in the sheet." Fill-up times by line or product.

### 3. Daily floor huddle (every morning 7:30 AM)
- **Participants:** Scheduler, line leads, maintenance, QA
- **Topics:** What finished overnight, what's running now, any problems
- **Activity:** Scheduler adjusts schedule on the fly (line jams, batch QA holds, materials slip)
- **Execution:** Verbal adjustments, people go execute

### 4. Order waits for sequenced slot
**Example:** VW-01 slotted for Tuesday afternoon, after another white finishes on Line 2.

### 5. Changeover
**Example case (white-to-white on Line 2):** Quick rinse, 20-30 minutes. Crew cleans residual from last batch, flushes system.

**Known changeover times:**
- White → white: 20-30 minutes (quick rinse)
- White → tint: ~45 minutes
- Tint → white: 3 hours (full washdown; pigment carryover ruins white batch)

**NOT YET ASKED:**
- Tint → tint changeover time
- Specialty clear changeover times (to/from whites, tints, other clears)
- Whether changeover times vary by line

**Ramp scrap:** First few units after any changeover don't meet spec (residual from rinse, concentrations stabilizing). Scrapped or reworked. Worse after big washdowns (tint → white). "Not so bad" after quick rinse.

**NOT YET ASKED:** Scrap quantities by changeover type. Quality tracks scrap as monthly percentage; scheduler does not have per-changeover figures.

### 6. Production run
**Stages (in sequence):**
1. **Mix:** Blend base resin with additives in mix tank
2. **Mill:** Grind to particle size
3. **Tint and letdown:** For whites, mostly thinning to spec (no pigment)
4. **Fill and pack:** Into cans, labeled, palletized

**Holding tanks:** Between stages. Mill can keep feeding while fill catches up or vice versa. Line 2 tank (between mill and fill) is better than Line 1's tiny tank.

**NOT YET ASKED:** Holding tank capacities, whether they constrain throughput.

**Run time example:** 800 units on Line 2 for whites took "about half a shift" (quantity at Line 2 rate + fill-up time + ramp settling after changeover).

**NOT YET ASKED:** Hours per shift. Specific production rates.

### 7. QA hold
- **Duration:** ~4 hours for whites; sometimes full day for specialty
- **Activity:** Lab pulls samples, runs tests
- **Resource:** 2-person lab
- **Congestion:** Backs up end of week

**NOT YET ASKED:** QA failure rate, what happens when batch fails QA (mentioned "adjust and retest" as occasional issue).

### 8. Ship
Once QA clears, order ships.

**Example timeline:** Run Tuesday afternoon, finish Tuesday night, clear QA Wednesday morning, ship Wednesday (well ahead of Friday due date).

**Reality qualifier (from scheduler):** "That's the clean version. Reality is messier — filler on Line 2 jams every week or two, materials occasionally short, QA finds something off and we have to adjust and retest."

## Disruptions and Recovery

### Line 2 filler jam (occurs every week or two)

**Last occurrence (2-3 weeks ago):**
- Line 2 mid-run on VW-03 (contractor-grade flat white), filler jammed ~6 AM
- Cause: Bag broke in hopper, made a mess, whole thing locked up
- Maintenance estimate at huddle: "at least a couple hours"
- Actual duration: "more like half a shift"

**Three options when line goes down mid-run:**

1. **Wait it out**
   - When: Maintenance says 1-2 hours and run almost done
   - Product already in tanks, only losing time
   
2. **Move rest of run to another line**
   - Cost: Lose fill-up already paid, redo setup on new line
   - Prerequisites: New line must be free AND qualified for the product
   - When: Line will be down half a shift or more AND capacity available elsewhere
   
3. **Scrap in-progress, restart whole run later**
   - When: Almost never; only if batch already off-spec or line down for days
   - Reason: Too wasteful

**Decision factors (scheduler's account):**
- Maintenance time estimate
- Availability of another qualified line
- Whether moving would "screw up something more urgent"
- "Gut feel"
- If Meridian order with tight due date → more aggressive about moving
- If small distributor order that can slip a few days → wait

**NOT YET ASKED:**
- Frequency distribution of Line 2 jams
- Duration distribution of Line 2 downtime
- Frequency and nature of "materials occasionally short"
- What happens to work already in holding tanks when line stops mid-run

### Other disruptions mentioned but not detailed:
- Batch fails QA hold → adjust and retest (frequency and impact not asked)
- Materials slip (frequency, which materials, advance warning not asked)

## Scheduling Constraints and Policies

### Hard constraints (from scheduler account):
- Meridian whites MUST go on Line 2 (customer requirement, audited that line)
- Specialty clears can ONLY go on Lines 1 or 3 (Line 2 not piped for specialty resins)
- Line 3 SKU-by-SKU qualification (some tints not yet signed off)

### Practiced policies:
- Group orders by product family when possible (minimize changeover cost)
- Prefer white-to-white sequences over white-tint-white (avoid 3-hour washdown)
- When contention exists: Meridian orders get priority (due to penalty/delisting risk)

### Trade-off under uncertainty (scheduler's stated dilemma):
- If Line 2 finishing a white and another white order "coming in a couple hours," hold line idle vs. wash down to tint?
- Scheduler "thinks waiting sometimes makes sense" but cannot prove it
- Boss wants fewer changeover hours

**NOT YET ASKED:**
- How "couple hours" or other wait-time thresholds factor into practiced decision
- Whether orders actually arrive during the week or all appear Monday in demand book
- Whether partial orders or rush orders ever interrupt the plan

## Quantities, Rates, Time

**Known:**
- Demand book: 40-60 orders/week
- Example order: 800 units
- Line 2 speed: ~2x Line 1 on whites
- Line 3 speed: between L1 and L2, closer to L2
- Line 2 on 800-unit white: "about half a shift"
- Changeover times: see Process Spine section 5
- QA hold: ~4 hours whites, up to full day specialty
- Shifts: Lines 1 and 2 run two shifts; Line 3 day shift only (unless overtime)

**NOT YET ASKED:**
- Specific units/hour rates by product-line combination
- Hours per shift
- Fill-up time by line or product
- Ramp scrap quantities
- Distribution of order sizes
- Distribution of due dates within the week
- Product family distribution (what % of weekly demand is whites vs. tints vs. specialty)
- Whether batches have minimum or maximum sizes
- Line 2 jam frequency (every week or two → distribution?)
- Line 2 downtime duration (couple hours to half shift → distribution?)

## Initial Conditions and State

**NOT YET ASKED:**
- What state are lines in at Monday 8 AM when demand book arrives? (Clean? Mid-run? Last product family run?)
- Are there any orders in progress or in QA hold from prior week?
- Initial inventory or work-in-process?

## Validation and Evidence Sources

**Validation intent (from scheduler):**
- Model should show on-time delivery performance
- Model should count changeover hours
- Model should allow testing alternative sequences
- Model should support pre-planning reshuffles when Line 2 fails

**NOT YET ASKED:**
- What observation, replay, or comparison would make the model credible enough to use?
- What historical data is available (past demand books, actual run logs, changeover records, downtime logs)?
- Are actual rates, changeover times, QA hold times recorded somewhere, or only in scheduler's head/sheet?

## Open Questions and Unresolved Material

### Critical for construction but not yet asked:
1. Specific production rates (units/hour) for product-line combinations
2. Changeover times: tint-to-tint, all specialty combinations, whether times vary by line
3. Fill-up times
4. Ramp scrap quantities by changeover type
5. Hours per shift
6. Line 3 SKU qualification details
7. Initial state at start of simulation week
8. Whether orders can be split across lines or must run whole on one line
9. Holding tank capacities and constraints
10. Frequency distributions: Line 2 jams, downtime durations, QA failures, materials shortages
11. Due date distribution in demand book
12. Product family distribution in demand book
13. Validation: what would make model credible, what historical data exists

### Consequential unknowns flagged by scheduler:
- Exact scrap per changeover type (Quality has monthly %, scheduler doesn't have detail)
- Exact rates (scheduler has them "in my head — or in the sheet" but not stated in interview)

### Deliberate simplifications or omissions:
- None explicitly proposed yet

### Assumptions:
- None explicitly introduced yet

### Conflicts or corrections:
- None yet

### Contextual variations noted but not fully explored:
- Line 2 downtime: "couple hours" vs. "more like half a shift" (context: initial estimate vs. actual)
- QA hold: "about 4 hours" for whites, "sometimes full day" for specialty, "backs up end of week" (context-dependent duration)
- Scheduler's practiced policy varies by customer urgency and due date pressure

## Target Representation Notes

**Target formalism:** Petri-net-style process model (specific format not known to scheduler; "I'm not the modelling person")

**Construction not yet attempted.** No Petrinaut tools invoked. No net elements defined.

**When construction begins, will need to infer:**
- How to represent line eligibility constraints
- How to represent scheduler's practiced priority rules under contention
- How to represent three-option recovery logic when Line 2 fails
- How to represent holding tanks and multi-stage production flow
- Whether to model individual units, batches, or orders as tokens
- How to represent ramp scrap and QA hold
- How to represent calendar (shift boundaries, day shift only for Line 3, week boundary)

**Consequential gaps that block faithful construction:**
- Missing rates prevent accurate time modeling
- Missing changeover time matrix prevents accurate sequencing cost
- Missing failure/disruption frequency distributions prevent realistic stochastic behavior
- Missing initial state prevents simulation start
- Missing validation criteria prevent assessing whether constructed model is fit for purpose
