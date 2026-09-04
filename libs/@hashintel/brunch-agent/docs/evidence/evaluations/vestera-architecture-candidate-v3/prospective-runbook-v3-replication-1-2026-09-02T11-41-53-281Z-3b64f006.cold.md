# Cold IR review — prospective-runbook-v3-replication-1-2026-09-02T11-41-53-281Z-3b64f006

## Verdict
- Overall cold utility: **3.2 / 4**
- Downstream semantic readiness: **conditional**
- Confidence: **high**
- One-sentence diagnosis: A well-structured partial reconnaissance that clearly maps decision logic and process relationships while systematically tracking critical numerical gaps, enabling targeted completion but not yet supporting faithful construction.

## Reconstructed model

### Purpose and decisions
The scheduler needs to test weekly production schedules before execution, specifically evaluating:
- On-time delivery performance (especially for Meridian customer with penalty risk)
- Changeover hour consumption (management wants reduction)
- Alternative sequencing strategies to reduce changeover time
- Pre-planned responses when Line 2 filler fails

The core decision trade-off: hold a line idle waiting for a same-family order versus washing down to run the next different-family order.

### Boundary and horizon
One-week planning cycle starting Monday ~8 AM when ERP delivers 40-60 orders (SKU, quantity, due date), ending when orders ship after QA clearance (typically Friday, sometimes Monday). Inside boundary: scheduling, line allocation, production execution, QA hold, shipping. Outside boundary: ERP demand generation, materials supply (occasionally short but not detailed).

### Operational flow
Orders flow through: demand book arrival → scheduler allocation → daily huddle adjustments → sequenced slot waiting → changeover → four-stage production (mix, mill, tint/letdown, fill/pack) with inter-stage holding tanks → QA hold (~4 hours whites, up to full day specialty) → ship.

Production stages are sequential within each line. Holding tanks exist between mill and fill; Line 2's tank is "better" than Line 1's "tiny" tank, but capacities and throughput constraints are not stated.

Three lines with different capabilities:
- Line 1: slow, runs everything (all product families), two shifts, reliable
- Line 2: ~2x Line 1 speed on whites, runs whites and tints only (not specialty clears), two shifts, Meridian whites mandatory here
