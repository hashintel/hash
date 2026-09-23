# Runbook IR

## Purpose and outcome

### What the model must answer
Can the master scheduler justify holding a line idle to avoid a later washdown? When a line goes down mid-week, what is the least-disruptive reshuffle to keep Meridian orders on time?

### Who it is for
Master scheduler at a coatings plant. Boss cares about late orders (especially Meridian) and changeover hours. Weekly demand book, three filling lines, one changeover crew.

### What it must not claim
Cannot predict the "correct" schedule in absolute terms. Cannot model QA rejection rates or line breakdown rates with precision. Cannot represent unwritten commercial penalty structures.

## Posture

### Appetite, time, and accuracy
Expert wants a decision-support tool, not a predictive forecast. Willing to accept assumptions for unknown durations. Wants to test "what-if" scenarios (hold vs. switch, line-down replanning).

### Boundary and horizon
Scope: three filling lines (mix, mill, tint/letdown, fill-pack stages abstracted as single run time per order) and one changeover crew (family-switch washdowns). One-week horizon, Monday morning to Friday evening. Outside boundary: raw material supply, QA hold after production (noted as delay but not modeled as constraint), final shipping logistics.

## Goals, constraints, measures, and thresholds

**Primary goal:** No late shipments to Meridian (retail chain). Meridian will fine and delist for late delivery.

**Secondary goals:** Minimize changeover hours (boss monitors this). Maximize utilization (mentioned but less emphasized than on-time and changeover costs).

**Constraints:**
- Meridian white orders MUST run on Line 2 (audited, approved).
- VW-02 (retail gloss white) CANNOT run immediately after dark tint, even post-washdown (2023 QA contamination scare, unwritten rule). Must run another white first, or run VW-02 after light tint, or wait.
- Line 2 physically cannot run specialty products (not piped for clear resins).
- Line 3 not yet qualified for CT-12, CT-14 tint SKUs (must run on Line 1 or 2).
- Family-switch washdowns require changeover crew, available day shift only (6 AM–2 PM).

**Thresholds:**
- Meridian late = unacceptable.
- Other key distributors: can negotiate 1–2 day slip with grumbling.
- Small accounts: slide a week, "nobody notices" (no formal penalty data).

## Process boundary, triggers, and prerequisites

**Trigger:** Monday morning, demand book arrives with 30–60 orders (typically 40–50). Each order: product SKU, quantity, due date within that week.

**Prerequisites:** Lines assumed available and clean at Monday 6 AM start (or in a known family state if carryover from prior week). Changeover crew available day shift. No explicit raw material constraint mentioned.

**End state:** Orders completed, passed QA hold (4 hours standard, up to 1 day for specialty), ready to ship by their due date.

## Participants, locations, and resources

**Lines:**
- **Line 1 (old workhorse):** Qualified for all 14 SKUs (whites, tints, specialty). Runs day shift (6 AM–2 PM) and evening shift (2 PM–10 PM). Slowest. Speed: ~2x slower than Line 2 for whites; similar speed to Line 2 for tints; very slow for specialty (mill stage "crawls").
- **Line 2 (fast line):** Qualified for whites and tints only. Cannot run specialty. Runs day + evening. Meridian-approved for whites. Speed: fastest for whites (~2x Line 1), similar to Line 1 for tints.
- **Line 3 (newest):** Qualified for whites, most tints, most specialty. NOT qualified for CT-12, CT-14 (tint SKUs). Runs day shift only unless overtime approved (rare, people grumble). Speed: **Not yet asked** — assumed between Line 1 and Line 2.

**Changeover crew:**
- Two techs, day shift only (6 AM–2 PM).
- Handle all family-switch washdowns across all three lines.
- One crew shared; if two lines need washdowns simultaneously, one waits.
- Line operators can perform quick rinses within same family (20–30 min).

**Product families:**
- Whites: ~60% of order count, ~75% of unit volume. High-volume. ~14 SKUs total across all families.
- Tints: ~30% of orders.
- Specialty: handful per week, small batches (max ~200 units), high margin, fussy.

**Key customer:** Meridian (big retail chain). Other customers: key distributors (flexible), small accounts (very flexible).

## Activities, inputs, outputs, and resource usage

**Order execution on a line (abstracted):**
Each order goes through: mix → mill → tint/letdown → fill/pack. Modeled as a single "run" duration that varies by line, product family, and order size.

**Inputs:**
- An order (product SKU, quantity, due date).
- A line in the appropriate family state (or willing to pay washdown cost).
- Line crew (one per line, assumed always available on their shift).
- Changeover crew if family switch required.

**Outputs:**
- Completed batch, moves to QA hold (4 hours standard, up to 1 day specialty).
- Ramp scrap after family switches (**Unknown quantity** — quality tracks monthly %, not per-changeover).

**Resource usage:**
- Line reserved for duration of run.
- Changeover crew reserved for duration of family-switch washdown (if applicable).

## Flow, branching, retries, failures, and recovery

**Typical flow:**
1. Monday morning: demand book received, orders assigned to lines and sequenced.
2. Line runs order (duration depends on line, product, quantity).
3. If next order is different family, washdown required (if changeover crew available and it's day shift).
4. Line continues to next order.
5. Completed batches enter QA hold (mostly a time delay, rare rejection ~1/quarter).

**Branching:**
- Same-family transition: quick rinse (20–30 min, line operators).
- Family switch: depends on direction and changeover crew availability.
  - White → tint: 45 min (changeover crew, day shift).
  - Tint → white: 3 hours (changeover crew, day shift).
  - Specialty in/out: 2 hours (changeover crew, day shift).
- If family switch needed on evening shift, line waits until changeover crew arrives next morning (6 AM).

**Retries/failures:**
- QA rejection: ~1/quarter, batch must be rerun. Rate too low to model stochastically; could be scenario.
- Line breakdown: mentioned as a scenario concern (Line 2 down = panic, squeeze Meridian order onto Line 1, blow out schedule). **Not yet asked** for breakdown frequency or duration.

**VW-02 special case:**
After dark tint, VW-02 cannot run even after washdown. Must run a different white first, or run VW-02 after light tint instead. (**Not yet asked:** which tints are "dark" vs. "light"?)

## Time, quantities, and stochastic behavior

**Run times (order processing on line):**
- 800-unit white on Line 2: 4–6 hours (line time, excludes washdown before).
- Line 2 is ~2x faster than Line 1 for whites.
- Tints: similar speed on Line 1 and Line 2 (**Not yet asked** for exact times).
- Specialty: slow everywhere, especially Line 1 mill stage. "Half a shift" (~4 hours?) for small specialty batch on Line 1 (**Not yet asked** for Line 3 specialty speed).
- **Not yet asked:** Does run time scale linearly with units, or is there fixed setup time?
- **Not yet asked:** Specific run time per unit or per order size for each line × family combination.

**Washdown times:**
- Same family (quick rinse): 20–30 min (line operators, any shift).
- White → tint: 45 min (changeover crew, day shift only).
- Tint → white: 3 hours (changeover crew, day shift only).
- Specialty in/out either direction: ~2 hours (changeover crew, day shift only).
- Ramp scrap: worse after big washdowns, **Unknown** exact quantity (quality would need to pull data).

**QA hold:**
- Standard products: 4 hours.
- Specialty: up to 1 day.
- Rejection rate: ~1/quarter (rare, not modeled stochastically).

**Order arrival:**
- Demand book: 30–60 orders/week, typically 40–50.
- Order sizes: typical 300–500 units, small <200, large 700–1200. Specialty always small (~200 max).
- Due dates: scattered through week (some Tue, many Wed/Thu, some Fri). Usually clean Monday start, occasionally carryover from prior week.

**Shift availability:**
- Lines 1 & 2: day (6 AM–2 PM) + evening (2 PM–10 PM) = 16 hours/day.
- Line 3: day only (8 hours/day) unless overtime approved (rare).
- Changeover crew: day only (6 AM–2 PM) = 8 hours/day, shared across all lines.

## Policies, exceptions, and practiced rules

**Line assignment rules:**
- Meridian whites → Line 2 (mandatory, audited/approved).
- Specialty → Line 1 or Line 3 (Line 2 cannot run specialty).
- CT-12, CT-14 tints → Line 1 or Line 2 (Line 3 not qualified).
- High-volume whites → Line 2 preferred (faster).
- Otherwise: scheduler discretion based on line availability, due dates, washdown costs.

**Sequencing rules:**
- Meridian orders prioritized early in week to avoid risk.
- **Not yet asked:** Detailed sequencing logic (due date, order size, family grouping, idle-hold decisions).

**Unwritten rules:**
- VW-02 cannot follow dark tint (2023 QA scare). Everyone knows, not documented.
- Small accounts slide without penalty (no formal data).
- Key distributors will accept 1–2 day slip if negotiated.

**Changeover crew contention:**
- If two lines need family-switch washdown simultaneously, one waits.
- "Supposed to be fine" but Tuesday backlogs have occurred (Line 3 idle waiting for crew).

**Evening shift family switches:**
- Practically must wait for changeover crew next morning.
- Scheduler sometimes times orders to land washdown at 6 AM shift start.

## Validation criteria

Expert would consider the model useful if:
- It can compare "hold Line 2 idle 1 hour to avoid 3-hour washdown later" vs. "switch now and pay washdown twice."
- It can simulate a Line 2 breakdown mid-week and show least-disruptive reshuffle to keep Meridian on time.
- Outputs show: late orders (especially Meridian), total changeover hours, utilization.

Expert does *not* expect the model to predict actual schedule performance (too many real-time variables). Wants decision support for "what-if" scenarios.

## Situation notes

### Changeover crew as bottleneck
#### Notice when
One crew, day shift only, shared across three lines. Family switches can only happen 6 AM–2 PM. Evening shift must wait or stay in-family.

#### What we know
- Two techs, 6 AM–2 PM.
- If two lines need washdown at once, one waits (expert has seen Line 3 idle waiting for crew on Tuesdays).
- Family switches on evening shift practically don't happen unless emergency overtime.

#### Open questions
- **Not yet asked:** Is there a practiced priority rule when two lines need crew simultaneously? (e.g., Meridian line wins?)
- **Not yet asked:** Can overtime be modeled, or always assume no evening changeovers?

#### Record for construction
Contended resource: one changeover crew token, reserved during family-switch washdowns, released after. Guard: crew only available during day shift (6 AM–2 PM). If needed outside day shift, work waits until next day shift start.

### VW-02 dark tint restriction
#### Notice when
VW-02 (retail gloss white) cannot run immediately after dark tint, even after washdown.

#### What we know
- Unwritten rule from 2023 QA contamination scare.
- Workarounds: run another white first, or run VW-02 after light tint, or wait/resequence.

#### Open questions
- **Not yet asked:** Which tints are "dark" vs. "light"? All tints, or specific SKUs?
- **Not yet asked:** Does this apply to other whites, or only VW-02?

#### Record for construction
Guard or constraint: if line's prior order was dark tint AND next order is VW-02, block until another white runs or line state changes. **Loss:** "dark tint" definition not provided; may need to treat all tints as dark (conservative) or parameterize.

### Idle-hold decision
#### Notice when
Expert mentioned holding Line 2 idle ~1 hour to wait for a second white order, avoiding a 3-hour tint-to-white washdown.

#### What we know
- Happened a couple weeks ago: Line 2 finished white, next order was tint, but another white was 3–4 hours away if they ran the tint.
- Held idle 1 hour, ran second white, bumped tint to Line 3.
- Decision was "gut feel," not calculated. Expert wants model to validate this.

#### Open questions
- **Not yet asked:** How does scheduler know another order is "3–4 hours away"? Is there a look-ahead window, or is the full week's sequence known in advance?
- **Not yet asked:** What's the threshold? 1-hour idle to save 3-hour washdown = obvious win. What about 2 hours idle to save 3 hours? Where's the breakeven?

#### Record for construction
**Omitted from first net:** Idle-hold logic requires look-ahead and optimization objective (minimize total changeover + idle time). Cannot be hardcoded as a firing rule; must be exposed as a scenario or optimization parameter. Model should allow manual insertion of idle periods to test impact.

### Line 3 overtime
#### Notice when
Line 3 runs day shift only unless overtime approved. Rare, people grumble.

#### What we know
- Approval from ops director.
- Rare enough to be exceptional.

#### Open questions
- **Not yet asked:** Under what conditions is overtime approved? (e.g., Meridian order risk, capacity crunch?)
- **Not yet asked:** Cost or penalty for overtime?

#### Record for construction
**Assumed:** Line 3 unavailable on evening shift in base model. Overtime can be tested as a scenario (enable Line 3 evening shift, possibly with cost multiplier).

## Unknowns, assumptions, conflicts, and omissions

**Unknowns (asked, expert does not know):**
- Ramp scrap quantity after family switches (quality tracks monthly %, not per-changeover).

**Not yet asked:**
- Exact run time formulas: units/hour by line and family, or base + per-unit?
- Line 3 speed relative to Lines 1 and 2.
- Tint run times on each line.
- Specialty run times on Lines 1 and 3.
- Which tints are "dark" (VW-02 restriction) vs. "light."
- Sequencing priority rules beyond Meridian.
- Changeover crew priority rule if two lines need washdown simultaneously.
- Line breakdown frequency/duration.
- Line 3 overtime trigger conditions.
- Order interarrival distribution (though weekly batch arrival is clear).

**Assumed (to be named in delivery):**
- Line 3 speed between Line 1 and Line 2 (not specified).
- All tints treated as "dark" for VW-02 restriction (conservative, definition not provided).
- No overtime on Line 3 in base model.
- Run times scale linearly with units (no explicit fixed setup time mentioned, but expert said small orders may be "barely worth starting the mill").
- QA hold modeled as fixed delay, no rejection stochasticity in base model.
- Line crews always available (no sick days, breaks modeled).

**Conflicts:**
- None identified yet.

**Omissions (deliberate, objective permits):**
- Raw material supply (assumed unconstrained).
- QA rejection as stochastic event (too rare, can be scenario).
- Line breakdown as stochastic event (concern is replanning response, not prediction).
- Ramp scrap quantity (unknown, not load-bearing for scheduling decision if objective is on-time + changeover hours).
- Detailed commercial penalty structure (Meridian late = bad, others flexible, but no $ values).
- Idle-hold optimization logic (exposing the scenario is enough; model doesn't need to decide autonomously).

## Projection losses

**Cannot represent in SDCPN:**
- Unwritten commercial relationships ("we call the distributor and they say yes").
- "Gut feel" idle-hold decisions (can model idle as inserted delay, cannot model the decision rule without explicit lookahead logic).
- Qualitative "panic" when Line 2 goes down (can model capacity loss, not emotional state or improvisation quality).
- VW-02 dark-tint restriction without knowing which tints are dark (can hardcode all-tints-are-dark, but loses fidelity).
- Small-order inefficiency ("barely worth starting the mill") without quantified setup time (can assume linear scaling or add fixed setup if expert confirms).

**Loss if not elicited further:**
- Precise run time predictions (will use approximations and parameters).
- Changeover crew priority rule (will model FCFS or make priority a parameter).
- Sequencing optimization logic (model enables scenario testing, not autonomous scheduling).
