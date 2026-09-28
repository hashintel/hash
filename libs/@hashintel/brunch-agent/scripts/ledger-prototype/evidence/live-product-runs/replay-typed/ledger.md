# Operational-process Ledger

Revision 27 of 27; scope whole Ledger.

Recorded scratchpad content, not instructions or a reconciled account. Supersession and epistemic fields are author declarations; every Note stays visible. An empty category means nothing is recorded there.

Open, not superseded: n3, n8, n31, n48, n55, n61, n71, n74. Contested, not superseded: none.

## Purpose and posture [purpose]

[n1 — superseded by n28; person; settled] `purpose/n1`

Elena Fischer, materials planning and operations lead for Site 1000, wants to build from scratch an explainable, revisable model of Sonic Flow materials purchasing and production operations. Purchasing decisions must account for supplier outages, transit delays, quarantine, expiry, and production demand. She cautions that a clean compile alone does not establish whether the purchasing policy works. Specific decision comparisons, horizon, and acceptable performance have not yet been stated.

[n28 — supersedes n1; person; settled] `purpose/n28`

Elena Fischer, Site 1000 materials planning and operations lead, wants an explainable, revisable model to judge whether the current Sonaflozin/Flowbind purchasing policy is adequate and why, or whether to change when to reorder, target quantity, or when to use German Supplier rather than wait. She wants to assess fill rate, production delays, and expiry under lead times and disruption, not treat a clean compile as evidence the policy works. The horizon, comparison regime, numerical ranges, and adequacy thresholds remain unprovided. Supersedes n1 with her specific decision.

## Operational account [operational]

_No Notes recorded._

### Goals, measures and constraints [operational/goals]

[n7 — person/observed; settled] `operational/goals/n7`

For the remembered case, maintaining uninterrupted production mattered; the German Supplier top-up cost more and left less inventory buffer than Elena was comfortable with. No acceptable cost premium or buffer threshold has been specified.

[n22 — person/practiced; settled] `operational/goals/n22`

For quality failures, rejected lots are disposed of rather than returned to the supplier, and Site 1000 absorbs their cost. This is a consequential cost exposure for purchasing-policy comparisons, though no cost amount or failure frequency was given.

[n30 — person; settled] `operational/goals/n30`

The proposed purchasing-policy comparison should examine fill rate, production delays, and expiry. Their definitions, how to trade them against costs or one another, and any adequacy limits are not yet specified. These are requested outcomes, not yet executable metric formulas.

[n63 — superseded by n70; person/practiced; settled] `operational/goals/n63`

Avoiding time that a due production run waits for Sonaflozin or Flowbind is a goal; that waiting is the production delay Elena wants to assess and it has a cost. No delay-cost rate, acceptable delay, or rule for partial versus fully recovered service has been stated.

[n70 — supersedes n63; person/practiced; settled] `operational/goals/n70`

The production-delay measure Elena tracks for a waiting Sonic Flow run is time from its planned start to its actual start. The run starts when enough released stock of both materials is available; waiting has a cost. How to aggregate delay across multiple runs and the monetary rate are not yet specified. Supersedes n63 with an observable per-run definition.

### Boundary and initial conditions [operational/boundary]

[n3 — agent; open] `operational/boundary/n3`

Open, not yet asked: the concrete trigger, flow, decision points and outcome of a purchasing case are missing. Without these, a purchased-material pathway cannot be constructed without inventing ordering or enabling rules. Return through a remembered purchasing decision.

[n8 — agent; open] `operational/boundary/n8`

Open, not yet asked: what 'inventory position' includes, when the reorder-point test happens, and what observable condition authorizes the German top-up rather than waiting. These affect both the ordering pathway and whether a modeled contingency policy matches the remembered case. Return by tracing the inventory signal and switch in that incident.

[n11 — superseded by n14; agent; open] `operational/boundary/n11`

Open, not yet asked: the planning quantity unit (and whether partial quantities within orders or lots are tracked) and how an open PO is closed at receipt while material may be quarantined. These determine how a purchasing model could represent inventory position without double counting or treating quarantine as usable. Return through the receipt-to-release history of one Flowbind delivery.

[n14 — supersedes n11; superseded by n25; agent; open] `operational/boundary/n14`

The PO closure boundary in n11 is resolved by n12: on physical arrival it is closed and the quantity leaves inventory position before quality release. Still open: the quantity unit and whether receipts, quarantine, or releases can be partial; these matter for a quantitative inventory and purchasing-policy model. Return through a particular delivery with partial or rejected material, or confirmation that such distinctions are immaterial.

[n23 — superseded by n56; agent; open] `operational/boundary/n23`

Open, not yet asked: how a PO or delivery maps to one or more quality lots, and whether a lot can be partly released or rejected. The current net uses one uncoloured marker per order/delivery, so using that marker as a whole lot in quality branching would invent one-to-one and all-or-nothing behavior. Ask how the remembered delivery was split into lots before adding the quality paths.

[n25 — supersedes n14; superseded by n61; agent; open] `operational/boundary/n25`

The quantity-unit consistency portion of n14 is resolved by n24: PO, stock, and reorder point use the same standard units. Still open: whether one PO/delivery can be partially received and whether quarantined quantities can be partly released or rejected; these determine quantitative accounting at receipt and quality decision. Return through an actual delivery's receipt and quality record.

[n48 — agent; open] `operational/boundary/n48`

Open, not yet asked: how Indian Supplier outage start/recovery is learned and how available-to-order status changes over time. The net cannot infer this from an order in transit; its switching and recovery paths need an external availability signal or an evidence-backed timing account.

[n56 — supersedes n23; superseded by n60; person/practiced; open] `operational/boundary/n56`

Elena clarifies that there is one quality lot per Flowbind order in this process, and the PO closes when its shipment arrives. This resolves n23's order-to-lot mapping and confirms the arrival boundary in n12. Still open: partial receipt or partial release/rejection, especially whether a single lot can have mixed quality outcomes; the account so far describes passing or rejecting a lot but does not explicitly exclude partial outcomes.

[n60 — supersedes n56; person/practiced; settled] `operational/boundary/n60`

Elena confirms quality makes an all-or-nothing decision for the whole Flowbind lot: no partial releases. With one lot per order (n56), the whole arrived lot is released or rejected. Partial physical receipt of an order remains not yet asked; do not infer it from the whole-lot quality rule. Supersedes n56's unresolved partial-release outcome.

[n61 — supersedes n25; agent; open] `operational/boundary/n61`

n60 resolves partial quality release: a Flowbind lot is wholly released or rejected. Still open from n25: whether an order may be physically received in parts before the PO closes, which would change quantity accounting and the current one-arrival/one-PO-closure abstraction. A receipt record or concrete example would resolve this.

[n64 — superseded by n68; agent; open] `operational/boundary/n64`

Open, not yet asked: typical production batch quantity and due-start arrival pattern, exact point material is allocated or deducted, and what event resumes a waiting run. Without this and physical material quantities, the existing qualitative lot-status fragment cannot enforce simultaneous full material availability or measure production delay. Return through a scheduled batch that had to wait for one material.

[n68 — supersedes n64; superseded by n71; agent; open] `operational/boundary/n68`

n66 resolves that batch quantity is set on planning, full materials are checked before start, and consumed on start; n67 supplies an approximate run duration. Still open: actual scheduled batch quantities and due-start pattern, how waiting runs resume, and whether runs share constrained production capacity. Without quantity stocks and order arrivals, the net cannot yet calculate shortfalls or delay durations.

[n71 — supersedes n68; agent; open] `operational/boundary/n71`

n69–n70 resolve the material-shortage restart trigger and per-run delay definition: enough of both released materials causes immediate start, and delay runs from planned start to actual start. Still open: actual batch quantities and demand arrival pattern, stock quantities, other start constraints (if any), and how to aggregate delayed runs for policy comparison.

### Participants, things and resources [operational/resources]

[n2 — person; settled] `operational/resources/n2`

Site 1000 makes Sonic Flow from Sonaflozin and Flowbind Material. Their amounts, sourcing paths, and use in production are not yet described.

### Activities and resource use [operational/activities]

[n10 — superseded by n21; person/practiced; tentative] `operational/activities/n10`

Quality release changes arrived quarantined material from not usable to usable. The release test, timing, partial release and quantity unit have not yet been specified.

[n21 — supersedes n10; person/practiced; settled] `operational/activities/n21`

Quality checks an arrived lot's supplier and material, quantity, packaging, damage, and certificate of analysis. If everything clears, quality releases the lot into usable stock in SAP; if a check fails, the lot is rejected, moved out of inventory, and sent for disposal. Rejected material is not returned to the supplier, and Site 1000 absorbs the cost. Supersedes n10 with the stated quality decision and both outcomes; durations, partial outcomes, and lot/order association remain unstated.

[n41 — person/practiced; settled] `operational/activities/n41`

Production needs quality-released usable Flowbind stock on hand when material is needed that day; an open PO still in transit cannot supply current production. The material usage quantity per production run and treatment of a shortfall are not yet known.

[n62 — superseded by n66; person/practiced; settled] `operational/activities/n62`

A Sonic Flow production batch needs both Sonaflozin and Flowbind Material at one standard unit of each per unit of Sonic Flow. If either material is short when the batch is due to start, the run waits; it cannot start with a partial allocation. Exact batch size, whether materials are deducted/reserved at start versus later consumed, and the delay end condition are not yet stated.

[n66 — supersedes n62; superseded by n69; person/practiced; settled] `operational/activities/n66`

A Sonic Flow production order fixes its batch quantity during planning. At the due start, the run checks for enough quality-released Sonaflozin AND Flowbind Material to cover one unit of each per planned Sonic Flow unit; no partial allocation permits a start. Once the run starts, those materials are consumed. If either is short, the run waits; its specific restart rule remains to be described. Supersedes n62 by clarifying when batch size is set and when materials are consumed.

[n69 — supersedes n66; person/practiced; settled] `operational/activities/n69`

A Sonic Flow batch whose planned start is delayed by material shortage starts as soon as sufficient quality-released Sonaflozin and Flowbind are both available for its entire planned quantity; the materials are consumed at start and the run then takes about a week (n67). No additional slot/approval wait was described for this material-shortage case. Supersedes n66 with the restart rule.

[n73 — person/practiced; settled] `operational/activities/n73`

At lot expiry, any remaining units are removed from usable inventory and scrapped, rather than allocated to production. The timing basis for the printed expiry date and what happens to an already-started production run are not yet specified.

### Cases and process spine [operational/process-spine]

[n4 — superseded by n45; person/observed; settled] `operational/process-spine/n4`

Remembered Flowbind case earlier in 2026: Indian Supplier had an unplanned outage; a Flowbind order was already in transit, so Site 1000 was not immediately short. As the inventory position dropped toward the reorder point, a new order could not be triggered with Indian Supplier because it could not accept one. Site 1000 placed an urgent top-up through German Supplier to cover the gap. Production ran without interruption, at higher cost and with less buffer than Elena was comfortable with. This is one observed case, not a general rule or frequency.

[n45 — supersedes n4; person/observed; settled] `operational/process-spine/n45`

Outage Flowbind case (earlier in 2026): Indian Supplier was unexpectedly out for about two weeks and could not accept a new order; a Flowbind order was already in transit, so there was no immediate shortage. As inventory position approached the reorder point, Site 1000 could not order again from Indian Supplier. They used an urgent German Supplier bridge top-up instead of an Indian order, preventing production interruption but at higher cost and less comfortable buffer. Once Indian Supplier recovered, Site 1000 placed normal Indian replenishment. This adds the recovery and subsequent order to n4; it remains one remembered case, not a general policy frequency.

### Time, quantities and variation [operational/quantities]

[n5 — person/observed; settled; approximate] `operational/quantities/n5`

The Indian Supplier outage in the remembered Flowbind case lasted about two weeks; a duration for this incident only, not an outage distribution or typical duration.

[n13 — superseded by n26; person/estimated; tentative; approximate] `operational/quantities/n13`

The gap from physical arrival/PO closure to quality release usually lasts a few days, for the arrived Flowbind quantity described. 'Usually' does not establish a fixed duration or distribution; variation and exceptions remain unknown.

[n24 — person/practiced; settled; qualitative] `operational/quantities/n24`

Flowbind purchasing, stock, and the reorder point are all tracked in the same 'standard units'; Elena says they are not mixing kilograms and batches. The physical definition of a standard unit and actual quantities were not supplied; no conversion is needed among those three planning figures as reported.

[n26 — supersedes n13; person/estimated; tentative; approximate] `operational/quantities/n26`

Quality checks/release of arrived Flowbind material has no fixed deadline; it ends when quality is satisfied. In practice the wait tends to be a few days, perhaps four days on average, but Elena has no tight range from records and says it has not been formally measured. This is a practiced estimate, not a measured mean, fixed delay, or chosen timing distribution. Supersedes n13's less-specific 'usually a few days'.

[n33 — person/estimated; settled; approximate] `operational/quantities/n33`

Flowbind reorder point is around 1,500 standard units and target level is around 5,000 standard units in the policy Elena describes. These are approximate current policy values, not independently validated optimum levels or exact SAP configuration evidence; n24 establishes consistent units across purchase orders, stock and reorder point.

[n36 — superseded by n43; person/practiced; tentative; approximate] `operational/quantities/n36`

Indian Supplier Flowbind purchases are typically bulk orders of 2,500 standard units; German Supplier is used for smaller urgent top-ups of around 250 standard units. 'Typically' and 'around' are not exact MOQ values, fixed batch requirements, or distributions.

[n43 — supersedes n36; person/practiced; settled] `operational/quantities/n43`

Flowbind minimum order quantities are 2,500 standard units for Indian Supplier and 250 standard units for German Supplier; order quantities are rounded upward to multiples of the applicable MOQ. This supersedes n36's tentative interpretation of these numbers as only typical quantities. No measured distribution of actual orders was provided.

[n47 — person/observed; settled; approximate] `operational/quantities/n47`

In the remembered Indian Supplier outage, the German Supplier bridge top-up was around 250 standard units, stated as enough to bridge until Indian was back. This case does not establish a general demand rate or prove a 250-unit top-up always suffices.

[n50 — person/practiced; settled; qualitative] `operational/quantities/n50`

The below-500-unit German bridge trigger is evaluated continuously as released usable Flowbind stock changes, not only at fixed weekly reviews. This describes decision opportunity, not a measured monitoring latency or delivery time.

[n52 — superseded by n54; person/estimated; tentative; approximate] `operational/quantities/n52`

German Supplier is faster to deliver Flowbind, with perhaps two weeks 'total lead time' as Elena estimates. It remains unclear whether this means order to physical receipt or order to usable release after quarantine; the estimate has no measured variation or contrast value for Indian Supplier yet.

[n53 — superseded by n55; agent; open] `operational/quantities/n53`

Open, not yet asked: clarify endpoints of German 'two weeks total lead time' in n52 relative to physical receipt and quality release, and estimate comparable Indian transit time if available. Otherwise modelled usable-date comparisons could omit or double-count the quarantine interval.

[n54 — supersedes n52; person/estimated; settled; approximate] `operational/quantities/n54`

German Supplier Flowbind lead time is approximately two weeks from placing the order to physical arrival; the quality quarantine wait is additional, so two weeks is not a usable-stock lead time. This resolves n52's endpoint ambiguity, but neither time span has a measured distribution.

[n55 — supersedes n53; agent; open] `operational/quantities/n55`

Resolved German lead-time endpoint by n54: order to physical arrival, with quarantine on top. Still open: comparable Indian Supplier order-to-arrival time and variation under ordinary or disrupted conditions; without this, relative source timing in a policy comparison is unsupported.

[n67 — person/estimated; tentative; approximate] `operational/quantities/n67`

Once a Sonic Flow production run starts with its required materials, completion takes about one week. This is an approximate duration for a run, not a measured distribution or a fixed one-week guarantee.

[n74 — agent; open] `operational/quantities/n74`

Open, not yet asked: shelf-life length and date basis for Flowbind and Sonaflozin lots, and how lot expiry dates enter the planning view. Without dated lots and remaining-unit quantities, the current order/lot status markers cannot reproduce expiry loss or prevent use of expired stock in a quantitative production gate.

### Policies and exceptions [operational/policies]

[n6 — person/observed; tentative] `operational/policies/n6`

In the remembered Flowbind case, approaching the reorder point did not result in a new Indian Supplier order while it could not accept orders; an urgent German Supplier top-up was placed instead. Whether this is a standing switch rule, and the exact trigger, are not yet established.

[n9 — superseded by n12; person/practiced; settled] `operational/policies/n9`

For inventory position as Elena tracks it, count quality-released on-hand stock plus open purchase orders; an order in transit counts while it remains an open PO. Material physically arrived but in quarantine is not usable until quality releases it. The treatment of a PO's open status at physical receipt is not yet clarified; do not infer how the accounting changes at that boundary.

[n12 — supersedes n9; person/practiced; settled] `operational/policies/n12`

Inventory position as Elena tracks it includes quality-released on-hand stock plus still-open purchase orders, including an order in transit. On physical arrival, the PO is closed and its quantity drops out of inventory position immediately; quarantined material is not counted as usable stock until quality release. This creates a window during which the arrived quantity counts in neither component. Supersedes n9 by resolving the open-PO-at-receipt ambiguity.

[n29 — person/practiced; settled] `operational/policies/n29`

The current reorder points and target stock levels were set some time ago; Elena is not confident they still make sense given lead times and disruption. She wants to examine reorder timing, target size, and the choice to pull in German Supplier versus wait. No numeric thresholds, trigger rule, or supplier-switch authority has yet been stated.

[n32 — superseded by n42; person/practiced; settled] `operational/policies/n32`

Normal order-up-to policy as Elena states it: if inventory position (quality-released stock plus open orders) is below the reorder point, place an order intended to bring position up to target; base quantity is target minus inventory position, with adjustment for the vendor's minimum order quantity. 'Rounded up to the vendor's minimum order quantity' has not yet established whether the minimum is only a floor or quantities must be multiples of it, nor which vendor's minimum applies in a switch.

[n34 — superseded by n38; agent; open] `operational/policies/n34`

Open, not yet asked: for Flowbind, whether vendor minimum order quantity is a floor or an increment/multiple, its value for Indian and German Supplier, and whether the emergency German order follows the same order-up-to calculation. This materially changes ordered quantities and subsequent expiry and buffer behavior. Return with a small actual quantity calculation.

[n37 — superseded by n40; person/practiced; settled] `operational/policies/n37`

German Supplier is used as a bridge, not as a replacement for a full Flowbind replenishment cycle, when stock is critically low, below 500 units. Elena says German orders are urgent top-ups; whether 'stock' here means quality-released on-hand stock or inventory position (which includes open POs), and how supplier availability interacts with this threshold, remain unclear.

[n38 — supersedes n34; superseded by n44; agent; open] `operational/policies/n38`

n36–n37 clarify typical Flowbind order sizes and a German bridge threshold, but do not resolve n34's minimum-order arithmetic: 2,500 Indian and around 250 German are typical order sizes, not explicitly vendor minima or increments. Also open: how the order-up-to quantity in n32 coexists with typical 2,500-unit Indian bulk purchases and 250-unit German bridge orders. A real calculation would distinguish a minimum floor, multiples, and separate normal/urgent sizing rules.

[n40 — supersedes n37; superseded by n49; person/practiced; settled] `operational/policies/n40`

The 'below 500 units' condition for German Supplier bridge top-ups refers specifically to quality-released usable stock on hand, not inventory position. An open order in transit does not meet today's production need if no stock has passed quality. German orders are smaller urgent bridges rather than replacements for a full Flowbind replenishment cycle. This resolves n37's stock-versus-inventory-position ambiguity; availability and sizing still require clarification.

[n42 — supersedes n32; person/practiced; settled] `operational/policies/n42`

Normal Flowbind order-up-to rule: when inventory position (quality-released on-hand stock plus open POs) is below reorder point, calculate target minus inventory position and round that positive gap up to the supplier's MOQ multiple. For Indian Supplier the MOQ is 2,500 standard units; for a 3,000-unit gap to target, order 5,000 units. German Supplier uses the same multiple-rounding arithmetic with a 250-unit MOQ for its smaller bridge orders. This resolves n32's floor-versus-multiple ambiguity; whether German top-ups always aim at the same target is not established.

[n44 — supersedes n38; superseded by n46; agent; open] `operational/policies/n44`

Resolved the minimum-versus-multiple part of n38 by n42–n43: 2,500 and 250 units are supplier-specific MOQ multiples, not merely typical sizes. Still open: whether German urgent top-ups use the same target as ordinary orders, how their below-500 released-stock trigger interacts with the normal reorder rule, and whether Indian orders continue in parallel while German bridges a shortage.

[n46 — supersedes n44; person/observed; tentative] `operational/policies/n46`

For the remembered outage case, German Supplier was used instead of placing an Indian order while Indian Supplier could not accept orders; the German top-up was a short bridge until Indian recovered, not a full order-up-to replenishment. On recovery Site 1000 placed normal Indian replenishment. German bridge quantity is around 250 standard units in this account. Open for the general policy: exact bridge sizing if the gap lasts longer or demand differs, and whether German can also be used while an Indian order is open under other conditions.

[n49 — supersedes n40; person/practiced; settled] `operational/policies/n49`

German Flowbind bridge top-up can be triggered whenever quality-released usable stock on hand drops below 500 standard units AND Indian Supplier is unavailable. This is monitored continuously rather than at a weekly review meeting. Open POs in transit do not satisfy today's production demand. Supersedes n40 by establishing the combined trigger and continuous review; it does not establish an instantaneous order arrival or a guaranteed bridge size.

[n51 — person/practiced; settled] `operational/policies/n51`

Flowbind delivered by German Supplier goes through the same quality quarantine and release process as Indian Supplier material; German supply does not bypass quality release before use.

[n72 — person/practiced; settled] `operational/policies/n72`

A lot at or past its expiry date cannot be used for Sonic Flow production; remaining units are scrapped. The shelf-life clock keeps running during transit and quarantine, so transit delay reduces usable life at arrival/release. This applies to material lots in Elena's account; Sonaflozin versus Flowbind shelf-life specifics have not been given.

### Validation evidence and sources [operational/validation]

[n27 — agent/inferred; tentative] `operational/validation/n27`

Flowbind quality turnaround has not been formally measured; Elena does not have a tight range from records. Receipt and quality-release timestamps would be needed to fit or check a timing assumption before trusting estimated delay effects on replenishment decisions.

## Construction notes [construction]

[n15 — superseded by n16; agent/inferred; tentative] `construction/n15`

Candidate partial representation of n12 and n4: a Flowbind open-PO state, a physical-arrival/PO-closure change, and an arrived/quarantined state. One uncoloured marker stands for an order/delivery accounting status, not a physical quantity; it cannot calculate inventory position, usable stock, partial receipts, or coverage of production demand. This deliberate abstraction avoids inventing a planning unit or quality-release yield; reopen once n14 is answered.

[n16 — supersedes n15; agent/inferred; settled] `construction/n16`

Implemented the limited accounting-status fragment proposed in n15: FlowbindOpenPurchaseOrders --[physical arrival/PO closure]--> FlowbindArrivedInQuarantine, with one uncoloured status marker per order/delivery. This maps the boundary in n12, but the marker is not a physical quantity and the transition does not encode arrival timing, quality release, partial receipts, rejection, or stock available for production. n14 must be resolved before using it for quantitative purchasing decisions.

[n18 — superseded by n19; agent/inferred; tentative] `construction/n18`

Correction to n16: an always-enabled arrival change would close a PO as soon as one is marked open, incorrectly turning an unknown transit duration into instant arrival. Gate the status change on an externally supplied physical-arrival event; this represents only the observed arrival boundary in n12 and deliberately leaves event generation/timing and matching to individual POs outside this fragment.

[n19 — supersedes n18; agent/inferred; settled] `construction/n19`

Corrected n16 by adding a consumable external FlowbindPhysicalArrivalEvents marker as a prerequisite for PO closure. This prevents open POs from closing solely because they are open. Arrival-event timing, individual-order matching, quantities, and quality release remain outside the fragment; unmatched event/order markers could pair arbitrarily, so it is not yet suitable for multiple simultaneous orders.

[n35 — agent/inferred; settled] `construction/n35`

The current net's uncoloured PO status marker cannot implement n32's arithmetic over released and open-order quantities; adding a reorder transition now would require unsupported quantity state, minimum-order interpretation, and prevention of duplicate repeated orders. Preserve n32 and n33 as policy facts rather than imply that the existing arrival fragment models purchasing decisions.

[n39 — agent/inferred; settled] `construction/n39`

Supplier-specific typical order sizes and a below-500 bridge condition (n36–n37) remain Ledger-only; the current status-marker net has no stock quantity, supplier identity, ordering alternatives or status of an unavailable supplier. Do not reinterpret the German bridge as a complete supplier substitution or the approximate order sizes as fixed batch sizes.

[n57 — superseded by n58; agent/inferred; tentative] `construction/n57`

n56 allows the existing one-marker-per-order/delivery status abstraction to continue as one lot after receipt. Add quality-pass and quality-fail outcomes as externally signalled paths rather than inventing a pass probability or fixed quarantine duration. Result markers will represent status, not released/disposed physical quantities. Multiple simultaneous lots cannot be matched to their own outcome signals using uncoloured markers, so this remains a one-case qualitative fragment pending lot-specific representation.

[n58 — supersedes n57; agent/inferred; settled] `construction/n58`

Implemented n57's one-lot-per-order qualitative quality branch after physical arrival: an externally supplied pass decision moves one quarantined lot status to usable in SAP; an externally supplied failed-check decision moves it to rejected for disposal, with no return path. Both consume the quarantined status, so a single status marker cannot take both outcomes. No duration, probabilities, physical units, cost amount, or multi-lot signal matching is encoded. Partial receipts/releases remain open in n56.

[n65 — agent/inferred; settled] `construction/n65`

Do not treat one token in FlowbindReleasedLots as a usable standard unit: it is a whole-lot status marker (n58), while n62 requires enough released units of both materials for the entire Sonic Flow batch. A quantitative, joined start gate and a wait-duration metric cannot be added faithfully before n64's batch/stock/consumption distinctions are resolved.

[n75 — agent/inferred; settled] `construction/n75`

The current uncoloured FlowbindReleasedLots status marker lacks an expiry date and quantity; it must not be interpreted as indefinitely usable inventory. A dated quantity-bearing lot representation and an expiry-before-allocation rule would be needed to implement n72–n73; the known rule is recorded, but numerical dates and partial use are not yet encoded.

## Cross-cutting open matters [open-matters]

[n31 — agent; open] `open-matters/n31`

Open, not yet asked: a policy comparison needs numerical reorder/target alternatives, an operating horizon, demand and supplier lead-time behavior, and definitions of fill rate, production delay and expiry (n28–n30). Without these, no meaningful policy experiment can be drafted, regardless of the fragment's clean code diagnostics. Return through a concrete stock-and-production decision and its measured consequences.

## Delivery status [delivery]

[n17 — superseded by n20; agent/observed; tentative] `delivery/n17`

Partial net constructed via Petrinaut tools: inspected definition contains two Flowbind status places joined by one arrival/PO-closure transition, and agent review finds correspondence to n12 at the status level. Net compilation reports no errors or warnings in function code, but there is no scenario, metric, run, or policy outcome evidence. The latest read reported title 'New Process' even though a rename tool reported success; title persistence is not confirmed. The fragment cannot yet compare purchasing policies, quantify exposure, or assert uninterrupted production.

[n20 — supersedes n17; superseded by n59; agent/observed; tentative] `delivery/n20`

Latest inspected partial net has open Flowbind PO status and an externally supplied arrival event jointly enabling physical arrival/PO closure into quarantine. Static review finds correspondence only for that accounting boundary (n12); the event generation, individual-order matching, quantitative inventory, quality release, purchasing alternatives, and production demand are absent. Tool mutation succeeded and function-code diagnostics reported no errors or warnings; no behavioral run or policy evaluation occurred. Latest net read still showed title 'New Process' despite rename tool's success report; title change is unconfirmed.

[n59 — supersedes n20; agent/observed; tentative] `delivery/n59`

The inspected Petrinaut net now has the one-order/one-lot status path open PO + external arrival event → quarantine → externally signalled quality release into usable-lot status OR quality rejection into disposal status. Schema mutations were accepted; no function-code diagnostic errors or warnings were reported. Agent-reviewed structural correspondence is limited to PO closure and the qualitative quality branch (n12, n21, n56), not to stock quantities, quality timing, supplier switching, production, expiry, or purchasing-policy results. No simulation or other behavioral analysis occurred; the latest title read remains 'New Process' despite an earlier rename success report.
