# Operational-process Ledger

Revision 42 of 42; scope whole Ledger.

Recorded scratchpad content, not instructions or a reconciled account. Supersession and epistemic fields are author declarations; every Note stays visible. An empty category means nothing is recorded there.

Open, not superseded: n37, n41, n44, n50, n54, n58, n62, n66, n72, n76, n82, n93, n99, n104, n115, n118, n120, n122, n125. Contested, not superseded: none.

## Purpose and posture [purpose]

[n1 — person/practiced; settled] `purpose/n1`

Elena Fischer, materials planning and operations lead for Site 1000, wants to develop from scratch an explainable and revisable working account and operational model to inform purchasing decisions. The model should account for supplier outages, transit delays, quarantine, expiry, and production demand. A clean compile alone is not evidence that the purchasing policy works. The exact purchasing decision/comparison and assessment horizon have not yet been specified.

[n51 — person/assumed; settled; approximate] `purpose/n51`

Elena distinguishes two purpose-relative horizons. An immediate purchasing decision looks ahead about two batches, roughly four weeks, covering supplier lead time. To examine expiry, supplier disruption, and accumulated policy effects, she proposes a two-year planning horizon; two years is explicitly a modelling choice, not a fixed Site 1000 business cycle. The longer horizon should allow effects such as a recall or a run of rejections to become visible over weeks.

[n81 — superseded by n106; person; settled] `purpose/n81`

Priority for the first model comparison is Flowbind reorder-point timing: determine whether triggering at the current point provides enough usable stock through order-to-receipt plus quarantine for planned production, compared with earlier trigger settings. Do not infer policy performance from clean compilation or from the single successful early-order anecdote. The reorder point's numeric value, trigger's inventory-position definition, tunable comparison range and production-shortage measure remain open.

[n106 — supersedes n81; person; settled] `purpose/n106`

The first question remains whether Flowbind's 1,500-unit reorder trigger provides enough time for receipt plus quarantine without production exposure (n80). Elena now specifies two complementary outcomes for policy evaluation: percentage of customer orders fulfilled on time and how often production waits idle specifically for material (n105), assessed over a realistic horizon. An order-up-to calculation or clean compile does not answer this. Metric denominators, due-date/partial-fill semantics, comparison range and boundary inputs remain open.

## Operational account [operational]

_No Notes recorded._

### Goals, measures and constraints [operational/goals]

[n29 — person/practiced; settled] `operational/goals/n29`

The purchasing analysis needs to keep two questions separate: 'what does the policy say to order' uses released plus quarantine plus open orders in the inventory position; 'are we actually covered' is more conservative about quarantine and in-transit stock. A policy-compliant order amount is therefore not by itself evidence of reliable batch coverage.

[n39 — person/practiced; settled; approximate] `operational/goals/n39`

Elena wanted to avoid reaching roughly two weeks later with insufficient released Flowbind stock and a production order waiting. This is an expressed concern tied to the recalled decision, not yet a numeric service-level target or a defined simulation horizon.

[n42 — person/practiced; settled; qualitative] `operational/goals/n42`

Early purchasing trades reduced risk of production delay (line waiting and customer orders late) against capital tied up in stock held sooner than needed and ageing toward expiry. Elena judges production-delay cost to outweigh carrying cost in most cases, but not without exception; no numeric weights or hard service target were supplied. Habitual over-ordering can leave stock to expire before use.

[n56 — person/assumed; tentative] `operational/goals/n56`

For the hypothetical Sonaflozin recall, Elena identifies potential financial losses as recalled raw-material value, possibly affected finished-goods value, and production-delay cost while awaiting replacement stock. No amounts, probabilities, traceability extent, or combination rule were given; finished-goods recall is conditional ('could').

[n80 — person/practiced; settled] `operational/goals/n80`

Elena's first policy question is whether the current Flowbind reorder-point trigger starts purchasing early enough to cover supplier lead time plus quarantine without exposing production to a shortage of released stock. Order-up-to quantity matters but is secondary: a late trigger leaves the operation catching up. Her discretionary early orders under stacked risk cues are evidence to investigate possible miscalibration of the formal trigger, not proof of miscalibration.

[n105 — superseded by n109; person/practiced; settled] `operational/goals/n105`

For judging whether a purchasing policy works, Elena prioritizes customer fill rate and production delay together: over a realistic planning horizon, what percentage of customer orders are fulfilled on time, and how often production is idle waiting for material. A held batch matters through its eventual effect on deliveries or unmet customer orders. Neither metric definition (order versus units, due date, partial fill, idle frequency versus duration) nor acceptable threshold has yet been settled.

[n109 — supersedes n105; superseded by n112; person/practiced; settled] `operational/goals/n109`

Elena evaluates purchasing-policy performance through the percentage of customer Sonic Flow order lines fulfilled in full on time and how often production is idle specifically for lack of material. An order line is a customer order for a quantity; partial shipment does not count as fulfilled (n108). The promised-date source, denominator/window treatment, and what counts as an idle episode versus time remain open. The objective is not reducible to the current inventory-position metric.

[n112 — supersedes n109; superseded by n114; person/practiced; settled] `operational/goals/n112`

Policy success measure: percentage of Sonic Flow customer order lines dispatched in full by their recorded order delivery date, plus how often the production line is idle for lack of material. A partial shipment is not a filled line (n108); customer receipt after Site 1000 dispatch is out of scope (n111). The denominator for orders spanning the analysis window, any changed delivery dates and exact idle-event definition remain open.

[n114 — supersedes n112; person/practiced; settled] `operational/goals/n114`

Define the on-time percentage over Sonic Flow customer order lines whose recorded promised delivery date falls within the analysis horizon. A line counts as on time only if its full quantity is dispatched from Site 1000 by that date; otherwise it counts late or unfilled, including lines still undispatched when the horizon ends. Lines ordered during the horizon but due after it are not in this denominator. Customer receipt/downstream handling remains outside n111. Exact treatment of commitments already overdue before the start and revised promises is not yet established.

[n116 — superseded by n119; person/practiced; settled] `operational/goals/n116`

The production-delay measure Elena wants is material-attributable wait for a scheduled Sonic Flow production order: elapsed time from the order's due-to-start time to actual start when insufficient released Sonaflozin and/or Flowbind prevents it starting. SAP's waiting/blocked order status may witness the condition. A gap with no scheduled order is normal and must not count as idle for material; general line utilization is not the requested measure. How to attribute overlap with line unavailability or re-planning remains unasked.

[n119 — supersedes n116; person/practiced; settled] `operational/goals/n119`

Material-caused production wait is counted while a scheduled Sonic Flow order is ready, the line is free, and released Sonaflozin or Flowbind is insufficient. If material arrives while the line is still occupied, the wait to that point is attributed to line capacity, not material. In combined cases attribution can be murky in practice; Elena wants material-caused delay distinguished from line-capacity delay and permits a clearly labelled simplifying assumption for the precise split if needed. A planned gap without an order still does not count.

[n121 — person/estimated; settled; approximate] `operational/goals/n121`

For a first Flowbind reorder-point comparison Elena considers about 1,000 units at the low end and perhaps 2,500 units at the high end, against the current 1,500-unit trigger. She describes 1,000 as tight, roughly a batch and a half with some lead-time buffer, and 2,500 as offering more breathing room at the cost of stock carrying and expiry exposure. These are approximate candidate bounds, not proven safe limits; performance must be judged across supply/demand conditions.

### Boundary and initial conditions [operational/boundary]

[n6 — person/observed; settled] `operational/boundary/n6`

In the recalled decision, an SAP flag that Flowbind was close to its reorder point prompted review; the next two planned Sonic Flow batches were the demand window considered. Whether this is the normal planning horizon and exactly which stock categories SAP's position counts are not yet established.

[n52 — person/estimated; settled; approximate] `operational/boundary/n52`

The next two planned Sonic Flow batches represent roughly four weeks for an immediate purchasing comparison. Two years is an optional longer analysis window for expiry and disruptions, not an asserted repeating operational cycle. Initial stock, calendar mapping, future batch schedule and supplier conditions at the start of either window remain unspecified.

[n71 — person/practiced; settled] `operational/boundary/n71`

For a purchase-order lead-time model based on current SAP evidence, the directly observed start is order placement and end is booked goods receipt. Dispatch between these endpoints is not routinely tracked separately; any disaggregation into supplier preparation and in-transit travel would need a separate estimate or new evidence.

[n102 — person/practiced; settled] `operational/boundary/n102`

Production planning generates Sonic Flow's batch schedule from customer-order backlog and a forward demand view. The plan is reviewed regularly; batch dates and sizes can change before start. The schedule is an input to an immediate purchasing decision, not a fixed repeating arrival process.

[n111 — person/practiced; settled] `operational/boundary/n111`

For the requested customer-service measure, Site 1000's responsibility ends at dispatch: compare recorded customer order delivery date with the date the entire order line's goods leave Site 1000. Customer receipt, onward transit, other-site or regional warehouse handling are outside this model boundary. Site 1000 supplies five sites, but their downstream movement is not managed here.

[n123 — person/practiced; settled] `operational/boundary/n123`

Elena has no reliable current Flowbind starting inventory figures at hand and prefers to obtain a dated snapshot of released, quarantined and open-order quantities from SAP rather than state them from memory. Actual initial inventory for a policy scenario is therefore open pending records; she explicitly authorizes a plausible provisional starting inventory for analysis, provided it is later grounded and not presented as observed.

### Participants, things and resources [operational/resources]

[n2 — person; settled] `operational/resources/n2`

Site 1000 makes Sonic Flow from Sonaflozin and Flowbind Material. Their exact quantities, sourcing arrangements, and use per production unit are not yet established.

[n7 — person/observed; settled] `operational/resources/n7`

Indian Supplier supplied the main Flowbind order in the recalled case; German Supplier was a possible source of a small top-up, not used. Open purchase orders in transit and material in a quarantine queue near release were checked separately when deciding whether to buy.

[n43 — person/practiced; settled; qualitative] `operational/resources/n43`

Flowbind has a long shelf life relative to Sonaflozin; shelf-life concern is greater for Sonaflozin, but expiry still matters for Flowbind. No absolute shelf lives, ageing rule, or handling of expired lots was specified.

[n49 — person/practiced; settled] `operational/resources/n49`

Expiry is lot-specific for both raw materials, recorded in SAP when a lot is first booked in rather than inferred here from a universal storage duration. That date changes issue eligibility and must remain associated with each lot for expiry-aware stock calculations.

[n53 — person/practiced; tentative; qualitative] `operational/resources/n53`

Sonaflozin shelf life varies by lot. Elena says a recall or a run of rejections can take weeks to show its real cost. The meaning, frequency and process consequences of a recall have not yet been described; neither has a probability of rejection.

[n63 — person/practiced; settled] `operational/resources/n63`

Site 1000 uses Chinese Supplier as its sole Sonaflozin supplier; Elena says there is no supplier backup that can be switched to quickly. Flowbind differs: Indian Supplier is the normal source in the recalled case, and German Supplier can provide an urgent top-up when Indian Supplier cannot cover demand. No relative prices, capacities, supplier outage rates, or promised top-up timings were stated.

[n74 — superseded by n77; person/practiced; settled] `operational/resources/n74`

Quality processes lots in sequence, and even straightforward lots incur some administrative time. Whether Sonaflozin and Flowbind share a single constrained Quality queue, staffing/throughput, precedence rule, and weekend/calendar effects are not yet established.

[n77 — supersedes n74; person/practiced; settled] `operational/resources/n77`

The same Quality team handles incoming lots of both materials. Lots are generally processed by receipt date, oldest first, but a lot urgently needed for a waiting production order may be moved ahead by the Quality supervisor. This is managed judgment rather than a rigid formal priority rule; neither team capacity nor work rate was given.

[n94 — superseded by n97; person/practiced; settled] `operational/resources/n94`

Site 1000 has one production line for Sonic Flow. Batches are sequential rather than overlapping on that line. Whether the line is held for the entire start-to-finished-ready-for-release interval or released earlier has not been established.

[n97 — supersedes n94; person/practiced; settled] `operational/resources/n97`

One Sonic Flow production line runs batches sequentially. It becomes available for the next batch after the current batch is complete and equipment has been cleaned and checked; it does not have to wait for Quality to release the finished-goods lot. The number of lines is one, but cleaning/check duration has not been quantified.

### Activities and resource use [operational/activities]

[n11 — person/practiced; settled] `operational/activities/n11`

Flowbind material held in quarantine is not available as dependable stock until release; it can also be rejected. Hold time varies. Release makes material usable for the warehouse-based decision; the quality/release criterion, quantities and handling of rejected material were not specified.

[n12 — superseded by n14; agent; open] `operational/activities/n12`

Not yet asked: the observable condition or approval that releases or rejects a quarantined Flowbind receipt, and whether a whole lot or portions move to usable stock. An unconditional movement would falsely erase variable quarantine and possible rejection, so the quarantine-to-usable net behavior remains blocked pending this distinction.

[n14 — supersedes n12; person/practiced; settled] `operational/activities/n14`

Elena clarified the quarantine outcome: Quality checks Flowbind supplier and material identity, quantity, packaging condition, and certificate of analysis. A lot passing all checks is released to usable stock; a lot failing any check (e.g. wrong quantity, documentation, damage, certificate mismatch) is rejected, removed and disposed of, never returned to inventory. The rejected cost is recorded but the material cannot be used. Timing of checks, evidence of each check, and lot quantity/unit are still not established.

[n15 — person/practiced; settled] `operational/activities/n15`

Quality's Flowbind quarantine check has two outcomes: a passed lot becomes usable warehouse stock; a failed lot is rejected and disposed of. Rejected material is not recycled back to inventory, and its cost is recorded. Individual check durations, costs and return paths outside disposal have not been supplied.

[n19 — person/practiced; settled] `operational/activities/n19`

Sonic Flow's bill of materials is one unit of Sonaflozin and one unit of Flowbind Material per one finished unit of Sonic Flow. Thus a planned batch of approximately 700 finished units requires approximately 700 units of each raw material available. Elena says uncertainty in this comparison lies mostly in supply, not bill-of-materials arithmetic.

[n31 — person/practiced; settled] `operational/activities/n31`

When Flowbind material physically arrives and is booked into quarantine in SAP, its quantity moves out of the open-order bucket and into the quarantine bucket; it is not counted in both. As supply moves through in transit, quarantine, and released warehouse stock, the inventory position counts its quantity once in whichever bucket currently holds it.

[n45 — person/practiced; settled] `operational/activities/n45`

When a Flowbind or Sonaflozin lot expires at Site 1000, remaining material is blocked from production issue, removed from usable stock and disposed of. The inventory loss resembles a rejected lot, but the accounting differs; accounting detail was not specified. Expiry date basis and remaining-quantity treatment were not yet established.

[n60 — person/observed; settled] `operational/activities/n60`

For the recalled Chinese Supplier Sonaflozin shipment, tracking signalled a transit delay after dispatch. Elena could monitor released stock but could not expedite or replace that shipment on the facts given; on arrival it entered quarantine and cleared Quality. No rejected material or production wait occurred in this case.

[n88 — person/practiced; settled] `operational/activities/n88`

Before a Sonic Flow production order starts, the full planned batch quantity of both Sonaflozin and Flowbind must already be released and available, and the line must be free. Production does not part-issue material into a running batch. If either released material is short, the order remains on hold; it also waits while the line is occupied. One finished unit uses one unit of each raw material (n19).

[n91 — person/practiced; settled] `operational/activities/n91`

A Sonic Flow batch may draw the needed released material from multiple lots. If only part of a released lot is issued, the remaining units retain that lot number and stay available in the warehouse for another order; there is no loss merely because the lot was partially consumed. This applies to the material-issue account in the current batch discussion, alongside full batch availability before start (n88).

### Cases and process spine [operational/process-spine]

[n3 — superseded by n4; agent; open] `operational/process-spine/n3`

Not yet asked: the observable sequence from a purchasing trigger through supply, availability, and production use, including what is decided. This blocks a faithful process flow or purchasing-policy simulation; return by walking a concrete recent purchase or shortage case with Elena.

[n4 — supersedes n3; person/observed; settled; One remembered case; 'reasonable time' is qualitative.] `operational/process-spine/n4`

A recent Flowbind purchase case: SAP flagged Site 1000's Flowbind position near its reorder point earlier than expected after larger production batches and some stretch in Indian Supplier lead time. Elena checked open purchase orders for material in transit and the quarantine queue for material close to release, comparing these with the next two planned batches. Site 1000 ordered from Indian Supplier before the automated trigger; a small German Supplier top-up was held as a contingency if transit ran long. The main order subsequently cleared quarantine in reasonable time, so no German top-up was needed. This is one remembered instance, not an established general rule or frequency. The exact SAP trigger, quantity accounting, delivery-to-quarantine handoff, release criterion, and replenishment decision rule remain to be established.

[n55 — person/assumed; tentative] `operational/process-spine/n55`

Elena cannot confidently recount a recent Sonaflozin recall at Site 1000. Her conditional account of how one would be handled: affected lots would be blocked and removed from usable inventory, their value written off; finished product made from affected material could also be recalled. Production would rely on unaffected released stock and might wait for replacement stock to arrive and clear quarantine. This is an anticipated response, not an observed site case or established recall frequency.

[n59 — person/observed; settled; approximate] `operational/process-spine/n59`

In a remembered Sonaflozin case, a shipment from Chinese Supplier was already in transit when tracking showed an approximately two-week delay attributed by the supplier only to 'logistics.' Elena monitored released stock and waited. The shipment later arrived, entered quarantine, passed Quality without issue and became available. Production was not interrupted because enough released stock covered the batches in that window; no lot was rejected. This one case illustrates delayed transit and the protection of a released-stock buffer, not a supplier-delay frequency or universal two-week delay.

[n65 — person/assumed; tentative] `operational/process-spine/n65`

The n59 Sonaflozin delay did not require contingency because released stock covered the batches. In a counterfactual shortage, Elena identifies reduced batch size, delayed production, or later customer delivery and associated cost (n64), rather than an urgent alternate supplier. Keep the observed outcome and the stated contingency distinct.

[n89 — person/practiced; settled] `operational/process-spine/n89`

For a planned Sonic Flow batch, order waits until line availability and full released stock of both materials coincide; then production may start. Material shortfall in either input holds the order rather than partially starting or drawing quarantine stock. Completion, actual batch duration, line count, and material issue/accounting after start remain unasked.

[n98 — person/practiced; settled] `operational/process-spine/n98`

After a Sonic Flow batch completes, cleaning and equipment checks free the line for another batch; in parallel the completed finished-goods lot waits in finished-goods quarantine for Quality release. Production of the next batch and Quality release of the prior finished lot can overlap. Do not treat the one-week start-to-finished-ready-for-release description in n95 as the line's exclusive occupancy period.

### Time, quantities and variation [operational/quantities]

[n10 — person/observed; settled; approximate] `operational/quantities/n10`

For the recalled Flowbind decision, released stock was below what Elena wanted for the next two production batches, while in-transit material had approximately a week until expected arrival, followed by quarantine. This is a rough case-specific time-to-arrival, not a general Indian Supplier lead time or quarantine duration.

[n20 — person/estimated; settled; approximate] `operational/quantities/n20`

Site 1000 compares raw-material availability and finished Sonic Flow output in the same unit. The recalled illustration is a batch of around 700 Sonic Flow units requiring roughly 700 units of each material; 700 is illustrative/approximate, not a fixed batch size or reorder quantity.

[n25 — superseded by n83; person/practiced; settled; approximate] `operational/quantities/n25`

Flowbind order-up-to target stock level is around 5,000 material units, not an exact confirmed threshold. The vendor has an accepted minimum relevant to rounding the calculated order amount, but neither the minimum nor the exact rounding operation is yet specified.

[n61 — person/observed; settled; approximate] `operational/quantities/n61`

The recalled Chinese Supplier Sonaflozin shipment arrived approximately two weeks late. Elena cautions that a nominal two-week buffer can be consumed by a transit stretch. Neither an ordinary Chinese Supplier lead-time distribution nor a general buffer policy is established by this one incident.

[n67 — superseded by n70; person/estimated; tentative; approximate] `operational/quantities/n67`

Fitted starting estimates from SAP purchase orders and goods receipt dates: Chinese Supplier about 28 days lead time with perhaps three days either way; Indian Supplier about 14 days and somewhat more variable (no spread quantified); German Supplier about 15 days and fairly consistent (no spread quantified). These are estimates, not operational targets, and the rare very-long-delay tail is poorly learned unless enough such cases occur. The meaning of 'three days either way' (range, spread, or informal variation), order-to-receipt scope and outage effects have not been established.

[n70 — supersedes n67; person/estimated; tentative; approximate] `operational/quantities/n70`

The supplier-specific SAP figures are fitted order-placement-to-goods-receipt lead times: Chinese Supplier approximately 28 days with an informal 'perhaps three days either way'; Indian Supplier approximately 14 days with greater, unquantified variation; German Supplier approximately 15 days and fairly consistent. They combine supplier preparation before dispatch and transit, not transit alone, are not operational targets, and have poorly observed rare long-delay tails. Dispatch date is not routinely recorded separately, so preparation/transit split would be an estimate rather than directly fitted from these records.

[n73 — person/estimated; tentative; approximate] `operational/quantities/n73`

Quality decision follows booked goods receipt, with elapsed quarantine time calculable in principle from separate SAP timestamps. Elena describes typical quarantine as a few days and says about four days would not surprise her for a typical lot; she does not have a precise average. Rejections are rare and most lots pass, but neither probability nor delay tail is characterized. Four days is a loose typical estimate, not a deterministic hold or a fitted distribution.

[n83 — supersedes n25; person/practiced; settled] `operational/quantities/n83`

Elena now supplies exact current Flowbind policy settings: reorder point 1,500 units and order-up-to target 5,000 units. Earlier 'around 5,000' was an approximate account of the same current target, now specified as 5,000. Order quantity is approximately 5,000 minus current inventory position, adjusted to the vendor minimum; the vendor minimum and rounding rule remain unspecified.

[n95 — superseded by n100; person/estimated; settled; approximate] `operational/quantities/n95`

A Sonic Flow batch typically takes around one week from start until finished product is ready for release. In practice batches are roughly one every two weeks, allowing for scheduling and changeover. These approximate distinct intervals must not be collapsed into a one-week batch arrival rate or a guaranteed two-week calendar cadence.

[n100 — supersedes n95; person/estimated; settled; approximate] `operational/quantities/n100`

Elena clarifies that her 'around one week' refers to Sonic Flow production order completion, covering manufacturing plus internal handoff. Finished-goods QA release occurs afterward. She does not have a precise manufacturing/cleaning/check breakdown and explicitly proposes using one week as a planning-resolution production duration for the model, without finer subdivision. Roughly one batch every two weeks in practice remains a separate scheduling/changeover observation, not a guaranteed arrival schedule.

[n103 — person/estimated; settled; approximate] `operational/quantities/n103`

Sonic Flow production averages around 700 finished units per batch and roughly one batch every two weeks in current practice, but both quantity and timing vary with customer orders and replanning. These are approximate descriptive central tendencies, not fixed batch size or periodic cadence. A batch of that size needs the same approximate units of each raw material (n19).

### Policies and exceptions [operational/policies]

[n5 — person/observed; settled] `operational/policies/n5`

In the recalled Flowbind case, Elena chose an Indian Supplier order before the automated reorder trigger, with German Supplier as a possible small top-up if transit ran long. This does not establish a universal supplier priority, top-up threshold, or practiced decision algorithm.

[n8 — superseded by n24; agent; open] `operational/policies/n8`

Not yet asked: the actionable test Elena applies when deciding to advance a Flowbind purchase and choose Indian Supplier rather than a German top-up, including what counts as usable versus uncertain supply and the buying quantities. Without this, encoding a purchasing policy or even a stock-based guard could misleadingly make anecdotal choices automatic; return by tracing the figures and judgment in the recalled decision.

[n9 — person/practiced; settled] `operational/policies/n9`

Elena counts only material already released and in the warehouse as dependable supply for her Flowbind purchase decision. Material in quarantine is not counted until release because it can be rejected and hold times vary. Open orders in transit are likely but uncertain because they may be delayed. Production planning separately factors in material expected to clear quarantine within the planning window, explicitly marked as not confirmed usable; do not merge this planning expectation with Elena's dependable-stock measure.

[n24 — supersedes n8; superseded by n28; person/practiced; settled; approximate] `operational/policies/n24`

The previously open Flowbind purchasing rule is partly resolved: when ordering, Site 1000 targets an inventory position of around 5,000 units. Elena calculates the amount as target minus on-hand units plus units already on order (i.e. target − [on hand + on order]), then rounds to the vendor's accepted minimum. The quantity follows standard policy rather than case-by-case judgment. The judgment in the recalled case was ordering earlier than the automatic reorder-point trigger; the timing criterion, exact target, vendor minimum/rounding rule, and whether 'on hand' includes quarantined stock still need clarification before encoding an executable policy.

[n26 — person/practiced; settled] `operational/policies/n26`

Elena distinguishes the standard policy determining Flowbind order quantity from her judgment to place an order early, before the automatic reorder-point trigger in the remembered case. The current account does not establish the reorder point, what exactly advances an order, or which supplier's minimum applies to the calculation.

[n28 — supersedes n24; superseded by n84; person/practiced; settled; approximate] `operational/policies/n28`

Elena clarified two coexisting Flowbind calculations rather than correcting her earlier conservative assessment: the standard order-up-to inventory position includes released warehouse stock, stock in quarantine, and open orders; the policy's nominal target is around 5,000 units, and its calculated order quantity is target minus that inventory position, adjusted to the vendor's accepted minimum. Separately, her assessment of whether the next batches are actually covered counts released stock as dependable and treats quarantine and in-transit supply as uncertain (n9). Her judgment in the recalled case concerned advancing the order's timing, not selecting its quantity. Exact target, minimum-order adjustment, and open-order balance accounting remain unestablished.

[n32 — person/practiced; settled] `operational/policies/n32`

For the Flowbind order-up-to inventory position, the open-order, quarantine and released warehouse buckets are mutually exclusive for material already booked into quarantine; arriving quantity must be removed from the open-order balance as it enters quarantine. This accounting differs from treating each bucket as an independent promise of future supply.

[n36 — person/practiced; settled; qualitative] `operational/policies/n36`

Elena sometimes places a Flowbind order before the automatic reorder point when several risk cues stack up: supplier lead time seems longer than normal and/or production batches run ahead of forecast, drawing stock faster. In the recalled case both applied; she did not trust the Indian Supplier to arrive at the low end of its lead-time range. The reorder point is calibrated to typical conditions. Early ordering is practiced judgment, not a formal threshold or algorithm.

[n40 — person/practiced; settled; qualitative] `operational/policies/n40`

The case's early-buy judgment used two observable cues: batch records showed larger-than-planned production orders for the previous two or three weeks, and Indian Supplier signalled that it was busy. Elena inferred increased risk of an extended lead time from the latter based on experience. She regarded their combination as enough to act, not proof of a delay or a universal trigger threshold.

[n46 — superseded by n48; person/practiced; settled] `operational/policies/n46`

Site 1000 tries to issue older usable material first to reduce expiry while it sits in the warehouse. Elena did not specify exact lot ordering, permitted exceptions, or whether this is system-enforced versus practiced.

[n48 — supersedes n46; person/practiced; settled] `operational/policies/n48`

Warehouse issues usable raw-material lots first-expired, first-out: the lot with the least remaining shelf life is used before newer material. Each lot has its own expiry date recorded in SAP when first booked in, and production does not issue a lot past that date. Whether exceptions are allowed or how ties are broken has not been specified.

[n64 — person/practiced; settled] `operational/policies/n64`

If released Sonaflozin stock cannot cover planned production while a delivery is delayed, realistic options are to reduce batch sizes to stretch available released stock, delay production orders, or accept the shortage cost and move customer delivery later. There is no quick alternate supplier for Sonaflozin. These are contingency choices, not a fixed priority among them.

[n78 — person/practiced; settled] `operational/policies/n78`

Quality supervisor can expedite a lot needed urgently for a waiting production order ahead of the usual receipt-date sequence. Elena advises that for this model the exact queue logic may be simplified; the key effect to retain is a hold period before each lot becomes usable. This is a purpose-relative simplification preference, not a claim that sequencing or shared Quality capacity never matters.

[n84 — supersedes n28; person/practiced; settled] `operational/policies/n84`

Flowbind automatic ordering flag uses a strict comparison: SAP flags that an order is due when inventory position falls below 1,500 units. Inventory position is released stock + quarantined stock + open orders, with each quantity counted once as it changes bucket (n31–n32). The current order-up-to target is 5,000 units; order size is approximately target minus current position, rounded to a vendor minimum not yet specified. Elena can order before the flag through the qualitative early-action judgment in n36–n40. 'Flag that an order is due' does not establish that SAP itself places the purchase order.

[n92 — person/practiced; settled] `operational/policies/n92`

Production material issue can span several released lots while retaining each partially used lot's identity and remainder. The warehouse's first-expired, first-out practice (n48) should choose among eligible lots; the exact method for ties, zero remnants and exceptions remains unasked.

[n108 — person/practiced; settled] `operational/policies/n108`

Customer fulfillment is assessed per Sonic Flow customer order line, each specifying a quantity. Site 1000 does not typically make partial shipments: a line is filled in full or waits. A partial delivery would not count as a filled line in Elena's reporting. Whether rare partial-shipment exceptions exist is not established.

### Validation evidence and sources [operational/validation]

[n38 — person/observed; settled; qualitative] `operational/validation/n38`

For the recalled early Flowbind order, batch records showed production orders over the preceding two or three weeks were larger than planned; Elena also had a supplier heads-up that they were busy. She interprets such a heads-up, from experience, as a warning that the later end of supplier lead time may stretch, not as certainty. Batch records and supplier messages are possible evidence sources to test the risk cues; no quantified relationship has been established.

[n57 — person; settled] `operational/validation/n57`

There is no recent Sonaflozin recall case at Site 1000 that Elena can describe confidently. To validate a recall branch, seek the applicable recall procedure, lot genealogy/traceability records, or an informed historical case, and establish Elena's standing toward any consulted material. The current conditional description alone cannot support an observed incidence rate.

[n68 — person/practiced; settled] `operational/validation/n68`

SAP purchase-order records and goods-receipt dates are candidate observations for fitting supplier-specific lead-time estimates. Elena says fitted ordinary lead times do not establish the rare very-long-delay tail without enough events; a model using only ordinary fits would not validate outage or severe delay risk. No datasets have been inspected in this conversation.

[n75 — person/practiced; settled] `operational/validation/n75`

Separate SAP goods-receipt and Quality-decision records could test quarantine elapsed time, but Elena would not rely on SAP alone to choose a quarantine-time distribution: Quality's operational view is needed, and the sample may be too small to characterize long waits. No Quality source was consulted or accepted in this conversation.

[n117 — person/practiced; settled] `operational/validation/n117`

SAP production-order planned start, actual start and waiting/blocked status are candidate observations for testing material-caused delay, alongside released stock records. Do not infer that every gap between production batches is a shortage; Elena distinguishes normal unscheduled gaps.

[n125 — agent; open] `operational/validation/n125`

Obtain a dated SAP extract identifying released Flowbind, quarantine, and open-order outstanding quantities (without double counting receipts), and relevant lot IDs and dates, to calibrate or replace provisional snapshot n124. The current conversation has not accessed SAP.

## Construction notes [construction]

[n13 — agent/inferred; tentative] `construction/n13`

The current net is empty. The account supports distinct conceptual states for released warehouse material, quarantine, and in-transit orders (n7, n9, n11), but not yet a faithful executable material-transfer fragment: release and rejection conditions are unspecified (n12), order/material quantities are not established, and a continuously enabled transition would incorrectly imply immediate clearance. Do not substitute the remembered purchase choice (n4, n5) for an unconditional policy rule.

[n16 — superseded by n17; agent/inferred; tentative] `construction/n16`

A bounded post-Quality-decision fragment can now split a single Flowbind lot with an externally supplied pass/fail result into a released-lot state or disposed-lot state, following n14 and n15. This is a representation proposal: the boolean is the aggregate result of the four Quality checks, not a sampled rejection probability or an automatic Quality decision; it omits check timing, quantity and cost until supported. The lot begins at the point the result is known, not on receipt, so upstream quarantine waiting remains outside this fragment.

[n17 — supersedes n16; agent/inferred; settled] `construction/n17`

Constructed and inspected a partial post-Quality Flowbind lot-routing fragment from n14–n15: a pre-labelled lot in FlowbindQualityResultKnown has exactly one of two predicate-enabled transitions, passing to ReleasedFlowbindLots or failing to DisposedFlowbindLots; its lot UUID is preserved. A boolean represents the externally established aggregate result of Quality checks; it does not determine the checks, their time, or rejection probability. One token is one whole lot, not one unit of material. Inventory quantity, quarantine delay, costs, purchasing policy, live SAP inputs and production demand remain outside this fragment. The net tool accepted mutations, inspected structure matches the two stated outcomes, and function compilation reported no errors or warnings; no simulation or policy evaluation occurred.

[n21 — superseded by n22; agent/inferred; tentative] `construction/n21`

From n19–n20, carry a lot's Flowbind quantity as a real-valued number of the operation's 'units' through the already represented Quality pass/reject split. This is a representation inference: real-valued storage does not assert that fractional units occur; whether inventory records whole units only remains unasked. The existing one-token-per-lot marking remains distinct from unit-based material stock.

[n22 — supersedes n21; agent/inferred; settled] `construction/n22`

Inspected net now carries units as a real-valued attribute per Flowbind lot through the Quality pass/reject split; a saved metric sums units of represented released lots. This choice translates n19–n20 without assuming 700 as a fixed batch size. One token remains one lot, not one unit; stored real numbers do not assert fractional physical units. The metric excludes any initial warehouse stock, receipts not inserted at the Quality-decision boundary, Sonaflozin, production consumption, and buying. The type/kernel change briefly exposed a missing output field, which was repaired; subsequent net function diagnostics report no errors/warnings. Saved metric compilation and runtime behavior have not been tested.

[n27 — superseded by n30; agent/inferred; open] `construction/n27`

Do not yet automate the n24 quantity rule: 'on hand' in its inventory-position formula has not been resolved against n9's separate released versus quarantined supply, and minimum-order rounding and already-on-order accounting are unknown. The approximate 5,000-unit target can be kept in the Ledger without making it a falsely exact net default. Current Quality fragment remains unchanged; revisit after the accounting definition is settled.

[n30 — supersedes n27; superseded by n33; agent/inferred; open] `construction/n30`

The on-hand ambiguity in n27 was resolved by n28: order-up-to position includes quarantine as well as released stock, whereas dependable near-term coverage does not. An executable inventory-position calculation is still blocked on how the units remaining on an open order are counted as lots arrive or partially arrive, the vendor's minimum adjustment, and an exact or explicitly accepted nominal 5,000-unit target. Until then, the existing Quality fragment must not be presented as a purchasing-policy model.

[n33 — supersedes n30; superseded by n34; agent/inferred; tentative] `construction/n33`

Open-order-to-quarantine double counting is resolved by n31–n32. Representing a static policy inventory-position measure is now possible by summing unit quantities in separate open-order, quarantined and released categories; this does not require inventing arrival timing. However an automated arrival transfer, partial-delivery split, exact target, and minimum-order rounding remain unsupported, so keep those outside executable flow until clarified. Current net still lacks open-order/quarantine state and the position measure.

[n34 — supersedes n33; agent/inferred; settled] `construction/n34`

The inspected partial net now has distinct externally populated open-order and quarantined Flowbind quantity states, alongside the previously built known-Quality-result and released states. A saved inventory-position metric sums their units for a prepared snapshot; a separate released-units metric preserves conservative usable-stock visibility. This reflects n28–n32, but no arrival/booking transfer connects open orders to quarantine, no external marking enforces unique placement, and the Quality-result boundary is externally populated. A repeated lot in more than one category would be double counted; this is not a proof of SAP's one-count invariant. The approximate target and minimum rounding are not encoded. Function-code diagnostics report no errors/warnings, but metric execution has not been tested.

[n37 — agent/inferred; open] `construction/n37`

Do not turn the early-order judgment in n36 into a deterministic guard, numerical risk score, or fixed lead-time cutoff. The supported distinction is a typical-condition automatic reorder rule versus discretionary early action when supply and demand risks stack up. Until an observable decision signal or case-based proxy is established, leave this policy choice as a human/external boundary and preserve its rationale in the Ledger.

[n41 — agent/inferred; open] `construction/n41`

n38–n40 give observable evidence channels for n36 but no numerical relationship between supplier busy notice and lead-time distribution, or between recent batch overrun and future orders. Current net has no production-order history or supplier signal inputs. Encoding 'busy' as a probability change or a deterministic early-order trigger would invent a policy; keep the timing choice external until a bounded contrast or authorized assumption establishes a usable rule.

[n44 — agent/inferred; open] `construction/n44`

The current net neither ages inventory nor measures capital tied up, expiration, line idle time, or late customer orders. n42 supplies a qualitative trade-off but no numeric objective weights; n43 supports a material-specific shelf-life distinction but not an expiry timer or threshold. Do not optimize purchasing against the currently saved stock metrics as a surrogate for service/cost or infer that the policy works.

[n47 — superseded by n50; agent/inferred; open] `construction/n47`

An expiry path cannot yet be faithfully added to the current released-lot state: n45 establishes blocking and disposal, but the date/age source and comparison to simulation time are not established. An unconditional expiry transition would dispose all released stock immediately; an invented shelf-life duration would misstate the Flowbind/Sonaflozin difference in n43. The quality-rejection disposal branch is not an expiry proxy because its guard and accounting meaning differ.

[n50 — supersedes n47; agent/inferred; open] `construction/n50`

n48–n49 resolve the expiry evidence source: per-lot SAP expiry date established at first booking, with FEFO issue ordering and no issue past date. Still do not add an expiry transition to the current net without a simulation calendar/time origin and a way to compare a lot's date to now; current released-lot tokens have no expiry attribute. A production-consumption path and inventory quantities at issue are also absent, so FEFO cannot yet be checked behaviorally.

[n54 — agent/inferred; open] `construction/n54`

The two distinct horizons in n51–n52 can guide future scenario/run configuration but do not themselves add an executable event to the net. Two years must not be construed as the operation's fixed cycle; no initial inventory or arrival/demand pattern is yet supported for a simulation of either window. The mention of recalls in n53 is not enough to invent a recall transition.

[n58 — agent/inferred; open] `construction/n58`

Do not convert the conditional recall response in n55–n56 into an observed site failure rate or a guaranteed finished-goods recall. Adding a faithful recall-to-production path needs criteria for selecting affected lots, genealogy/finished-product linkage, how much unaffected released stock remains, and replacement timing; these are presently open. Current Flowbind Quality fragment is unchanged.

[n62 — agent/inferred; open] `construction/n62`

n59–n61 support the ordered Sonaflozin path transit → arrival → quarantine → release and that existing released stock insulated production in one approximately two-week delay. They do not supply a generic arrival rate or a two-week stochastic delay parameter; current net contains only Flowbind snapshot states and the Flowbind post-Quality branch. Adding a Sonaflozin timed supply path is blocked by general timing and admission details, not by the absence of a remembered case.

[n66 — agent/inferred; open] `construction/n66`

n63–n65 establish a consequential asymmetry: an urgent German Supplier Flowbind top-up can be considered, whereas Sonaflozin has no quick second source. No executable supplier-selection branch or production response is yet supported by quantities, lead times and contingency priorities; the net stays at the partial Flowbind snapshot/Quality fragment. Do not manufacture a Sonaflozin backup source or treat a Flowbind top-up as guaranteed.

[n69 — superseded by n72; agent/inferred; open] `construction/n69`

n67 provides contextual, approximate supplier lead-time starting points, but not a distribution family or reliable tail. Do not model '28 days ±3' as Gaussian standard deviation or bounded support, or assign Indian/German variability numbers. A timed transit mechanism needs clarification of timing scope and how to treat rare disruptions. Current net is unchanged.

[n72 — supersedes n69; agent/inferred; open] `construction/n72`

n70–n71 resolve timing scope for ordinary supplier lead times: order placement to booked receipt, combining preparation and transit; the current net should not fit independent preparation and transit clocks from these data. A single order-to-receipt interval could be a documented simplification, but no supported distribution for variability, rare delays or outages, no order-quantity handling, and no initial regime have been established; a numerical stochastic transition remains deferred.

[n76 — agent/inferred; open] `construction/n76`

n73–n75 support receipt-before-Quality-decision and a variable hold, but not a fitted distribution, exact capacity, or rejection rate. The current net begins only once Quality result is externally known; it cannot yet simulate four-day quarantine as a fixed delay or assert rare rejection probability. Revisit with Quality evidence or an explicitly authorized sensitivity assumption.

[n79 — agent/inferred; settled] `construction/n79`

Elena explicitly permits simplifying the detailed shared-Quality queue and supervisor priority (n77–n78), provided each lot still waits a hold period before usable release. Therefore a future model may represent a per-lot hold instead of full team contention, labelled as a simplification; this does not authorize an invented hold-time distribution, fixed four-day delay, pass probability, or full abandonment of urgent cases where their effect matters. Current net unchanged pending timing/outcome representation.

[n82 — agent/inferred; open] `construction/n82`

n80–n81 identify an actual decision for future experiments, but the partial net does not represent production use, order placement, transit/receipt, quarantine waiting or the reorder trigger; no saved regime or metric of production exposure exists. No tunable reorder-point range, horizon-specific starting state or numerical objective has been supplied. Do not draft an experiment or treat current policy-inventory-position metric as a service outcome.

[n85 — superseded by n86; agent/inferred; tentative] `construction/n85`

Using n83–n84, a saved policy threshold parameter of 1,500 units and target parameter of 5,000 units can now be grounded; a snapshot metric can report whether the represented Flowbind inventory position is strictly below 1,500. This is a representation inference, not automatic order generation, which still lacks a transaction event, vendor minimum and supplier choices. Snapshot booking must still avoid duplicate supply entries as noted in n34.

[n86 — supersedes n85; agent/inferred; settled] `construction/n86`

The inspected net now contains current Flowbind reorder-point and order-up-to parameters (1,500 and 5,000 units, from n83–n84), and a snapshot 0/1 metric reporting whether the represented policy inventory position is strictly below the reorder point. Function-code diagnostics report no errors/warnings, but saved metric compilation and runtime remain untested. This representation reports SAP's flag condition only; it does not automatically place an order, enforce correct booking, compute vendor-minimum rounding, or demonstrate timely usable supply.

[n90 — superseded by n93; agent/inferred; open] `construction/n90`

n88–n89 establish a two-material and line-availability start gate, but the partial net has neither Sonaflozin released-stock state nor production orders or line resource. Crucially the released Flowbind representation is one token per lot with unit quantity; issuing a whole batch might consume portions from several lots and leave remainders, with FEFO from n48. That allocation/splitting rule and line count/duration are missing, so a single-lot or unconditional start transition would violate the full-batch requirement. No production gate added yet.

[n93 — supersedes n90; agent/inferred; open] `construction/n93`

n91–n92 resolve whether full-batch issue may span lots and what partial consumption does: combined released quantity may cover a batch, with remaining units under the same lot identity and FEFO preference. The current Petri fragment still lacks a variable-number-of-lots reservation/issue mechanism, production order quantity, Sonaflozin released lots, and line availability. Consuming whole lot tokens for one batch or dropping remainders would misrepresent n91, so production start remains unimplemented pending a bounded allocation design and line account.

[n96 — superseded by n99; agent/inferred; open] `construction/n96`

n94–n95 establish one-line sequential production and approximate batch intervals, but do not prove line occupation equals the full roughly one-week start-to-ready-for-release duration. The current net lacks any production/line states; adding a stochastic batch clock or reliable every-two-week order arrival would treat approximate practice as an unsupported distribution or schedule. Remains blocked alongside allocation gap n93.

[n99 — supersedes n96; agent/inferred; open] `construction/n99`

n97–n98 clarify that line occupancy ends after batch completion plus cleaning/check, whereas finished-goods QA release is a parallel path. A future production fragment needs a separate line-return structure from finished-lot release, not a single 'week then both free' transition. Durations and demand/issue path still missing; current net remains unchanged.

[n101 — agent/inferred; settled] `construction/n101`

Using a nominal one-week production duration without a finer manufacturing/line-cleaning split is a person-authorized planning-resolution simplification based on n100. It must not be interpreted as a measured deterministic duration or as including finished-goods QA release. A later production fragment may return the single-line resource at the modeled end of that week, naming this approximation; actual batch admission and multi-lot material issue remain unimplemented.

[n104 — agent/inferred; open] `construction/n104`

n102–n103 establish an external changing production schedule, not a supported periodic generator or batch-size distribution. A future scenario might take planned batch dates/sizes from a snapshot of the planning schedule; synthesizing every-two-week 700-unit jobs as if measured deterministic demand would hide the variability that motivates early ordering. Current net lacks scheduled-order admission and remains unchanged.

[n107 — superseded by n110; agent/inferred; open] `construction/n107`

No current saved metric measures either n105 outcome. The net has no customer-order due dates, finished-goods QA/shipments, line idle state or cause of idleness, and so cannot compute on-time fill or material-caused idle frequency. Do not use released Flowbind units or reorder flag as proxies for those outcomes or draft an experiment with them as policy objectives. Need operational measure definitions and connected demand/production/delivery behavior first.

[n110 — supersedes n107; superseded by n113; agent/inferred; open] `construction/n110`

n108–n109 establish whole-order-line (not units shipped or partial shipment) as the fill unit. Still no connected customer-order/finished-stock/shipping path, due-date evidence, denominator semantics, or material-caused idle event. Current net unchanged; saved stock metrics cannot stand in for on-time order-line fill or idle frequency, and an optimization proposal is not ready.

[n113 — supersedes n110; superseded by n115; agent/inferred; open] `construction/n113`

n111–n112 now identify dispatch of a complete Sonic Flow order line against its recorded delivery date as the in-boundary service event, not downstream receipt. The net still has no order lines, due dates, finished-goods stock, QA release or dispatch path, so no valid on-time fill metric can be added yet. The start/window denominator and timing semantics still need clarification; current net unchanged.

[n115 — supersedes n113; agent/inferred; open] `construction/n115`

n114 resolves the on-time denominator: lines due within horizon, including those undispached by its end as late/unfilled; full dispatch by due date is success. A future metric needs retained per-line due date, full quantity and dispatch status/timestamp across the horizon, plus starting outstanding orders. The current net has none of those and cannot compute this ratio, regardless of its clean function-code diagnostics. No new net elements were added.

[n118 — agent/inferred; open] `construction/n118`

n116–n117 define a specific future delay measure rather than generic idle-line time: a scheduled ready order blocked by inadequate released material, measured planned-to-actual start. The current net has no scheduled production orders, timestamps, blocked cause or actual start; no delay metric can yet be responsibly saved. It would be wrong to count every unoccupied-line interval as shortage.

[n120 — agent/inferred; open] `construction/n120`

A future model should accumulate separate eligible-order waiting intervals for material-short with line free and line-busy, from n119. This is a representation inference, not an already measured accounting split. Do not charge the same interval wholly to both causes. Combined-case attribution after concurrent constraints are unresolved; Elena permits a labelled simplification but has not selected its exact rule. Current net lacks line and scheduled-order states, so no such metric exists yet.

[n122 — agent/inferred; open] `construction/n122`

A future scenario can expose Flowbind reorder point as a real-valued (unit count) tunable with approximate 1,000–2,500-unit candidate range and current default 1,500, based on n121. The current net has only the parameter and flag-reporting metric, not automatic ordering, demand, delay or fill outcomes, nor a saved scenario and initial snapshot. Do not draft optimization from these snapshot proxies or claim the bounds meet a service or expiry constraint.

[n124 — superseded by n126; agent/assumed; tentative] `construction/n124`

Person-authorized provisional snapshot for exploring the current partial Flowbind net (n123): agent chooses released 1,200 units in one lot, quarantined 200 units in one lot, and open-order balance 100 units in one supply chunk. Total policy position 1,500 units sits exactly at the strict trigger (no automatic flag below 1,500) while released stock is less than about two 700-unit batches. These numbers and one-lot grouping are agent assumptions for a boundary example, not SAP observations, typical stock, or validated purchasing conditions. Without modeled demand/arrivals, this scenario can exercise only snapshot accounting and Quality routing; replace after a dated SAP extract.

[n126 — supersedes n124; agent/assumed; tentative] `construction/n126`

The inspected net now includes a saved 'Provisional Flowbind policy snapshot' with agent-chosen 1,200 released, 200 quarantined and 100 open-order units, one lot/chunk in each category, plus an integer reorder-point scenario parameter defaulting to 1,500 units. These are person-authorized plausible assumptions (n123), chosen to put total position exactly on the strict flag boundary while released stock is below about two typical batches; they are not SAP data or a valid future-arrival/demand regime. Per-place scenario and saved metric compilation have not been exercised; net function-code diagnostics show no errors/warnings. Use only for checking snapshot semantics after execution is separately authorized, not for policy performance or optimization.

## Cross-cutting open matters [open-matters]

_No Notes recorded._

## Delivery status [delivery]

[n18 — superseded by n23; agent/inferred; settled] `delivery/n18`

Current output is a partial Flowbind Quality-outcome net fragment, not a purchasing policy model. Tool mutations succeeded and the inspected structure has the pass/reject split; TypeScript/HIR diagnostics report no function-code errors or warnings. No scenario or metric compilation, behavioral run, cost accounting, lead-time, quarantine waiting, SAP integration, or purchasing-policy comparison has been checked. Open purchasing criteria (n8) and initial/in-transit/quarantine quantity and timing prevent using the fragment to judge buying decisions.

[n23 — supersedes n18; superseded by n35; agent/inferred; settled] `delivery/n23`

Current net is a partial Flowbind Quality-outcome fragment with lot quantity carried into usable or disposed states and a released-units metric. Changes were tool-schema accepted, inspected, and structurally reviewed against n14–n15 and n19–n20; function-code diagnostics report no errors/warnings. Saved metric compilation, any simulation, and purchasing-policy performance remain untested. Missing initial stocks, in-transit/quarantine timing, Sonaflozin inventory, production demand timing, supplier behavior and purchasing criteria prevent policy assessment.

[n35 — supersedes n23; superseded by n87; agent/inferred; settled] `delivery/n35`

The partial net has a structurally inspected Quality pass/disposal branch and separate snapshot categories for open orders, quarantine and released Flowbind units, with metrics for released units and the policy inventory-position sum. Tool-schema acceptance and no reported net function-code diagnostics are established; saved metric compilation and behavior are not. The supply-category handoffs, unique booking, initial stocks, production consumption, sourcing reliability, timing, exact order-up-to target/minimum rounding and early-order judgment remain unmodelled. It cannot establish whether purchasing policy covers production or performs under disruption.

[n87 — supersedes n35; superseded by n127; agent/inferred; settled] `delivery/n87`

Partial inspected model: Flowbind lot Quality pass/disposal, snapshot open-order/quarantine/released quantities, position and released-stock metrics, and parameterized 1,500-unit reorder flag plus 5,000-unit order-up-to target. Tool-schema changes were accepted and net function diagnostics show no errors/warnings. No saved metric execution or simulation has occurred. It does not yet model order placement, supplier arrival, variable Quality hold, production consumption, Sonaflozin/FEFO/expiry or disruption; it cannot test whether the trigger leaves production covered.

[n127 — supersedes n87; agent/inferred; settled] `delivery/n127`

Partial inspected model now additionally has a saved, explicitly agent-assumed Flowbind snapshot scenario with tunable reorder-point setting. The net structurally represents pass/reject routing and inventory-position/flag reporting, not moving purchase orders through receipt and quarantine or production and customer delivery. Mutation schemas accepted it; net function diagnostics are clean, but scenario/metric compilation and any actual execution remain untested. It cannot yet answer whether 1,000–2,500-unit trigger settings meet full-order on-time dispatch or avoid material-caused production delay.
