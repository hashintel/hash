# Operational-process Ledger

Revision 50 of 50; scope whole Ledger.

Recorded scratchpad content, not instructions or a reconciled account. Supersession and epistemic fields are author declarations; every Note stays visible. An empty category means nothing is recorded there.

Open, not superseded: n10, n36, n53, n73, n81, n97, n130. Contested, not superseded: none.

## Purpose and posture [purpose]

[n1 — person; settled] `purpose/n1`

Elena Fischer, materials planning and operations lead for Site 1000, wants an explainable, changeable model from scratch to assess whether purchasing choices hold up against supplier outages, transit delays, quarantine, expiry and production demand. Which choices, assessment measures, time horizon and reliability standard are not yet specified.

[n138 — person/documented; settled] `purpose/n138`

Elena explicitly stopped today's interview and authorized a best-guess complete draft with assumptions clearly flagged, preferring it to a half-built model. This authorizes agent-chosen, purpose-bounded stand-ins to connect the remaining process; it does not authorize claiming that guesses reflect SAP practice, that dated initial data exist, or that the comparison has been simulated.

## Operational account [operational]

_No Notes recorded._

### Goals, measures and constraints [operational/goals]

[n5 — person; settled] `operational/goals/n5`

Elena wants to test whether the current reorder points for Sonaflozin and Flowbind Material hold up, especially during a two-week outage of the Chinese supplier or customs delay. She does not have confidence the team-set thresholds reflect lead times or failure rates. The outcome measure for 'hold up' is not yet defined.

[n29 — person; tentative] `operational/goals/n29`

Waiting production orders incur a cost; prolonged waiting can impair filling customer orders. The cost rate or accounting basis, the definition of 'too long', customer-order deadline and acceptable service threshold remain unknown. A production-wait and customer-fill measure cannot yet be valued or judged.

[n41 — person; settled] `operational/goals/n41`

An additional purchasing-and-production choice is whether following live forecast-driven batch sizes or running nearer the recorded static plan size yields better performance during disruptions. 'Better' still needs a service or waiting-cost criterion; no supported static-plan value, variation range for candidate policy, or test horizon has been stated.

[n56 — person; settled] `operational/goals/n56`

Supplier delay and quarantine can consume a lot's remaining shelf life before it becomes usable; Elena wants this exposure reflected when assessing purchasing choices. Shelf-life duration, how expiry dates are set on supplier lots, and whether quarantine can conclude after expiry are not yet specified.

[n83 — superseded by n90; person/practiced; settled] `operational/goals/n83`

For a 104-week comparison, team-set target 1 is fill rate of at least 95% of customer orders filled. Elena calls this the main measure. Whether 'filled' means eventually fulfilled within the run, fulfilled in full by a promised date, or another service definition, and how partially filled orders count, have not yet been established.

[n84 — superseded by n105; person/practiced; tentative; approximate] `operational/goals/n84`

Team-set target 2 for a 104-week run: average production delay under about one-quarter of a week per planned production unit. The 'about' qualification belongs to the threshold. Delay start/stop and whether average is unit-weighted across planned units remain to clarify; do not recast this as per batch or an exact 1.75-day rule.

[n85 — superseded by n99; person/practiced; settled] `operational/goals/n85`

Team-set target 3 for a 104-week run: expiry rate under 5% separately for Sonaflozin and Flowbind Material. Numerator/denominator and treatment of pre-receipt expiries remain unspecified; the two material rates are distinct and must not be combined.

[n90 — supersedes n83; superseded by n95; person/practiced; settled] `operational/goals/n90`

Clarification of 104-week main target: fill rate means at least 95% of customer orders filled in full by their promised date, not eventually filled within the run. Elena explicitly says a shipment three weeks late still hurts the customer. Whether partial shipments count at all, how promised dates are recorded, and which orders enter the 104-week denominator remain to establish.

[n95 — supersedes n90; superseded by n96; agent/inferred; tentative; corrects agent's unsupported 'in full' normalization] `operational/goals/n95`

Correction of n90's over-specific wording: Elena defined 104-week fill rate as at least 95% of customer orders filled by their promised date; an order shipping three weeks late does not count on time. She did NOT specify whether a partial shipment by the promised date counts as filled, so 'in full' was an agent addition and is withdrawn. Need that distinction, how promised dates are recorded and how orders crossing the 104-week boundary are counted.

[n96 — supersedes n95; person/assumed; tentative; preferred evaluation rule, SAP reporting unverified] `operational/goals/n96`

Elena's preferred scoring for the 104-week ≥95% on-time fill target: only a customer order whose entire requested quantity ships by its promised date counts as filled; a partial on-time shipment is a workaround, not a success. Her 'I'd want to say' expresses the intended evaluation rule, not confirmation that SAP currently reports fill this way. Orders shipped late do not count as on-time per n91; partial shipment mechanics and eventual cancellation remain unestablished.

[n99 — supersedes n85; person/assumed; tentative; team metric definition to be checked] `operational/goals/n99`

Elena cannot give the team's precise under-5%-per-material expiry-rate definition without looking it up. Her provisional interpretation: denominator is material received and usable (or capable of use) at the warehouse; numerator is material that then expires before use. A lot that expires in transit is a different kind of loss and should not silently count in this warehouse expiry rate. Whether quarantine-at-warehouse counts as 'could have used' and the actual team target definition remain unverified.

[n101 — person; tentative] `operational/goals/n101`

Loss of material expiring in transit should be tracked separately from the provisional warehouse expiry-rate target per n99. This is a measurement distinction, not a claim about who bears the financial loss or whether the team has another transit-loss threshold.

[n105 — supersedes n84; superseded by n110; person; tentative; approximate] `operational/goals/n105`

Elena clarifies the 104-week production-delay target as average waiting time between a batch's scheduled start and its actual production start, expressed per planned production unit, under about one-quarter of a week. Production running time is not part of this delay. Whether the per-unit average weights each batch's wait by its planned units and how batches still waiting at the 104-week boundary are treated remain to establish.

[n110 — supersedes n105; person/practiced; settled; approximate] `operational/goals/n110`

Elena accepts batch-size-weighted waiting for the production-delay measure: bigger planned batches waiting longer should contribute more. Waiting is from scheduled batch start until actual production start, excluding roughly one-week production running time (n106). Her assent to the agent's 700 units × 2 days illustration supports this weighting but is not independent evidence for a specific formula. Target remains average under about 0.25 week per planned production unit over 104 weeks; treatment of batches still waiting at the horizon remains unresolved.

### Boundary and initial conditions [operational/boundary]

[n4 — person; settled] `operational/boundary/n4`

Purchasing is to be evaluated against supplier outages, transit delays, quarantine, expiry and production demand; these are named consequential conditions, but their mechanisms and the process boundary have not yet been established.

[n86 — person; settled] `operational/boundary/n86`

Elena specifies a 104-week run horizon for the team's fill-rate, production-delay and per-material expiry targets (n83–n85). Calendar start, initial on-hand and open-order states, customer-order population and how boundary-crossing orders are counted remain unspecified.

[n127 — person/practiced; settled; Selection criterion only; clean not yet operationally defined.] `operational/boundary/n127`

Elena wants both 104-week policy cases to start from the same most recent 'clean' SAP snapshot, rather than naming a historical date now. 'Most recent clean' is her selection preference, not an identified snapshot or an observed SAP state; she must pull the date from SAP.

[n128 — superseded by n130; agent; open; Deferred pending SAP lookup.] `operational/boundary/n128`

The actual SAP snapshot date, which would anchor week 0 for both cases (n122, n127), is deferred because Elena cannot recall it and must retrieve it from SAP. The criterion for a 'clean' snapshot also remains unspecified. Until a candidate snapshot, its date, lot balances/expiry and open orders are supplied and checked, the initial state and 104-week calendar cannot be populated or compared.

[n130 — supersedes n128; person/practiced; open; Date and actual data reliability not yet checked.] `operational/boundary/n130`

Elena cannot recall the calendar date and must pull the most recent qualifying snapshot from SAP. She clarifies 'clean' as one in which stock figures and open orders are reliable: reject snapshots amid a system migration, a period of inconsistent data entry, or a known correction that has not fully propagated. This supplies a selection screen, not verification of any particular snapshot. Both comparisons still need the same dated snapshot and matching lot balances/expiry and open-order data; return when a candidate SAP export is available (n122, n127).

### Participants, things and resources [operational/resources]

[n2 — person; settled] `operational/resources/n2`

Site 1000 makes Sonic Flow using Sonaflozin and Flowbind Material. Quantities, units, recipes, lot handling and supplier identities have not yet been established.

[n19 — person; settled] `operational/resources/n19`

Chinese supplier supplies Sonaflozin only. Flowbind Material normally comes from the Indian supplier; German Supplier is another source for Flowbind Material.

[n54 — person; settled] `operational/resources/n54`

Sonaflozin and Flowbind Material are managed at lot level. Each lot has an expiry date; its quantity and date determine whether it is eligible to be used. Lot sizes, shelf-life starting point, and dated starting inventory remain unprovided.

[n62 — person/documented; settled] `operational/resources/n62`

For Sonaflozin, the manufacturer sets a lot's expiry date, confirmed on its certificate of analysis, before dispatch. The date is fixed thereafter; remaining shelf life is consumed during transit, quarantine and warehouse storage. When during preparation the manufacturer fixes the date, and how one order/shipment relates to one or several certified lots, remain unspecified.

[n69 — person/practiced; settled] `operational/resources/n69`

A large Sonaflozin order may be split across multiple lots. Each lot has its own expiry date and certificate of analysis; do not treat a whole purchase order as one lot. Elena gave a 2,500-unit bulk order as an illustrative case, not a typical fixed order size. Exact lot sizes and dispatch grouping are not at hand.

### Activities and resource use [operational/activities]

[n3 — person; tentative] `operational/activities/n3`

Making Sonic Flow uses Sonaflozin and Flowbind Material. The manner and quantity in which each is consumed or transformed, release conditions and production timing remain unspecified.

[n27 — person; settled] `operational/activities/n27`

For each unit of Sonic Flow produced, production uses one unit of Sonaflozin and one unit of Flowbind Material. A planned batch therefore requires the batch size in units of each material. Elena has not yet said whether material is accounted across lots or how a partial batch is handled.

[n47 — superseded by n51; person; tentative] `operational/activities/n47`

Forecast-driven Sonic Flow batch size is calculated as current order rate multiplied by plan period multiplied by average order size. Measurement units, lookback window, update timing, rounding and whether the resulting batch size overrides or merely advises the dated production plan are not established.

[n51 — supersedes n47; person/practiced; tentative; Elena says 'from what I understand'] `operational/activities/n51`

Elena's tentative understanding: forecast-driven batch size is calculated at the time a batch is planned using the then-current order rate × plan period × average order size. Demand changes before planning therefore shift that batch size, and a noisy week can yield a noisy batch. She did not say that already planned batches are recalculated at production release; planning-to-release timing, rate measurement and update cadence remain unverified.

[n75 — person/practiced; settled] `operational/activities/n75`

A planned Sonic Flow batch may draw Sonaflozin and Flowbind Material across multiple released, eligible lots. If the oldest eligible lot is too small, production takes the remainder from other eligible lots; the batch need not wait for one large lot. It waits only if total released eligible material of either kind is insufficient, in conjunction with n27–n28. Order of drawing later lots follows n55 but its 'oldest' key remains to be checked.

[n133 — person/practiced; settled] `operational/activities/n133`

After a Sonic Flow batch is finished, finished goods undergo quarantine and quality release before they can be shipped to customers. Quarantined finished goods are not available for shipping; the actual release requires quality clearance. Exact testing, release trigger and handling of rejected batches have not been described.

### Cases and process spine [operational/process-spine]

[n15 — agent/inferred; tentative] `operational/process-spine/n15`

Provisional account for a Chinese-supplier order: an order is triggered under the relevant reorder rule (n6), followed by supplier preparation and transit (n11); an outage at trigger may add time before dispatch (n12); quarantine adds time before usable material (n13). Customs delay was named as a concern (n5) but its mechanism is not yet described. No observed instance, supplier-to-material binding, receipt handling or production-use outcome is established.

[n30 — person; tentative] `operational/process-spine/n30`

A planned Sonic Flow batch requires both materials in its planned batch size (n27). If either is unavailable or still in quarantine the production order waits (n28); if the wait is prolonged it may affect customer fulfillment (n29). Exact start, completion duration, stock allocation, expiry checks and customer handoff are not established.

[n91 — person; tentative] `operational/process-spine/n91`

A customer order has a promised date; if delivery occurs after it, that order must not count as on-time fill (n90). A spot customer might cancel when delayed, but Elena did not state an actual cancellation trigger, frequency or recovery path. Preserve possible cancellation as an unresolved outcome rather than a simulated probability.

[n116 — agent/inferred; tentative] `operational/process-spine/n116`

After a Flowbind order is assigned to India or Germany under n115, each source has supplier preparation, transit and quarantine before usable material. Approximate timing is source-dependent (n112–n114); German orders are small urgent top-ups and may receive different priority, but the operative priority rule and material-lot receipt/release details have not been described.

[n135 — person/practiced; settled] `operational/process-spine/n135`

Extension to the production-to-shipping portion: completed Sonic Flow units pass through finished-goods quarantine, then quality release, and only then can ship against customer orders. The FEFO material-to-production-start path remains absent (n81); how a completed batch is associated with orders and how finished-goods quality rejection is handled remain unresolved. This is a process ordering constraint, not a claim that the existing net executes the whole chain.

### Time, quantities and variation [operational/quantities]

[n7 — person/assumed; tentative] `operational/quantities/n7`

A two-week outage of the Chinese supplier is a scenario Elena wants to test, not an observed outage frequency or a general outage duration. Which material this supplier provides and timing of the interruption are not yet established.

[n11 — person/assumed; tentative; approximate] `operational/quantities/n11`

Elena reports Chinese-supplier lead time is around 28 days total. Their planning assumption splits that into one week of supplier preparation and the remaining approximately 21 days of transit. These are approximate planning figures, not SAP-verified observations; assignment of the Chinese supplier to a specific material remains unknown.

[n12 — person/assumed; tentative; approximate] `operational/quantities/n12`

For an order triggered while the Chinese supplier is out, Elena says a two-week outage could be lost before dispatch on top of normal lead time; this is a conditional risk scenario, not a measured outage distribution. Whether all outages block preparation, dispatch, or both needs confirmation.

[n13 — person/estimated; tentative; qualitative] `operational/quantities/n13`

Quarantine adds 'a few more days' to material becoming usable after supplier preparation and transit. No exact duration, release condition, failure or rejection probability, or material-specific distinction has been established.

[n35 — person; settled] `operational/quantities/n35`

The Sonaflozin reorder point 2,500 and target 7,500 are in units of Sonaflozin; the Flowbind point 1,500 and target 5,000 are in units of Flowbind Material. These material units are the same units used for the material quantities in production's one-for-one requirement (n27).

[n39 — person/estimated; tentative; approximate; records cited but not consulted] `operational/quantities/n39`

Sonic Flow production batches run roughly every two weeks and average around 700 units. Elena estimates batch-size standard deviation at perhaps 200 units 'from the records', but those records have not been consulted here. Timing regularity, distribution, correlations and production horizon remain unspecified; these figures do not establish a Gaussian size distribution or random arrivals.

[n46 — person/estimated; tentative; approximate; underlying records not consulted] `operational/quantities/n46`

Elena describes the recorded static plan's batch-size average as about 699 Sonic Flow units per batch and the forecast-driven batch-size average as around 662 units per batch; the static series stays near its level while the forecast approach can vary more. These are source-described summaries, not exact fixed batch sizes, sampled distributions or reconciled with the earlier overall average around 700 (n39).

[n106 — person/estimated; tentative; approximate] `operational/quantities/n106`

Once a Sonic Flow batch starts, production itself takes about one week and is described by Elena as fairly fixed; variation of interest is waiting for materials before production starts. This is approximate, not an exact constant or observed distribution.

[n112 — person/estimated; tentative; approximate; records cited but not consulted] `operational/quantities/n112`

Flowbind from India has approximately 14 days total lead time based on records Elena recalls, 'give or take a few days': about one week supplier preparation and approximately seven days transit. The underlying records have not been inspected and no spread/distribution was established.

[n113 — person/estimated; tentative; approximate] `operational/quantities/n113`

Flowbind from German Supplier has approximately 15 days total lead time, with a similar split to India: about one week supplier preparation and approximately eight days transit by subtraction. Elena did not supply an exact split or distribution; German orders are small urgent top-ups rather than typical full orders.

[n114 — person/estimated; tentative; qualitative] `operational/quantities/n114`

Flowbind quarantine adds 'a few days' after either Indian or German supplier lead time before material is usable. No exact quarantine duration, variation, release failure, or supplier-specific difference has been established.

[n134 — person/estimated; tentative; qualitative] `operational/quantities/n134`

Elena expects the finished-goods quarantine hold to be similar in length to raw-material quarantine ('a few days' in the prior account), but gives no measured duration or guarantee that the two are equal. Do not infer an exact number from her expectation.

### Policies and exceptions [operational/policies]

[n6 — person/practiced; settled] `operational/policies/n6`

Team-judgment purchasing rule reported by Elena: trigger a Sonaflozin order when inventory position drops below 2,500 and order back up to 7,500; for Flowbind Material, trigger below 1,500 and order back up to 5,000. Strictly below was stated, not at or below. Inventory-position definition, units, supplier assignment and whether this is practiced exactly remain unconfirmed.

[n20 — superseded by n115; person/practiced; settled] `operational/policies/n20`

Flowbind Material normally is sourced from the Indian supplier. German Supplier is used for urgent top-ups or when India is out. 'Urgent' trigger, who chooses the supplier, and whether German orders supplement or replace Indian orders remain unspecified.

[n28 — person/practiced; settled] `operational/policies/n28`

A production order waits if either Sonaflozin or Flowbind Material is not both available and released from quarantine. Being physically present in quarantine alone does not satisfy production's requirement; no partial-start or substitution rule has been established.

[n34 — person/practiced; tentative; SAP configuration unverified] `operational/policies/n34`

Elena says inventory position for both materials includes on-hand stock plus open orders, describing that as 'standard.' This is her account of the working definition, not a confirmed SAP configuration. Whether material in quarantine is counted in the on-hand component is unknown; she thinks it should not count because it is not usable but is unsure how SAP is set up. Do not silently treat the preferred exclusion as current practice.

[n40 — superseded by n45; person/practiced; tentative] `operational/policies/n40`

Current Sonic Flow batch size is driven by the live forecast and can move with demand. Elena wants to compare this with batches closer to the recorded static plan size. The static plan size, permitted flexibility, forecast revision schedule, and scheduling rules under each approach have not been supplied.

[n45 — supersedes n40; person/practiced; tentative] `operational/policies/n45`

Clarification of n40: the 'recorded static plan' is a dated series of planned batch sizes, not a single fixed batch size. Elena characterizes it as staying around 699 Sonic Flow units per batch on average. Forecast-driven sizing instead uses current order rate × plan period × average order size, averaging around 662 units per batch and moving more with demand. The series, formula inputs/units and comparative variation have not been supplied; these summary means are not substituted for the dated inputs.

[n55 — superseded by n80; person/practiced; settled] `operational/policies/n55`

Expired material cannot be used for production and is written off. Among eligible lots, the oldest stock is used first: a lot close to expiry precedes a newer lot. Elena's wording 'oldest eligible stock' / 'close to expiry' suggests expiry order, but a distinction between earliest expiry and oldest receipt date should be checked if those can differ.

[n80 — supersedes n55; person/practiced; settled] `operational/policies/n80`

Elena clarified the lot-use priority explicitly as FEFO: among released, unexpired eligible lots, use the lot closest to its expiry date first, even when a different lot is older by receipt age. Expired lots are not usable and are written off. The purpose is to avoid write-offs; this priority is described as standard pharmaceutical practice, not verified from site transaction traces.

[n115 — supersedes n20; superseded by n119; person/practiced; tentative] `operational/policies/n115`

Flowbind normally comes from India; German Supplier is used for small urgent top-ups or when India is out. Elena now adds that German urgent orders 'tend to be prioritised differently,' but has not specified how routing, preparation, dispatch or queueing priority actually changes. Do not infer Germany is faster: reported total lead time is about 15 days versus India's about 14 (n112–n113).

[n119 — supersedes n115; person/practiced; settled] `operational/policies/n119`

Elena corrects the interpretation of German urgent-top-up 'priority': she only meant they do not sit in a queue in the way a routine bulk order might. The relevant observed/data-based lead time remains about 15 days; she explicitly says not to infer an additional modeled priority or shortened lead time from this remark. The existence/timing of a routine bulk queue was illustrative, not a measured queue rule.

[n122 — person/practiced; settled] `operational/policies/n122`

For the 104-week comparison of forecast-driven versus static-plan batch sizing, use the same dated SAP snapshot as the starting position in both alternatives. Elena's reason: different starting stock would confound the policy comparison. Snapshot date and fields for released/quarantined lots, open orders and demand have not been provided; do not invent them.

### Validation evidence and sources [operational/validation]

[n14 — person; settled] `operational/validation/n14`

Elena cannot presently recall a specific recent order; SAP records would be needed to trace a concrete order and test preparation, transit, customs and quarantine timings against observed cases. No SAP records have been consulted.

[n63 — person; settled] `operational/validation/n63`

A manufacturer's certificate of analysis is the source for a Sonaflozin lot's expiry date before dispatch; this could bind lot identity and expiration to shipment and later stock records. No certificate or SAP lot record has yet been inspected.

[n100 — person; settled] `operational/validation/n100`

The team definition used when setting the under-5% expiry target needs to be consulted; Elena has not yet located it and has not confirmed her provisional received-and-usable denominator. A dated material receipt/release and write-off record would distinguish warehouse expiry from transit loss. No such document or records have been consulted.

[n123 — person; settled] `operational/validation/n123`

A common dated SAP snapshot is the intended initial-state source for both batch-plan alternatives (n122), to hold starting stock and open-order position constant. The snapshot has not been obtained or checked; comparisons should verify identical initial populations and lot dates once imported.

[n131 — person/practiced; settled] `operational/validation/n131`

For selecting the shared starting SAP snapshot, Elena would screen for reliable stock figures and open orders and exclude a candidate if it was taken during system migration, inconsistent data entry, or before a known correction fully propagated (n130). No candidate export or evidence that it passes this screen has been inspected.

## Construction notes [construction]

[n9 — agent/inferred; tentative] `construction/n9`

Draft purchasing fragment based on n6: separate Sonaflozin and Flowbind externally supplied inventory-position readings, strict below-point order checks, and calculated top-up order amounts using the four team-set thresholds as parameters. Readings are supplied from outside because inventory-position definition, checking cadence, stock changes and order accounting are not yet known (n8). This is an agent representation, not an observed ordering workflow.

[n10 — agent; open] `construction/n10`

The fragment presently stops at placed orders; supplier outages, customs delay, physical receipts, quarantine, expiry, demand, and production are not connected. Numeric order amounts use provisional real-valued quantities because operational units and indivisibility are unknown. A reading not below the threshold has no completed path yet. Neither supplier fulfillment nor policy performance can be assessed from this fragment.

[n16 — superseded by n22; agent/inferred; tentative] `construction/n16`

Separate, as-yet-unconnected Chinese-supplier timing fragment based on n11–n13 and n15: external order enters approximate seven-day preparation, then approximate 21-day transit, then quarantine, with remaining days decreasing continuously. A scenario-controlled outage duration adds before dispatch. This does not assume whether Chinese supply is Sonaflozin or Flowbind; it cannot yet test either reorder rule against usable inventory. The prep/transit split and additive outage are Elena's reported assumptions, not measured distributions.

[n17 — agent/assumed; tentative] `construction/n17`

For 'a few more days' in quarantine (n13), agent chose 3 days solely as a visibly labelled, replaceable placeholder to allow a timed stage; no person supplied that number. Customs delay, quarantine rejection, lot expiry, production use, and inventory-position feedback are omitted pending operational detail.

[n22 — supersedes n16; agent/inferred; tentative] `construction/n22`

The Chinese timing fragment built under n11–n13 can now be attached specifically to Sonaflozin orders based on n19; the earlier unassigned material boundary is superseded. It still lacks a usable-inventory feedback connection and has a provisional quarantine duration (n17).

[n23 — agent/inferred; tentative] `construction/n23`

Using n19, connected the Sonaflozin order amount from n6 directly to the Chinese-supplier preparation/transit/quarantine fragment from n11–n13; removed the former external generic Chinese-order input. The output is still a delivery boundary, not counted as on-hand usable stock. Applied supplier binding does not validate transit or release behavior.

[n24 — agent/inferred; tentative] `construction/n24`

Using n20, Flowbind orders can be assigned to India or German Supplier only when an externally provided routing instruction selects one; this stand-in avoids inventing urgency or outage criteria and preserves exclusive order assignment for a single order. No sourcing duration, extra top-up mechanism, or receipt path for either supplier is yet represented.

[n25 — agent/inferred; tentative] `construction/n25`

Saved a named China two-week outage-at-order stress scenario with a tunable 14-day additive delay before dispatch, drawn from n7 and n12. Scenario has no initial inventory-position readings or stock: it cannot yet test reorder resilience, and its scenario compilation/execution has not been checked.

[n31 — agent/inferred; tentative] `construction/n31`

Using n27–n30, draft now carries externally supplied planned Sonic Flow batch sizes and aggregate balances of quarantine-released Sonaflozin and Flowbind. Batch production is enabled only when both balances each cover the planned quantity, then subtracts that quantity from each and records the finished batch. If either is insufficient, the planned order remains waiting. Sonaflozin released deliveries add to its usable balance; Flowbind released deliveries remain an external input because Indian/German fulfillment is not established.

[n32 — agent/assumed; tentative] `construction/n32`

Agent simplifications for n27–n30: one aggregate balance token per material with quantities in the same unspecified unit as the batch; no individual lots or expiry, material allocation, partial production, production duration, customer order matching, wait cost or late-fill threshold. Production is currently an instantaneous state change after material becomes sufficient. The scenario has no initial stock/batch readings; balances must be supplied before a run. Counts of waiting orders and cumulative units made were saved as descriptive metrics, not as a service-level objective or cost.

[n37 — agent/inferred; tentative] `construction/n37`

Updated draft labels to material-specific units using n35 and annotated external inventory-position readings as on-hand plus open orders per n34. Deliberately retained readings as externally supplied rather than calculating them from aggregate usable balances: SAP's quarantine inclusion and timing of observation are unverified, and automatic feedback would assert a policy not established. This still prevents closed-loop reorder testing.

[n43 — agent/inferred; tentative] `construction/n43`

For n39–n41, added separate externally specified forecast and recorded-static-plan batch schedules: each batch carries quantity and days until its release, counting down in simulated days; a policy switch permits only the selected schedule's due batches into production. Saved two named two-week China-outage regimes with forecast versus static-plan selection and the same additive 14-day supplier delay. This does not invent a Gaussian batch distribution from mean 700/possible SD 200, assume an exact fortnight cadence, or claim a static-plan size. Scenario initial states are empty until actual sequences and starting stock are provided.

[n49 — agent/inferred; tentative] `construction/n49`

Extended the forecast route for n47: externally supplied snapshots of order rate, plan period, average order size and dated release offset are multiplied to create a scheduled batch. The static route still accepts its recorded dated batch series (n45). The 699 and 662 averages from n46 are retained as descriptive evidence only, not plugged in as constant batch sizes. Snapshot values are frozen when supplied; if 'current' means recalculated later at release, this implementation must change. Unit compatibility, rounding and actual SAP/forecast data bindings remain unresolved.

[n52 — agent/inferred; tentative] `construction/n52`

The forecast snapshot already built for n47 is consistent with n51 only if its input values represent the order rate at each batch's planning time and the scheduled release offset is measured from that planning snapshot. Supplying all snapshots at scenario start is a historical replay stand-in, not a live recalculation; no further net mutation needed yet. Do not manufacture random demand noise or infer a variance from the 'noisy week' example.

[n57 — superseded by n58; agent/inferred; open] `construction/n57`

New n54–n56 invalidate the draft's single aggregate usable-balance assumption in n32: aggregate stock cannot distinguish expired lots or enforce oldest-eligible-first. Do not treat current production or waiting metrics as expiry-safe. Revise representation toward dated lot state, expiration/write-off and lot-aware production; until completed, isolate or disable the aggregate production path rather than silently using expired material.

[n58 — supersedes n57; agent/inferred; tentative] `construction/n58`

Replaced the invalid aggregate-inventory production representation (n32): removed aggregate usable balances, aggregate receipt/production paths, and their production/wait metrics. Added separate Sonaflozin and Flowbind usable lot states with quantity, lot reference and days to expiry; remaining life counts down, and expired lots move to write-off with separate reported quantities (n54–n55). Lot input currently comes only from externally supplied dated stock; Chinese shipments and Flowbind supplier orders are not yet converted into identified lots. This intentionally leaves planned batches without a production completion path rather than falsely allowing expired stock to make Sonic Flow.

[n65 — agent/inferred; tentative] `construction/n65`

Using n62–n63, revised Sonaflozin supply so an externally supplied manufacturer-certified lot with lot reference, quantity and remaining shelf life is required at dispatch. Its expiry clock runs in the pre-dispatch certificate state and, after dispatch, in transit and quarantine; release to usable lots requires positive remaining shelf life. Expired certified lots at pre-dispatch, transit, quarantine or warehouse are diverted from eligibility and counted as expired quantity. This is structural correspondence to the fixed-expiry account; no certificate or shipment data or runtime trace has been tested.

[n66 — superseded by n70; agent/assumed; tentative] `construction/n66`

To join an order to its certificate, the draft assumes one certified lot with exactly the order quantity (allowing 0.000001 numerical comparison tolerance) per dispatch. Elena has not established this: split lots, partial dispatch, remakes after an expired pre-dispatch lot and who bears the write-off before site receipt are unresolved. A certificate supplied at scenario start loses remaining life throughout any outage only if the manufacturer actually fixed its expiry by then; if not, its creation time must be modeled differently.

[n70 — supersedes n66; superseded by n72; agent/inferred; open] `construction/n70`

The one-certified-lot-equals-whole-order shortcut is contradicted by Elena's clarification n69 and must be replaced. Dispatch should consume the quantity of each separately certified lot from an outstanding order balance, allowing several lots per order and retaining each certificate's independent expiry. Other unresolved points remain: time of certificate issuance relative to outage, partial-dispatch schedule, supplier replacement and pre-receipt loss ownership.

[n72 — supersedes n70; agent/inferred; tentative] `construction/n72`

Resolved the obsolete whole-order/one-lot shortcut in the draft using n69: after the preparation/outage wait, each positive certified Sonaflozin lot may dispatch if no larger than the remaining order quantity; the undispatched balance returns for additional lots, and a zero balance is closed. Each dispatched lot retains its own certificate expiry through transit, quarantine and stock. Lot sizes remain externally supplied rather than invented. Structural simplification still open: no order identifier links a certificate to its specific purchase order, so two simultaneous orders could be cross-matched, and exact partial-dispatch timing is not modeled.

[n77 — agent/observed; settled] `construction/n77`

Attempted to represent n75's arbitrary-number-of-lots oldest-eligible allocation as a dated inventory book with serialized lot entries, feeding an allocation kernel. Petrinaut's TypeScript diagnostic TS99020 rejected the required JSON.parse/array mutation call as outside its supported executable subset. Removed the attempted book type, places, equation and transition; a subsequent getNetCompilationErrors returned no errors/warnings. The draft therefore still has no production completion or split-lot allocation path. This is a specific code-surface limitation of the attempted representation, not proof that no other encoding could work.

[n82 — agent/inferred; settled] `construction/n82`

No net mutation on n80: existing lot expiry/write-off paths and absence of a misleading production path already preserve the resolved FEFO rule as an open implementation obligation. Do not label the existing flow as FEFO-compliant merely because expiry dates are stored; a local lot guard cannot prove no nearer-expiry eligible lot exists elsewhere.

[n88 — agent/inferred; settled] `construction/n88`

No new outcome metric or experiment was authored from n83–n86: current net has no customer-order arrival/fulfillment path and no FEFO production completion, and expiry-rate denominators remain unknown. Any apparent fill rate, mean delay, or expiry percentage computed now would invent definitions. The 95% fill, approximately quarter-week per planned unit, and under-5%-per-material thresholds are retained as Ledger targets, not encoded as executable constraints.

[n93 — agent/inferred; tentative] `construction/n93`

Added externally supplied customer-order requests carrying reference, requested Sonic Flow units and a countdown to promised date, plus an unconnected past-promise outcome state based on n90–n91. Deliberately did not add an automatic missed-date path or 95% fill metric: production and shipping are not connected, so every outstanding order would otherwise be falsely classified as missed. Promise-date cutoff precision, shipment/partial-fill matching and cancellation remain unestablished.

[n98 — agent/inferred; settled] `construction/n98`

No net mutation for n96: customer-order tokens already carry requested quantity and promised date, but there is still no shipping or partial-fill accounting path. A metric reporting fulfillment would falsely imply that the preferred complete-by-date rule is executable. Keep scoring in the account pending shipping evidence and model connection.

[n102 — superseded by n103; agent/inferred; open] `construction/n102`

Current Sonaflozin expired-lot destination and metric combine pre-dispatch, in-transit, quarantine and warehouse expiry, which cannot support Elena's provisional n99 warehouse-only rate nor its separate transit-loss account. Revise the state/metric to keep pre-receipt expiry separate before interpreting any under-5% comparison; actual denominator remains unconfirmed.

[n103 — supersedes n102; agent/inferred; tentative] `construction/n103`

Revised Sonaflozin expiry accounting for provisional n99: expired lots after usable warehouse release remain in SonaflozinWrittenOffLots; certified lots expiring in transit move to a separate transit-loss state; those expiring before dispatch or during quarantine move to a separate pre-release state. Saved separate descriptive quantity metrics, not percentages; no denominator has been established. Flowbind currently reports usable-stock expiry only, while its pre-release supply path remains unmodeled. Whether quarantine expiry belongs to the team's actual 5% calculation still needs its definition.

[n107 — superseded by n108; agent/inferred; tentative] `construction/n107`

n105 suggests the draft planned-batch state should carry elapsed waiting time from scheduled start until a future material-eligible production-start activity. The existing batch quantity token cannot carry that clock; revise its representation, but do not compute the target average until completed production starts and its per-unit weighting are represented.

[n108 — supersedes n107; agent/inferred; tentative] `construction/n108`

Revised planned production batch from quantity-only state to quantity plus a waiting-days clock based on n105. When either forecast or static dated batch becomes due, its wait starts at zero and increases in simulated days while the request remains pending. This represents only scheduled-start-to-not-yet-started waiting; because FEFO production start is absent, the clock cannot yet stop, support a completed-batch per-unit average or quantify the team's quarter-week target. Simulation step resolution may shift the exact recorded start boundary.

[n111 — agent/inferred; tentative] `construction/n111`

Agent normalization accepted in Elena's response to n110: sum over started batches of (planned batch units × wait from scheduled to actual start), then divide by the applicable planned-unit count; 700 units waiting two days contribute 1,400 unit-days. Exact denominator (started units versus all planned units including still-waiting batches at the 104-week boundary) is unconfirmed. Existing planned-batch tokens already carry quantity and wait_days, so no new net mutation was required; there is still no production start or completed-delay metric.

[n117 — superseded by n120; agent/inferred; tentative] `construction/n117`

Extended the Flowbind branch using n112–n116: externally routed India or German orders enter a shared approximate seven-day supplier preparation stage, then approximately seven days India transit or eight days Germany transit, then quarantine. Supplier identity is carried throughout; German urgency/priority remains external and no faster German service was inferred. Quarantine uses a visibly named agent-chosen three-day placeholder for Elena's 'few days', not a reported duration. After quarantine, quantity stops at a boundary awaiting lot references and expiry dates, so it is not silently usable stock and cannot support production.

[n120 — supersedes n117; agent/inferred; settled] `construction/n120`

Flowbind timing path remains unchanged after n119: German top-ups use the reported approximate 15-day total (about 7 preparation + 8 transit), with no invented queue priority mechanism or speed advantage. German routing stays externally chosen for urgent top-ups/India outage; quarantine remains agent placeholder and lot identification remains open. Earlier wording about an unmodeled extra priority effect is withdrawn as a requirement.

[n124 — agent/inferred; settled] `construction/n124`

Existing live-forecast and static-plan China-outage scenarios both have empty initial states. n122 requires them eventually to share a verified SAP-derived starting state; empty is missing data, not an assertion that stock is zero. Do not run or present a comparison before the common snapshot is loaded into both with matched material lots and open orders.

[n125 — agent/observed; settled] `construction/n125`

Updated both saved China-outage scenario descriptions to require the same dated SAP starting snapshot per n122. A description-only update to live-forecast scenario unexpectedly cleared its parameter overrides in the returned state; immediately restored explicit 14-day outage and forecast-mode overrides and confirmed both scenario override maps in the subsequent returned definition. This is a repaired mutation effect, not execution validation; both initial states remain empty.

[n129 — agent/observed; settled] `construction/n129`

Using Elena's selection preference n127 and unresolved lookup n128, changed both saved outage scenario descriptions to require the same most recent 'clean' SAP snapshot once identified, with clean criterion explicitly unknown. Explicitly preserved their outage and plan-mode override maps; returned definition shows both changes and both initial states still empty (missing data, not observed zero stock). A title mutation returned applied, but canonical title reads have conflicted with title-write results in this conversation; no title persistence claim. No execution or scenario compilation check from this description-only change.

[n132 — agent/observed; settled] `construction/n132`

Revised both China-outage scenario descriptions using n130–n131: both cases must use one most recent clean dated SAP snapshot, screening out migration, inconsistent entry or incompletely propagated correction and verifying stock/open-order reliability. Inspected returned netAfterChanges: both descriptions and the distinct forecast/static parameter overrides remain present; both initial states remain empty pending SAP data. This is only description/schema acceptance and static inspection, not evidence that a candidate snapshot is clean or that comparisons execute.

[n136 — agent/observed; settled] `construction/n136`

From n133–n135, added a partial finished-goods path: externally supplied completed Sonic Flow batch → finished-goods quarantine with elapsed-day clock → batch-reference-matched externally supplied positive quality clearance → released finished goods for future shipping. A QA-clearance input is an agent stand-in for the unprovided testing/release timing; no automatic 3-day threshold was imposed from n134, and no rejected-batch path was invented. Production/FEFO completion and customer-order shipping are not connected. Mutation results accepted and subsequent full definition includes fragment; getNetCompilationErrors after each code-writing call returned no errors/warnings (does not check scenario/metric execution). An auto-layout request with user confirmation returned 'browser result failed; attempted document effect unknown'; latest read shows the new fragment's provisional positions and no apparent changed positions; do not retry unknown-outcome write.

[n139 — agent/assumed; tentative] `construction/n139`

Proposed completion strategy after Elena's stop (n138): use externally supplied FEFO-certified per-batch material allocation decisions as a stand-in for a missing supported global split-lot selection mechanism (n81); a batch starts only with both material quantities allocated and then runs approximately seven days per earlier account. Positive finished-goods quality clearance remains external, and without it a batch stays held indefinitely in this draft (not a claim about actual failed-batch practice). For shipping, draft a transparent full-order-from-aggregate-released-goods pool with no assumed partial delivery or delivery transit; order priority and full SAP shipment matching remain assumptions/unknowns. Never portray externally certified FEFO as enforced by the net, and do not double-consume the parallel lot ledgers.

[n140 — agent/observed; settled] `construction/n140`

On Elena's permission n138, constructed a connected production-to-shipping draft: externally supplied per-batch FEFO-allocation certificate plus planned batch of equal quantity starts a production run; approximate seven-day run completes into finished-goods quarantine; matching external quality clearance releases the batch; an agent aggregate finished-goods balance receives it and may be debited to ship entire customer orders on/before or after promise. Added candidate order-fill and unit-weighted started-batch-wait reporting metrics. Returned definitions contain the added places, arcs, guards and code; net function-code diagnostics reported no errors/warnings after each code-writing mutation. No execution or saved scenario/metric compilation was performed.

[n141 — agent/inferred; tentative] `construction/n141`

Consequential limitations of n140: the external allocation certificate checks numeric equality only, not actual lot identity, FEFO order, sufficient released unexpired stock or lot consumption; material stocks and purchasing therefore do not causally constrain production or expiry in this draft. The allocation record does not match a unique planned-batch ID (only quantity), so equal-size batches can pair arbitrarily. Finished-goods release is an externally supplied positive event; absent clearance remains held indefinitely; no reject/rework/scrap behavior asserted. Aggregate goods pooling loses batch identity; shipping is instantaneous, whole-order and without confirmed priority, partials, cancellations or delivery transit. An opening balance token is required but not supplied. The order-fill candidate denominator excludes not-yet-due open orders and needs boundary verification; the wait candidate excludes batches that never start. The team's per-material expiry denominator remains unknown, so expired-unit metrics are not rates.

## Cross-cutting open matters [open-matters]

[n8 — superseded by n21; agent; open] `open-matters/n8`

The inventory-position definition and units for n6, which supplier supplies which material, customs-delay mechanism, lead-time and failure evidence, and what 'hold up' means for n5 are unresolved. These prevent a faithful automated reorder and comparison. Return to these through a concrete purchasing-to-production case and a chosen service measure.

[n21 — supersedes n8; superseded by n36; agent; open] `open-matters/n21`

The supplier-material binding is resolved by n19: China supplies Sonaflozin; India normally supplies Flowbind, with German Supplier for urgent top-ups or India outages per n20. Still unresolved: inventory-position definition and units for n6, supplier selection specifics, customs delay, evidence on lead times/failures, and the measure of 'hold up' in n5. These prevent a faithful inventory-feedback comparison; revisit using SAP orders and production records.

[n36 — supersedes n21; agent; open] `open-matters/n36`

The policy units for n6 are resolved by n35, and Elena describes inventory position as on-hand plus open orders in n34. Whether SAP actually counts quarantined stock remains unverified and may differ from Elena's preferred exclusion; allocation of committed stock and observation cadence remain unknown. Customer-fill timing and cost (n29), supplier delivery timing, customs delay and expiry still prevent resilience evaluation. Check SAP inventory-position configuration and order records to resolve the consequential quarantine treatment.

[n42 — superseded by n48; agent; open] `open-matters/n42`

To compare the two batch-sizing approaches in n40–n41, need the actual static plan size and forecast-driven batch release series or a supported generation rule, initial material state, and a waiting/service outcome measure. Around-700 mean and perhaps-200 standard deviation in n39 alone cannot be turned into a distribution or a scheduling process; SAP or forecast/production records could supply sequences.

[n48 — supersedes n42; superseded by n53; agent; open] `open-matters/n48`

n40 has been clarified by n45: static plan is a dated series, not a single batch size; the two approach averages (n46) cannot stand in for their schedules, and n47's forecast formula lacks input sources and units. Meaningful comparison still needs dated static and forecast releases or the formula's current order-rate series, plan period and average order size, plus initial stock, horizon and waiting/customer-fill measure. The current net's separate timed external series remain appropriate placeholders.

[n53 — supersedes n48; agent; open] `open-matters/n53`

n51 resolves the main timing interpretation for the forecast formula: use the order rate at batch planning, not a later release-time recalculation, tentatively. Still need dated planning/release records or a supported generator, compatible formula input units, starting stock, a test horizon and waiting/customer-fill measure; SAP quarantine inclusion, customs, expiry and Flowbind delivery remain unresolved. Revisit snapshot timing if records contradict Elena's understanding.

[n59 — superseded by n76; agent; open] `open-matters/n59`

Lot-aware production must select oldest eligible stock per n55, potentially assemble enough material from several lots for one batch, and hold or release it consistently with n28. The current target representation has no completed implementation of that allocation; no policy comparison may rely on production/wait results until it is reconstructed and tested. Need evidence on split-lot consumption and the precise oldest-vs-earliest-expiry rule, then check allocation structure and executions.

[n60 — superseded by n64; agent; open] `open-matters/n60`

Shelf life lost during Chinese preparation, transit and quarantine (n56) is not yet represented: supply stages currently carry only stage time, not a linked lot ID or expiry date. Need to learn where expiry date comes from and how orders/shipments map to lots, then carry it through these stages and check expiry before quarantine release. Current write-off metric covers only lots supplied to usable stock.

[n64 — supersedes n60; superseded by n67; agent; open] `open-matters/n64`

n62 establishes that a manufacturer's certificate of analysis fixes Sonaflozin lot expiry before dispatch and shelf life counts down through transit, quarantine and storage. Current net still needs a certified-lot boundary at or before dispatch, expiry countdown during transit/quarantine and a link into usable lot stock; lot split/matching and expiry timing during preparation remain open and require records.

[n67 — supersedes n64; superseded by n71; agent; open] `open-matters/n67`

The net now carries a certified-lot boundary before dispatch and counts down shelf life through transit, quarantine and warehouse, with expired material diverted. Still open: whether one order maps to several lots, when the manufacturer fixes expiry relative to an outage/order, what happens if the certified lot expires before dispatch, and who bears pre-receipt loss. Certificate and SAP lot records would settle these and permit replacing the one-order-one-lot stand-in.

[n71 — supersedes n67; superseded by n73; agent; open] `open-matters/n71`

The one-order-one-lot stand-in is resolved adversely by n69: Sonaflozin orders can comprise multiple certified lots and exact lot sizes are not provided. Net must now allow partial dispatch with independent lot expiry. Certificate timing relative to outage, lot-to-order assignment and partial-dispatch timing still need records; FEFO production allocation and financial loss ownership remain open.

[n73 — supersedes n71; agent; open] `open-matters/n73`

The multiple-lots-per-order issue is now represented by n72's partial dispatch and remaining-order loop; exact lot sizes remain external inputs. The key unresolved identity problem is matching each certified lot to its purchase order when orders overlap. Also open: certificate issuance timing relative to outage, partial dispatch schedule, supplier replacement and financial ownership of pre-receipt expiry. FEFO allocation and the production completion path remain absent.

[n76 — supersedes n59; superseded by n78; agent; open] `open-matters/n76`

n75 resolves the split-lot production question: a batch can use multiple eligible lots, and only insufficient total released eligible stock should block it. The model still needs an implementation of lot-by-lot oldest-eligible allocation and quantity conservation, followed by tests; do not infer that a single-lot input arc meets the rule. Confirm whether 'oldest' in n55 means nearest expiry when receipt age and expiry order disagree.

[n78 — supersedes n76; superseded by n81; agent; open] `open-matters/n78`

n75 establishes that multiple eligible lots may jointly supply one batch, and n77 records a rejected attempt to implement arbitrary-lot allocation with a serialized dated book. Need a supported representation or externally supplied dated, expiry-ordered allocation decisions, plus confirmation whether 'oldest' means nearest expiry or earliest receipt (n55). Until one is available, production/wait metrics and purchasing comparisons stay unsupported.

[n81 — supersedes n78; agent; open] `open-matters/n81`

The priority-key ambiguity is resolved by n80: FEFO means earliest expiry among eligible released lots, and split-lot batches are permitted per n75. The current net still lacks a supported implementation of global FEFO allocation across arbitrary lot counts and a production completion path; serialized-lot kernel attempt failed TS99020 (n77). A supported Petri-net selection protocol or externally supplied validated lot allocations, followed by execution checks, is needed before purchasing/batch comparisons.

[n87 — superseded by n92; agent; open] `open-matters/n87`

To evaluate n83–n85, need definitions and data for customer order arrival/fulfillment, delay timing per planned production unit, and per-material expiry denominator, plus initial material lots and order pipeline over 104 weeks. None of those three target percentages/delays is mechanically enforced by the current net or experiment request. FEFO production (n81) and Flowbind fulfillment remain blocking dependencies.

[n92 — supersedes n87; superseded by n97; agent; open] `open-matters/n92`

On-time promised-date fulfillment is resolved for n83 by n90. Still need an operational customer-order/admission and shipping match, whether partial deliveries count, time-boundary treatment, unit-weighted production delay definition n84, and expiry denominator n85. FEFO allocation n81 remains absent; a possible spot cancellation has no supported rate or trigger (n91).

[n97 — supersedes n92; agent; open] `open-matters/n97`

Preferred fill scoring now clarified by n96: full requested quantity by promised date, with partial delivery not a success. Still need customer-order/shipping event matching, boundary-denominator rule, unit-weighted production delay definition n84, and per-material expiry denominator n85. FEFO production n81 and Flowbind fulfillment block model-derived service results; verify SAP metric treatment before comparing recorded fill.

## Delivery status [delivery]

[n18 — superseded by n26; agent; tentative] `delivery/n18`

As of the second exchange, the draft contains two strict reorder-calculation branches and a separate Chinese-supplier preparation/transit/quarantine timing branch, with no material binding or production connection. Tool-schema accepted and agent-reviewed for correspondence to n6 and n11–n15 at fragment level; net code diagnostics report no errors or warnings. No scenario or metric compilation, simulation, end-to-end behavior, or purchasing-policy adequacy has been checked. Next smallest structural evidence: which material the Chinese supplier supplies, then how usable stock and production demand interact.

[n26 — supersedes n18; superseded by n33; agent; tentative] `delivery/n26`

The draft now links Sonaflozin ordering to Chinese preparation, transit and provisional quarantine; Flowbind orders route by external instruction to Indian or German supplier but stop there. The named 14-day China-outage scenario has empty initial state. Latest inspected structure contains these paths and code diagnostics report no errors/warnings; this is tool-schema acceptance plus agent-reviewed fragment correspondence to n6, n11–n13, n19–n20, not execution or proof of policy adequacy. Inventory feedback, actual usable stock, expiry, demand, Flowbind delivery, customs delay and scenario/metric compilation remain untested or unrepresented.

[n33 — supersedes n26; superseded by n38; agent; tentative] `delivery/n33`

Latest inspected draft connects the Sonaflozin reorder/China supply path to aggregate usable stock and a batch-production gate; Flowbind has supplier-routing branches but usable deliveries are external. Two descriptive metrics report waiting production-order count and cumulative Sonic Flow units made. Tool-schema acceptance and code diagnostics (no errors/warnings), plus agent-reviewed static correspondence to n6, n11–n13, n19–n20 and n27–n30 are the only checks; scenario/metric compilation and behavioral execution have not occurred. Missing stock/demand initial state, inventory-position feedback, expiry, customs delays, Flowbind supply timing, customer-fill and waiting-cost rules prevent a purchasing-resilience conclusion.

[n38 — supersedes n33; superseded by n44; agent; tentative] `delivery/n38`

Latest inspected definition still contains the reordered Sonaflozin supply and production gate and external Flowbind path; labels now state material-specific units and flag uncertainty in SAP quarantine treatment. Structural review matches the stated strict reorder triggers, one-to-one recipe, and production wait condition; it remains partial because inventory position is externally supplied and no run/experiment has been executed. Code diagnostics reported no errors after last code edits; saved metrics and scenario have not been execution-compiled. Three-day quarantine is an agent placeholder, expiry and customs delay absent, and service cost/deadline unknown.

[n44 — supersedes n38; superseded by n50; agent; tentative] `delivery/n44`

The latest inspected draft contains two selectable scheduled-production inputs for forecast and static plan alongside the existing purchasing, Chinese Sonaflozin supply, Flowbind routing and material-dependent production paths. Two named China-outage scenarios select the alternatives but have empty initial states, so they are not yet meaningful policy runs. Net code diagnostics report no errors; schema acceptance and agent static structural review only. No saved-scenario/metric execution compilation, simulation, reliability or cost comparison has been performed. Missing recorded static plan, forecast series, initial inventory, a horizon and outcome criterion, plus SAP quarantine configuration, expiry/customs and Flowbind fulfillment remain consequential.

[n50 — supersedes n44; superseded by n61; agent; tentative] `delivery/n50`

Latest inspected draft now structurally carries forecast sizing by the stated product of supplied factors and static production as a separately supplied dated series; selected plan releases due batches under the two named China-outage scenarios. Net function diagnostics report no errors after code edits; tool-schema acceptance and agent-reviewed static structure only. With both scenario initial states empty and inputs/units unresolved, no scenario or metric execution, simulation, cost comparison or reorder adequacy claim is supported. Retain the three-day agent quarantine placeholder and open expiry, customs, Flowbind delivery, inventory feedback and customer-service measures.

[n61 — supersedes n50; superseded by n68; agent; tentative] `delivery/n61`

After n54–n56, inspected draft is explicitly partial: reorder and supplier timing paths plus scheduled production demand remain, and usable stock is now lot-based with countdown-to-expiry and write-off. Aggregate stock production and waiting/production metrics were removed because they would misstate eligibility; planned production has no completion path. Net code diagnostics report no errors/warnings and static structure was reviewed against lot expiry/write-off intent; no scenario/metric execution, behavioral test, or policy adequacy claim. The China/Flowbind receipt-to-lot connection and FEFO allocation are open; three-day quarantine is an agent placeholder and expiry during transit/quarantine remains omitted.

[n68 — supersedes n61; superseded by n74; agent; tentative] `delivery/n68`

Latest inspected draft has Sonaflozin order/preparation connected through externally certified lot, countdown through transit and quarantine, and conditional release or expiry to lot-level stock/write-off; Flowbind receipts and lot-aware production remain incomplete. Net function diagnostics show no errors/warnings after all code changes, and static fragment review finds the intended paths and guards. No scenario/metric execution compilation, simulation, FEFO allocation or purchasing-policy comparison has occurred. Two-week outage scenarios have empty initial state, and the one-order-one-lot match, 3-day quarantine and certificate-issuance timing remain agent stand-ins.

[n74 — supersedes n68; superseded by n79; agent; tentative] `delivery/n74`

Latest inspected draft carries partial dispatch of multiple certified Sonaflozin lots against an order balance, independent lot expiry and post-quarantine release/write-off; it no longer assumes one lot equals an order. Flowbind fulfillment and lot-aware production still lack complete paths, and the China-outage scenarios have empty initial states. Net code diagnostics report no errors/warnings after modification; structural review finds the partial-dispatch loop and expiry paths. No scenario/metric execution compilation, simulation or purchasing-policy result has occurred. Cross-order certificate matching and dispatch timings remain stand-ins.

[n79 — supersedes n74; superseded by n89; agent; tentative] `delivery/n79`

The inspected draft still includes split-lot supplier dispatch, independent Sonaflozin lot expiry, quarantine and write-offs, and separate demand-policy schedules, but planned batches have no lot-aware production completion path. A proposed serialized-lot inventory book was removed after compiler TS99020 rejection; net diagnostics subsequently returned no errors/warnings. No saved scenario/metric compilation in execution, simulation or policy comparison has occurred. The current target implementation cannot use that attempted book technique; FEFO across arbitrary lots remains unresolved, and all scenarios have empty initial states.

[n89 — supersedes n79; superseded by n94; agent; tentative] `delivery/n89`

Elena has supplied 104-week team targets: ≥95% customer-order fill, production delay below about 0.25 week per planned unit, and <5% expiry separately per material (n83–n86). Inspected net remains a checked partial structure for ordering, Sonaflozin certified supply, expiry and demand scheduling, without FEFO production or customer fulfillment. No target metric, experiment, scenario execution or threshold enforcement has been checked; net compilation after the rejected book attempt was clean. Definition and input gaps n81 and n87 prevent any claim that purchasing choices meet these targets.

[n94 — supersedes n89; superseded by n104; agent; tentative] `delivery/n94`

Current inspected partial draft additionally has customer-order promise clocks and an empty past-promise outcome placeholder, but no shipping or fulfillment path and no fill-rate metric. Net function-code diagnostics remain clean after changes; static review confirms only the request/deadline scaffold, not on-time service behavior. Targets n90, n84 and n85 remain Ledger-only restrictions, not mechanically enforced or compared. FEFO production n81, 104-week data, Flowbind fulfillment, customer shipping and input definitions still block a credible purchasing comparison.

[n104 — supersedes n94; superseded by n109; agent; tentative] `delivery/n104`

Latest inspected net keeps production and customer-fill paths incomplete but separates Sonaflozin warehouse-after-release expiry from transit and other pre-release expiries, matching Elena's provisional measurement distinction n99 without asserting a 5% rate. Mutations were tool-schema accepted, code diagnostics report no errors/warnings, and fragment structure was reviewed against n99–n101. No scenario/metric execution compilation, simulation, denominator validation or 104-week comparison has occurred. FEFO production, Flowbind supply timing, customer shipping, initial data, SAP quarantine treatment and the team's actual expiry metric remain unresolved.

[n109 — supersedes n104; superseded by n118; agent; tentative] `delivery/n109`

Latest inspected partial net now tracks elapsed waiting days on planned batch requests as well as separate warehouse/transit/pre-release expiry quantities and customer promised-date clocks. Net mutation and code diagnostics were accepted with no remaining errors, and structure was reviewed for correspondence to n105–n106; no execution or completed production/shipping path has been checked. Without FEFO production start, no per-planned-unit average delay, on-time fill or policy comparison can be computed. The ~one-week run time is not encoded as exact, and all outage scenarios still lack initial data.

[n118 — supersedes n109; superseded by n121; agent; tentative] `delivery/n118`

Latest inspected draft has timing paths for both materials: Sonaflozin's independently certified lots through China, and Flowbind's approximate India/Germany preparation/transit/quarantine to a lot-data boundary. Dated batch and customer-promise inputs, planned-batch waiting clocks, and separated Sonaflozin expiry quantities remain. Tool-schema mutations and code diagnostics returned no errors/warnings, and static fragments were reviewed against n112–n116; no scenario/metric execution compilation or simulation. Quarantine durations are agent three-day stand-ins, German priority and Flowbind lot expiry are not implemented, FEFO production and customer fulfillment are absent, so no 104-week target or purchasing comparison is supported yet.

[n121 — supersedes n118; superseded by n126; agent; tentative] `delivery/n121`

Latest inspected draft retains the Flowbind India and German approximate lead-time paths and has no extra German priority/queue mechanism, consistent with Elena's correction n119; the place/transition descriptions were updated to remove the unsupported priority implication. Code diagnostics after the last executable edit were clean, and this label-only revision was statically checked by inspection. No scenario/metric execution, simulation or 104-week performance result exists. The core gaps remain FEFO production, lot-level Flowbind receipts/expiry, inventory-position feedback, customer fulfillment, initial state and exact team expiry definition.

[n126 — supersedes n121; superseded by n137; agent; tentative] `delivery/n126`

Latest returned definition retains both outage scenarios with their source-mode and additive-outage overrides and descriptions requiring the same SAP starting state; a transient override-clearing effect was repaired (n125). Structural tool/schema checks and clean net code diagnostics are the highest checks so far; saved scenario/metric execution compilation and behavior have not been exercised. The 104-week comparison is still blocked by empty starting inputs, FEFO production, customer shipping and metric-definition gaps.

[n137 — supersedes n126; superseded by n142; agent/inferred; tentative] `delivery/n137`

The partial net now additionally has a structurally inspected finished-goods quarantine and external QA-clearance path (n136), consistent with n133–n135, but no FEFO production completion or customer shipment path. Both outage scenarios still show identical missing starting-state inputs rather than loaded SAP data (n130–n131). New executable fragment had no net function-code diagnostics; saved scenario and metric compilation/execution, simulations and 104-week policy comparison remain unperformed. Auto-layout request's document effect is unknown; latest read shows provisional positions. Cannot claim on-time fill or an effective purchasing choice.

[n142 — supersedes n137; agent/inferred; tentative] `delivery/n142`

With Elena's authorization for clearly flagged guesses (n138), the inspected net now has a *draft structural path* from a planned batch through an external FEFO allocation gate, approximate production, finished-goods quarantine and external quality clearance to an aggregate finished-goods pool and full-order shipment, with candidate order-fill and started-batch-wait metrics (n140). Net function-code diagnostics clean, but this is tool-schema-accepted and agent-reviewed structural correspondence only, not behavioral execution or validated policy comparison. Crucially the FEFO certificate does not debit or verify physical lots (n141), so purchasing/expiry cannot correctly drive batch starts; both outage scenarios still have empty starting states (missing SAP snapshot) and dated demand, plans and quality inputs absent. No 104-week comparison, scenario/metric execution compile or simulation was performed; expiry-rate denominator and SAP treatment remain unresolved. Auto-layout attempt returned unknown effect; latest inspected positions retained the new provisional coordinates. The draft is more end-to-end as an account skeleton, not a decision-grade model.
