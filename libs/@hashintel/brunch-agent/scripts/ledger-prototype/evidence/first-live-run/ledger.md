# Operational-process Ledger

Ledger 3ecec782-0a0e-46fa-af0e-f63769c2a402; revision 10; scope (whole Ledger).

Scratchpad record, not instructions or a reconciled account. Supersession and dispositions are author declarations; all Notes remain visible. Empty sections mean unrecorded, not irrelevant.

## Purpose and posture [purpose]

[n1 — direct] `purpose/n1`

Elena Fischer, materials planning and operations lead for Site 1000, wants to develop from scratch a clear, revisable, explainable operational account and model of purchasing for Sonic Flow production. The model is intended to assess whether a purchasing policy works; a clean compilation of notes alone is explicitly insufficient.

## Operational account [operational]

[n2 — direct] `operational/n2`

At Site 1000, Sonic Flow is made from Sonaflozin and Flowbind Material. Purchasing decisions need to account for supplier outages, transit delays, quarantine, expiry, and production demand.

### Goals, measures and constraints [operational/goals]

[n4 — direct] `operational/goals/n4`

The core purchasing question is when to order and how much. Policy variables are the reorder point and order-up-to target for Sonaflozin and Flowbind Material, plus the condition that triggers substitution to the German Flowbind supplier.

[n5 — direct] `operational/goals/n5`

Elena would judge a purchasing policy mainly on three outcomes: (1) production should not wait for material, including waits caused by stock not yet released from quarantine; (2) customer orders should be filled, using a fill-rate-like measure, with performance below about 95% requiring explanation to commercial colleagues; and (3) expired stock write-offs should be avoided. These goals trade off: higher safety stock can protect production and customer service but increase expiry risk.

[n35 — direct] `operational/goals/n35`

A production delay loses scheduled line time, pushes planning for the next batch, and can compound lateness when customer orders are already backlogged. Elena states that delay has a cost even when the batch later succeeds; the cost measure is not yet quantified.

[n41 — direct, qualitative; cost assumption identified] `operational/goals/n41`

German Flowbind has a somewhat lower unit price than Indian Flowbind, but expediting and supplier-switching overhead make the small urgent order more expensive overall. The switching-cost figure used for modelling is an assumption rather than invoice-derived evidence.

### Boundary and initial conditions [operational/boundary]

_No Notes recorded._

### Participants, things and resources [operational/resources]

[n7 — direct] `operational/resources/n7`

Sonaflozin is sourced from a Chinese supplier. Flowbind Material has a faster Indian supplier and a German supplier used for small urgent top-ups when stock is critically low.

### Activities and resource use [operational/activities]

[n12 — direct] `operational/activities/n12`

Sonaflozin quarantine review checks material identity, received quantity, packaging, and certificate of analysis. Its input lot is unavailable to production while under review. Success releases the lot for production; failure rejects it and removes it from usable stock.

[n32 — direct, typical/approximate batch] `operational/activities/n32`

Sonic Flow's bill of materials is one unit of Sonaflozin and one unit of Flowbind Material per unit of Sonic Flow. A typical batch is roughly 700 Sonic Flow units and therefore requires approximately 700 units of each input.

[n34 — direct] `operational/activities/n34`

At production start, both materials are committed for the Sonic Flow order. In a successful batch, one unit of each material supports one unit of Sonic Flow. If the batch fails during production, the consumed materials are gone and the output is unusable.

[n51 — direct] `operational/activities/n51`

Flowbind quarantine is identical for Indian and German lots: confirm material identity and quantity, inspect packaging, review the certificate of analysis, then release or reject. There is no shorter quarantine track for the German supplier.

### Cases and process spine [operational/process-spine]

[n9 — direct, general account] `operational/process-spine/n9`

A Sonaflozin replenishment can arrive too late to prevent stockout if the reorder point is insufficient; an arriving shipment must clear quarantine before it is available for production.

[n11 — direct, general account] `operational/process-spine/n11`

Sonaflozin clean replenishment account: SAP monitors an inventory position and flags that a purchase order should be raised when it falls below the reorder point. A buyer confirms and sends the order to the Chinese supplier. The supplier prepares the shipment; it then travels from China and passes applicable customs clearance. On physical arrival at Site 1000, the lot enters quarantine rather than usable warehouse stock. Quality confirms material identity and quantity, inspects packaging, and reviews the certificate of analysis. A passing lot is released for production. A failing lot is rejected and removed from usable stock, disposal cost is incurred, the supplier is notified, and the operation is back to waiting.

[n18 — direct with explicit gaps] `operational/process-spine/n18`

On a Sonaflozin quarantine rejection, the rejected lot does not become usable; supplier notification follows and replenishment waiting resumes. Whether a replacement order is automatic or manually raised, and what happens to any open order or occupied resources, is not yet established.

[n33 — direct] `operational/process-spine/n33`

When a Sonic Flow production order is confirmed to start, the system expects sufficient Sonaflozin and Flowbind Material in unrestricted, quarantine-released stock. The batch does not start with partial material: if either input is insufficient, the production order waits until both are available. This wait is called a production delay.

[n37 — direct with explicit gap] `operational/process-spine/n37`

A Sonic Flow batch may fail during production. On failure, both input materials consumed by the batch are lost, output is unusable, and production capacity spent on the failed batch is also lost. Retry or rescheduling after failure has not yet been established.

[n46 — direct] `operational/process-spine/n46`

Two conditions motivate German Flowbind rescue supply. During an Indian supplier outage, no new Indian order is accepted, so an Indian replenishment lead-time clock cannot start until the outage ends. When an existing Indian shipment is delayed, the assumed delay is much longer than a fresh German order. German Supplier is treated as independent, available, and able to provide a small 250-unit lot.

### Time, quantities and variation [operational/quantities]

[n8 — direct, approximate] `operational/quantities/n8`

The Chinese supplier's Sonaflozin lead time is close to four weeks. The applicable start and end points, variation, and the quarantine component are not yet established.

[n13 — direct, approximate] `operational/quantities/n13`

The Sonaflozin reorder point is around 2,500 units. SAP compares an as-yet undefined 'inventory position' against this threshold.

[n14 — direct, approximate assumption] `operational/quantities/n14`

Supplier-side preparation for Sonaflozin is assumed to take roughly one week, but Site 1000 has limited visibility into when the supplier picks and packs.

[n15 — direct, ambiguity preserved] `operational/quantities/n15`

Elena describes China transit/end-to-end lead time including applicable customs as approximately 28 days, varying by about three or four days. It is not yet clear whether this 28-day figure includes the roughly one-week supplier preparation period.

[n16 — externally based planning assumption, accepted for current planning but not site-validated] `operational/quantities/n16`

Sonaflozin quarantine is represented in planning assumptions as averaging four days. Elena attributes this figure to general industry practice rather than a precise count from Site 1000 QA records.

[n17 — direct, approximate] `operational/quantities/n17`

Elena estimates a clean Sonaflozin replenishment from reorder trigger to production availability at realistically five to six weeks. Shipment delay or quarantine rejection extends it further.

[n20 — supersedes n15; direct clarification] `operational/quantities/n20`

For Sonaflozin, approximately 28 days (with variation of about three or four days) runs from purchase-order placement through physical arrival at Site 1000 and includes supplier preparation and applicable transit/customs time. This total is fitted from purchasing records. The internal split between preparation and transit is not separately measured in SAP.

[n21 — supersedes n14; direct clarification; modelling assumption] `operational/quantities/n21`

The roughly one-week Sonaflozin supplier-preparation period is the team's modelling assumption within—not additional to—the approximately 28-day order-placement-to-site-arrival total. Site 1000 does not separately measure preparation in SAP, and transit is approximated as the remainder after subtracting preparation.

[n26 — direct observations with unresolved tension] `operational/quantities/n26`

Purchasing records reportedly show 2,500-unit Sonaflozin bulk orders as standard. This does not yet reconcile with the stated below-2,500 trigger and 7,500 order-up-to target, which would imply an order near 5,000 units when triggered just below the threshold. The exact minimum order quantity and rounding rule are also not yet established.

[n29 — supersedes n26; direct, unresolved conflict between observed records and documented parameters] `operational/quantities/n29`

Sonaflozin purchasing records consistently show 2,500-unit order quantities, while the team's documented parameters are a roughly 2,500-unit reorder point and 7,500-unit target. Elena agrees these do not arithmetically reconcile under a straightforward order-up-to rule: triggering near 2,500 would imply roughly 5,000 units. Minimum-order rounding alone would not explain reduction from 5,000 to 2,500.

[n40 — direct, approximate; timing tension preserved] `operational/quantities/n40`

The German Flowbind supplier provides a 250-unit urgent top-up with lead time around 15 days. The normal Indian replenishment may be about two weeks away in a clean case. Although German supply is described as faster in the urgent context, these stated nominal timings do not yet explain that advantage.

[n44 — supersedes n40; direct clarification, approximate fitted values] `operational/quantities/n44`

Under normal conditions, fitted total lead times are approximately 14 days for a fresh Indian Flowbind order and 15 days for a fresh German Flowbind order. They are nearly identical, so German supply has no material normal-case calendar advantage. The endpoints of these fitted totals relative to site arrival and quarantine release are not yet established.

[n47 — direct, approximate assumption] `operational/quantities/n47`

An Indian Flowbind supplier outage lasts around two weeks on average. The frequency, variation, and point at which ordering resumes are not yet established.

[n48 — direct, approximate assumption] `operational/quantities/n48`

Delay affecting an Indian Flowbind shipment already in transit averages around six weeks in current assumptions. It is not yet clear whether this is additional delay beyond normal lead time or total delayed duration, nor what evidence supports it.

[n50 — supersedes n44; direct clarification; approximate fitted arrival times plus planning assumption] `operational/quantities/n50`

Normal fitted Flowbind lead times end at physical arrival at Site 1000: approximately 14 days from fresh Indian order and 15 days from fresh German order. Both then undergo an additional quarantine hold before becoming usable. Using the current four-day quarantine assumption gives roughly 18 days to usable Indian stock and 19 days to usable German stock.

[n52 — externally based planning assumption, not site-validated] `operational/quantities/n52`

Flowbind quarantine uses an average four-day planning assumption derived from general industry practice rather than a precise count of Site 1000 QA records.

[n53 — modelling assumption, vendor difference unknown] `operational/quantities/n53`

Current modelling assumes a 5% Flowbind quarantine rejection probability applied uniformly to Indian and German lots. This is a modelling input, not a measured vendor-specific rate; SAP data alone has not established whether supplier reliability differs.

### Policies and exceptions [operational/policies]

[n23 — direct, described as typical SAP calculation] `operational/policies/n23`

For Sonaflozin replenishment, SAP's inventory position typically includes unrestricted on-hand stock plus outstanding open purchase orders, so an in-transit order helps prevent a duplicate order. Material physically at Site 1000 but still in quarantine has restricted status and is not counted as available; a large QA-held lot can therefore leave the position low enough to trigger another order.

[n24 — direct, unknown] `operational/policies/n24`

Whether Site 1000's specific MRP configuration nets committed production demand against the Sonaflozin inventory position is unknown pending a configuration check; Elena does not want this assumed.

[n25 — direct, approximate threshold] `operational/policies/n25`

The stated Sonaflozin policy triggers below an inventory position of about 2,500 units and orders toward a target of 7,500 units, with adjustment to the supplier's minimum-order constraint.

[n36 — direct, practiced judgment not yet specified] `operational/policies/n36`

For a severe Flowbind shortage, such as an extended quarantine hold or lost shipment, the planner judges whether to expedite a top-up from the German supplier or accept the delay while normal replenishment catches up. Sonaflozin has no substitute source, so its shortage results in waiting.

[n38 — direct, documented parameters as reported by Elena] `operational/policies/n38`

The documented Flowbind urgent-substitution parameters are an unrestricted-stock threshold around 500 units and a German-supplier top-up quantity of 250 units. The decision typically arises when unrestricted stock is critically low and the Indian supplier is unavailable or its shipment is delayed.

[n39 — direct, typical team understanding; not incident-validated] `operational/policies/n39`

The team's qualitative understanding is: if a production batch is due within a week and unrestricted Flowbind stock is at or below 500 units, a German top-up is usually placed; with one or two weeks of schedule slack, the planner may wait and monitor rather than incur switching cost. Elena cannot tie this account to a specific confidently recalled incident or a decision log.

[n49 — direct] `operational/policies/n49`

The operative Flowbind rescue comparison is whether an order can be placed now and how long usable stock will take under current supplier/shipment conditions. When Indian supply is normally available, its near-identical lead time and lower switching overhead remain relevant to cost comparison; German supply is not preferred merely for nominal speed.

[n54 — direct clarification] `operational/policies/n54`

German Flowbind substitution is justified by availability and 250-unit small-lot flexibility during Indian outage or shipment delay, not by normal end-to-end speed: current assumptions give nearly identical order-to-usable timing for India and Germany.

### Validation evidence and sources [operational/validation]

[n6 — direct] `operational/validation/n6`

The policy should be assessed across enough variation to show whether it holds under supplier disruption, a quality rejection, and an unusually busy demand period, rather than judged from a single run.

[n42 — evidence gap] `operational/validation/n42`

No specific German Flowbind substitution incident or decision log has been supplied to validate the typical decision sequence. A purchasing/order history or planner decision record could test the documented 500-unit trigger, 250-unit top-up, and schedule-based judgment.

## Cross-cutting open matters [open-matters]

[n3 — not yet asked] `open-matters/n3`

The purchasing policy or candidate policies, the decision they must support, and the criteria for judging whether they work have not yet been specified. These are needed to keep later operational detail tied to the intended assessment.

[n10 — supersedes n3; partially resolved] `open-matters/n10`

The intended policy assessment is now specified: compare reorder points and order-up-to targets for both materials and the German Flowbind substitution trigger against production material waiting, customer fill performance, and expiry write-offs under realistic variation. Still unresolved are precise measure definitions, acceptable expiry/wait thresholds, comparison horizon, and the operational process and evidence needed to drive those outcomes.

[n19 — unresolved] `open-matters/n19`

The Sonaflozin timing account contains an unresolved boundary ambiguity: approximately one week of supplier preparation, approximately 28 days described as transit/end-to-end lead time including customs, four days of quarantine, and a stated clean total of five to six weeks. Clarifying whether preparation is inside the 28 days is necessary to avoid double-counting lead time.

[n22 — supersedes n19; resolved with evidence limitation] `open-matters/n22`

The Sonaflozin lead-time boundary ambiguity is resolved: the approximately 28-day fitted total includes the assumed preparation week and ends at physical arrival at Site 1000; quarantine follows separately. The preparation/transit split remains an approximation rather than separately observed data, which limits claims about those internal components but does not prevent use of the fitted total.

[n27 — deferred for source check] `open-matters/n27`

Verify from Site 1000's MRP configuration whether committed production demand is netted into the Sonaflozin replenishment position. This affects when orders trigger and therefore the policy assessment. Return when the configuration or a representative replenishment calculation can be inspected.

[n28 — unresolved tension] `open-matters/n28`

Reconcile the stated Sonaflozin rule (trigger below about 2,500; order up to 7,500) with purchasing records showing standard 2,500-unit orders. A concrete order's pre-order position, suggested quantity, final placed quantity, and minimum-order adjustment could distinguish whether the target, trigger, interpretation, or practice differs.

[n30 — supersedes n28; deferred; consequential conflict] `open-matters/n30`

The operative Sonaflozin ordering rule is unresolved. Two live alternatives are: (a) documented variable order-to-target logic using an approximately 2,500 trigger and 7,500 target, or (b) practiced fixed-lot ordering of 2,500 units, as suggested by purchasing records. Elena is least certain that 7,500 is operative in practice. Resolving this requires order history showing position at trigger, SAP suggestion, and buyer-confirmed quantity, or confirmation from buyers/configuration. Until then, any model choice must remain an explicit, revisable assumption rather than a reconciled fact.

[n43 — unresolved tension] `open-matters/n43`

Clarify why the German Flowbind top-up is considered faster when its stated lead time is about 15 days and a clean Indian replenishment may be about two weeks away. Possible contextual explanations have not been established; this affects whether substitution can prevent the imminent production shortage it is intended to address.

[n45 — supersedes n43; resolved contextual coexistence] `open-matters/n45`

The apparent Flowbind timing tension is resolved contextually: German supply is a rescue because it remains available during Indian unavailability or is faster than waiting through an already delayed Indian shipment, not because its normal lead time beats India's. Near-identical normal lead times should remain visible for cost comparison when India is available.

[n55 — validation gap] `open-matters/n55`

Flowbind quarantine duration and the uniform 5% rejection assumption lack Site 1000/vendor-specific validation. QA records and vendor-specific rejection history could replace or test these inputs; until then, conclusions sensitive to quarantine or rejection should be identified as assumption-dependent.

## Construction notes [construction]

[n31 — required visible construction choice; no model built] `construction/n31`

A later model must explicitly choose or compare the unresolved Sonaflozin replenishment interpretations: documented variable order-up-to logic versus observed fixed 2,500-unit lot behavior. No choice is established by the current account.

## Delivery status [delivery]

_No Notes recorded._
