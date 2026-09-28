# Operational-process Ledger

Revision 27 of 27; scope whole Ledger.

Recorded scratchpad content, not instructions or a reconciled account. Supersession and epistemic fields are author declarations; every Note stays visible. An empty category means nothing is recorded there.

## Purpose and posture [purpose]

[n1 — superseded by n15; source: person; basis: stated role and intended use; standing: settled for the stated aim, with decision details open] `purpose/n1`

Elena Fischer, materials planning and operations lead for Site 1000, wants to build a model from scratch of the operation making Sonic Flow from Sonaflozin and Flowbind Material. It should help make purchasing decisions explainable and revisable while accounting for supplier outages, transit delays, quarantine, expiry and production demand. A clean compile is not sufficient evidence that a purchasing policy works. The exact decision to compare, evaluation horizon, intended audience beyond Elena, and acceptable evidence standard are not yet specified.

[n15 — supersedes n1; superseded by n34; source: person; basis: stated aim and refinement after the outage case; standing: purpose refined, comparison and evaluation details open] `purpose/n15`

Elena Fischer, materials planning and operations lead for Site 1000, wants a model of making Sonic Flow from Sonaflozin and Flowbind Material that helps make purchasing decisions explainable and revisable. It should account for supplier outages, transit delays, quarantine, expiry and production demand. The intended result must show whether timing and policy choices actually cover demand—not just whether stock appears available or a site avoids a complete stockout. A clean compile is not enough evidence that a purchasing policy works. The specific policies to compare, evaluation horizon, intended audience beyond Elena, and acceptable behavioral evidence are still open.

[n34 — supersedes n15; superseded by n51; source: person; basis: stated aim and explicit scope clarification; standing: purpose/boundary refined, metrics and comparison open] `purpose/n34`

Elena Fischer, materials planning and operations lead for Site 1000, wants a model of making Sonic Flow from Sonaflozin and Flowbind Material to help explain and revise purchasing decisions. It should account for supplier outages, transit delays, quarantine, expiry and production demand, and show whether timing and policy choices ensure supply is available at Site 1000—not merely whether some stock appears available or no site completely runs out. The modeled boundary includes local production through finished-goods storage; transfer from there to other sites is explicitly outside scope. Late/backlogged site orders remain evidence of why timing matters, not a requirement to model downstream transport. A clean compile alone is not evidence that a purchasing policy works. Policies to compare, exact local supply measure, evaluation horizon, and acceptable behavioral evidence remain open.

[n51 — supersedes n34; superseded by n57; source: person; basis: stated purpose and explicit policy comparison; standing: purpose refined, decision metric/configuration open] `purpose/n51`

Elena Fischer, materials planning and operations lead for Site 1000, wants a model to support explainable, revisable purchasing and production-planning choices for Sonic Flow made from Sonaflozin and Flowbind Material. It should account for supplier outages, transit delays, quarantine, expiry and demand, and show whether timing/policy choices ensure supply availability at Site 1000. The specific comparison now in scope is a static target batch quantity based on historical patterns versus a plan that lets live order arrivals pull that target up or down. Finished-goods storage is the modeled downstream boundary; inter-site transfers are outside scope. A clean compile alone is not evidence that a policy works. The outcome metric/direction, policy adjustment rule and range, evaluation horizon/regime, and acceptable behavioral evidence remain open.

[n57 — supersedes n51; superseded by n63; source: person; basis: stated purpose and decision objective; standing: refined, exact measure/constraint status open] `purpose/n57`

Elena wants a model for Site 1000 that compares a static target batch quantity built from historical patterns with a target pulled up or down by live order arrivals. The model should show actual trade-offs rather than merely confirm the team's current leaning toward live-rate adjustment. Her stated priority is fill rate above 95%; production delay and expiry losses also matter, roughly equally after fill rate. She says late-delivery charges and expired-stock write-offs are real. The boundary ends at finished-goods storage at Site 1000; transfers to other sites are outside scope. The definitions and enforceability of the goals, adjustment rule/range, operating horizon, and evidence standard remain open.

[n63 — supersedes n57; superseded by n75; source: person; basis: stated decision, priorities and clarification; standing: scope/measure concept refined, precise metric/constraint open] `purpose/n63`

Elena wants a model for Site 1000 comparing a static target batch quantity built from historical patterns with a target pulled up or down by live order arrivals. It should reveal actual trade-offs, not merely confirm the team's current leaning toward live-rate adjustment. Fill rate is measured at Site 1000: finished stock ready by the order's requested date, not delivery to the destination. Her stated priority is fill rate above 95%; production delay and expiry losses also matter, roughly equally after fill rate. The boundary ends at finished-goods storage, with inter-site transfers excluded. Whether >95% is a hard minimum or an aspirational target, the fill-rate aggregation rule, policy adjustment rule/range, horizon and acceptable evidence remain open.

[n75 — supersedes n63; superseded by n82; source: person; basis: stated decision and clarifications; standing: policy comparison, fill-rate basis and target status settled, other measures/configuration open] `purpose/n75`

Elena wants a model for Site 1000 comparing a static target batch quantity built from historical patterns with a target pulled up or down by live order arrivals. It should reveal actual trade-offs rather than merely confirm the team's current leaning toward live-rate adjustment. Fill rate is the volume-based share of requested units ready in Site 1000 finished-goods storage by requested date; partial quantities count and downstream delivery is excluded. Above 95% is a target to compare against, not a hard constraint. A separate zero-tolerance floor for any individual site has not been formally defined. Production delay and expiry losses matter roughly equally after fill rate. The adjustment rule/range, metric aggregation window, delay/expiry measures, horizon and acceptable evidence remain open.

[n82 — supersedes n75; source: person; basis: decision and measure clarifications; standing: horizon and headline measure settled, policy rule and secondary measures open] `purpose/n82`

Elena wants to compare a static target batch quantity built from historical patterns with a target influenced by live order arrivals. The primary outcome is the volume share of requested Sonic Flow units ready in Site 1000 finished-goods storage by requested date, with partial units counted; downstream delivery is excluded. Above 95% is a comparison target, not a hard constraint, and no individual-site zero-tolerance floor is formally defined. The headline fill rate is assessed over the full two-year planning horizon; monthly breakdowns are informative but not the headline target. Production delay and expiry losses also matter, roughly equally after fill rate. The adjustment rule/range, delay/expiry measures and exact treatment of cancellations/revised dates remain open.

## Operational account [operational]

_No Notes recorded._

### Goals, measures and constraints [operational/goals]

[n17 — superseded by n52; source: person; basis: stated modeling purpose informed by recalled outcome; standing: settled qualitatively, metric/threshold open] `operational/goals/n17`

For purchasing-policy assessment, Elena wants the model to show whether material, production and delivery timing actually cover demand. She specifically does not want a result that looks successful merely because stock was on hand or no site completely ran out: the remembered outage response still produced backlogged contract orders and late deliveries. Exact service measure, acceptable lateness/backlog threshold, and trade-off between shortage risk and other purchasing costs have not yet been specified.

[n52 — supersedes n17; superseded by n58; source: person; basis: stated decision and team concern; standing: comparison settled, criterion and constraints open] `operational/goals/n52`

The desired comparison is a static target batch quantity built from historical patterns versus a policy that lets live order arrivals move the batch quantity up or down. The outcome should reflect whether production timing and quantities cover demand at Site 1000, not merely whether stock exists at an instant. Elena's team currently leans toward the live-order-rate approach, but worries a noisy estimate could cause overproduction or underproduction; this is a concern, not a measured effect. No objective measure/direction, acceptable shortage/overproduction trade-off, threshold, policy range, or horizon has been specified.

[n58 — supersedes n52; superseded by n64; source: person; basis: stated priorities and business consequences; standing: qualitative priorities settled, metric/constraint interpretation open] `operational/goals/n58`

For the static-versus-live-rate batch-planning comparison, fill rate is Elena's first priority: “we can't have sites running out of Sonic Flow,” and she frames the target as keeping fill rate above 95%. After that, production delay and expiry losses matter “roughly equally”; late deliveries carry charges and expired stock is written off. She wants the model to reveal trade-offs, not just confirm the current team leaning. The fill-rate numerator/denominator and timing basis are undefined, it is not yet clear whether >95% is a hard minimum or an aspirational target, and the relation between the “no site running out” statement and an aggregate 95% threshold is unresolved. No numeric delay or expiry threshold, cost values, or trade-off weights are supplied.

[n64 — supersedes n58; superseded by n71; source: person; basis: stated goals and boundary clarification; standing: priority and availability scope settled, measurement and enforcement open] `operational/goals/n64`

For the static-versus-live-rate planning comparison, fill rate means finished Sonic Flow ready in Site 1000 finished-goods storage by the requested date, not actual arrival at a site. Fill rate is the first priority and Elena frames it as above 95%, alongside “we can't have sites running out of Sonic Flow.” Production delay and expiry losses matter roughly equally after fill rate; late-delivery charges and expired-stock write-offs are real. The denominator/aggregation window and partial-order treatment remain undefined, as does whether >95% is a hard minimum or target and how it relates to “no site running out.” No numerical delay/expiry threshold or cost values/weights are supplied.

[n71 — supersedes n64; superseded by n76; source: person; basis: stated goal and explicit measure clarification; standing: volume basis settled, aggregation/enforcement open] `operational/goals/n71`

For the static-versus-live-rate planning comparison, fill rate is volume-based: requested Sonic Flow units ready at Site 1000 by their requested dates contribute to the measure; partial fulfillment counts the units ready, not only complete order lines. Fill rate is first priority, framed as above 95%, alongside “we can't have sites running out.” Production delay and expiry losses matter roughly equally after fill rate; late-delivery charges and expiry write-offs are real. The aggregation period and treatment of cancellations/revised dates remain open. It is not yet established whether >95% is a binding minimum or aspirational target or how it relates to the no-stockout statement. No numerical delay/expiry threshold or cost values/weights are supplied.

[n76 — supersedes n71; superseded by n83; source: person; basis: goal and clarification of threshold status; standing: target status and measure concept settled, aggregation and secondary measures open] `operational/goals/n76`

For the static-versus-live-rate planning comparison, the primary outcome is volume-based fill rate: requested Sonic Flow units ready in Site 1000 finished-goods storage by requested date, with partial quantities counted and downstream delivery excluded. Above 95% is a target to compare against, not a hard model constraint; no separate zero-tolerance floor for an individual site is formally defined. Production delay and expiry losses matter roughly equally after fill rate; late charges and expiry write-offs are real. Aggregation window and treatment of cancellations/revised dates remain open, and no numerical delay/expiry threshold or cost values/weights are supplied.

[n80 — superseded by n81; source: person; basis: explicit clarification; standing: settled as stated] `operational/goals/n80`

Above 95% fill rate is a target to compare against, not a hard constraint the model must enforce. Elena states there is no formally defined zero-tolerance floor for any individual site.

[n81 — supersedes n80; source: agent; basis: Ledger verification; standing: superseded duplicate] `operational/goals/n81`

Withdrawn as a duplicate; the fill-rate target and absence of an individual-site zero-tolerance floor are recorded in operational/goals/n76.

[n83 — supersedes n76; source: person; basis: explicit horizon and goal clarifications; standing: headline period/target status settled, secondary measurement open] `operational/goals/n83`

For the static-versus-live-rate comparison, the headline outcome is volume-based requested units ready in Site 1000 by requested date over the full two-year planning horizon; partial units count and downstream arrival is excluded. Monthly breakdowns are informative, not the headline target. Above 95% is a comparison target, not a hard constraint; no per-site zero floor is formally defined. Production delay and expiry losses matter roughly equally after fill rate; late charges and write-offs are real. Cancellation/revised-date treatment and the secondary delay/expiry measures remain unspecified.

### Boundary and initial conditions [operational/boundary]

[n29 — source: person; basis: current operational account; standing: settled for contract orders, spot intake context open] `operational/boundary/n29`

For the contract orders under discussion, demand enters when customers place orders rather than through a fixed committed forward schedule; Site 1000 sees order lines in SAP as they arrive. Historical order-arrival patterns inform production planning. Whether spot orders use the same intake pattern has not been stated.

[n35 — superseded by n62; source: person; basis: explicit scope statement; standing: settled for downstream transfer exclusion, measure open] `operational/boundary/n35`

For this model, local production ends when finished Sonic Flow is placed in finished-goods storage at Site 1000. Transfers from that storage to other sites are explicitly outside the modeled boundary. Site 1000's upstream material availability, production and finished-goods availability remain in scope; the exact stock measure used to judge supply coverage has not yet been defined.

[n62 — supersedes n35; superseded by n70; source: person; basis: explicit boundary and measure clarification; standing: boundary/availability concept settled, metric calculation open] `operational/boundary/n62`

For this model, local production ends when finished Sonic Flow is placed in finished-goods storage at Site 1000. Fill rate means finished stock was available at Site 1000 by the requested date; it does not mean stock arrived at the destination. Transfers from that storage to other sites are explicitly outside scope. The exact numerator/denominator, aggregation period and treatment of partial orders remain unspecified.

[n68 — superseded by n69; source: person; basis: explicit clarification; standing: settled] `operational/boundary/n68`

Fill rate is evaluated at Site 1000 as finished Sonic Flow ready in finished-goods storage by the order's requested date. It is not actual transfer or delivery to the destination; those downstream activities remain outside the modeled boundary.

[n69 — supersedes n68; source: agent; basis: Ledger verification; standing: superseded duplicate] `operational/boundary/n69`

Withdrawn as a duplicate; the boundary and Site 1000 fill-rate definition are recorded in operational/boundary/n62.

[n70 — supersedes n62; source: person; basis: explicit clarification; standing: metric basis and boundary settled, aggregation details open] `operational/boundary/n70`

For this model, local production ends when Sonic Flow enters finished-goods storage at Site 1000. Fill rate is volume-based: it is the share of requested units ready at Site 1000 by the requested date; a partially ready order contributes the units that are ready, rather than counting only fully filled order lines. It does not measure destination arrival. Transfers to other sites remain outside scope. The period over which the rate is aggregated and treatment of cancellations/revised requested dates remain unspecified.

### Participants, things and resources [operational/resources]

[n3 — superseded by n93; source: person; basis: recalled operational account; standing: settled as stated] `operational/resources/n3`

Site 1000 makes Sonic Flow from Sonaflozin and Flowbind Material. Elena says Sonaflozin is available only from the supplier she called “Chinese Supplier,” so substitution is not easy. Other sites draw Sonic Flow from Site 1000. No quantities, lot structure, or supply allocation among those sites were given.

[n37 — superseded by n42; source: person for availability prerequisite; basis: current operational account; standing: prerequisite settled, capacity and reservation details open] `operational/resources/n37`

A production line must be free for Sonic Flow production to begin. The number of eligible lines, whether one line is tied up for the full batch, and how line availability is released after completion or failure are not yet established.

[n42 — supersedes n37; source: person; basis: current operational account; standing: availability and full-run occupation settled, capacity/competition/handover open] `operational/resources/n42`

The production line must be free at batch start and is occupied throughout the approximately week-long batch. Another batch cannot start until the line becomes free and the required materials are available. The number of eligible lines, other uses that contend for them, and exact release/handover point at completion are not yet established.

[n93 — supersedes n3; source: person; basis: current operational account; standing: supplier roles as stated, urgency criterion and timing open] `operational/resources/n93`

Site 1000 makes Sonic Flow from Sonaflozin and Flowbind Material. Chinese Supplier is the only source Elena identifies for Sonaflozin. Flowbind is normally supplied by Indian Supplier; German Supplier provides smaller urgent top-ups when Flowbind is critically low and Site 1000 cannot wait for the Indian Supplier. Other sites draw Sonic Flow from Site 1000, but their transfers are outside the model boundary. Material amounts and supplier lead-time performance are recorded separately or remain open.

### Activities and resource use [operational/activities]

[n8 — source: person; basis: recalled operational account; standing: settled for the stated required checks and gate, other outcomes open] `operational/activities/n8`

For Sonaflozin held in quarantine, Quality checks the certificate of analysis, packaging, supplier identity and quantity, and whether there is damage. Formal Quality sign-off is required before the material can move to production. In the recalled outage case, the release was approved and the hold added a few days that had not been planned for. The general release decision criteria beyond these checks, outcomes when a check does not pass, and whether the checks or timing vary by lot are not yet described.

[n36 — superseded by n41; source: person for prerequisites, approximate duration and output state; standing: settled at stated granularity, resource/input semantics open] `operational/activities/n36`

Production of Sonic Flow requires both Sonaflozin and Flowbind Material to be available and the production line to be free. Production takes about a week; when the batch completes, Sonic Flow is in finished-goods storage. The quantities consumed or transformed per batch, whether inputs are committed at start or consumed in stages, and how the line is held/released during the batch have not been specified.

[n41 — supersedes n36; superseded by n46; source: person; basis: current operational account and explicit clarification; standing: settled at stated granularity, amounts/calendar open] `operational/activities/n41`

Sonic Flow production starts only when both Sonaflozin and Flowbind Material are available and the production line is free. Elena confirms both materials are consumed when a batch starts, and the line remains occupied for the week-long run, so another batch cannot start on that line until it is free and materials are again available. On completion, Sonic Flow enters Site 1000 finished-goods storage. The quantity of each material consumed and finished-goods output per batch remain unspecified; the exact calendar for “about a week” remains open.

[n46 — supersedes n41; source: person; basis: current operational account and explicit clarification; standing: refined, batch-sizing rule open] `operational/activities/n46`

Sonic Flow production starts only when Sonaflozin, Flowbind Material and a free production line are available. Both materials are consumed at batch start; the line remains occupied through the approximately week-long run, so another batch cannot start on that line until it is free and materials are available. On completion, Sonic Flow enters Site 1000 finished-goods storage. The bill of materials is 1 unit Sonaflozin + 1 unit Flowbind Material -> 1 unit Sonic Flow. Batch size varies with demand; see the quantity and policy Notes from this exchange for the approximate recorded average and the still-unknown sizing rule. The exact calendar/variability of the duration and batch-specific quantities are not fully established.

### Cases and process spine [operational/process-spine]

[n4 — superseded by n7; source: person; basis: recalled case; standing: settled as a single incident, not generalized] `operational/process-spine/n4`

About eight months before this account, Chinese Supplier had an outage. Site 1000 received no usual forward signal—Elena recalls “just silence on a pending order”—and confirmed the outage only after Sonaflozin stock had dipped close to the reorder point. The choice was to wait and risk stopping production, or use aged Sonaflozin held in quarantine release and move the production schedule forward to build a finished-goods buffer. Site 1000 chose to run the early batch, aiming to avoid a supply gap for the other sites. This is one remembered case, not yet an established general purchasing rule; the actual outcome for supply to other sites has not yet been stated. The exact timing and steps between outage, confirmation, quarantine handling, production and distribution remain undescribed.

[n7 — supersedes n4; superseded by n11; source: person; basis: recalled case; standing: refined, not generalized] `operational/process-spine/n7`

About eight months before this account, Chinese Supplier had an outage. Site 1000 received no usual forward signal—Elena recalls “just silence on a pending order”—and confirmed the outage only after Sonaflozin stock had dipped close to the reorder point. The choice was to wait and risk stopping production, or use aged Sonaflozin held in quarantine and move the production schedule forward to build a finished-goods buffer. Quarantined material could move to production only after Quality formally signed it off; see the related activity account. In this case release came through, but added a few unplanned days. Site 1000 chose to run the early batch, aiming to avoid a supply gap for the other sites. This remains one remembered case, not an established general purchasing rule. The actual supply outcome, the timing and volume of production, and subsequent distribution remain unstated.

[n11 — supersedes n7; superseded by n16; source: person; basis: recalled case; standing: refined by clarification, not generalized] `operational/process-spine/n11`

About eight months ago, Chinese Supplier had an outage. Site 1000 received no usual forward signal—Elena recalls “just silence on a pending order”—and confirmed the outage only after Sonaflozin stock had dipped close to the reorder point. The choice was to wait and risk stopping production, or use aged Sonaflozin held in quarantine and move the production schedule forward to build a finished-goods buffer. Quality had to formally release the lot before it could move to production; see operational/activities/n8 for the checks. The release came through and added a few unplanned days. The lot was close to finishing its quality review, not close to expiry; its shelf life was still well within range. Site 1000 chose to run the early batch to avoid a supply gap for other sites. This remains one remembered case, not a general purchasing rule; the actual supply outcome, production quantity/timing, and later distribution have not been stated.

[n16 — supersedes n11; superseded by n39; source: person; basis: recalled case and observed outcome as reported; standing: refined, not generalized] `operational/process-spine/n16`

About eight months ago, Chinese Supplier had an outage. Site 1000 received no usual forward signal—Elena recalls “just silence on a pending order”—and confirmed the outage only after Sonaflozin stock had dipped close to the reorder point. The choice was to wait and risk stopping production, or use aged Sonaflozin held in quarantine and move the production schedule forward to build a finished-goods buffer. Quality had to formally release the lot before it could move to production; see operational/activities/n8 for the checks. In this case, release came through and added a few unplanned days; the lot was close to finishing its quality review, not close to expiry, and its shelf life was still well within range. Site 1000 chose to run the early batch. During the gap before the batch finished, some contract orders became backlogged and a few deliveries were late, but no site went completely without Sonic Flow. This is one remembered case, not a general purchasing rule. Exact backlog, order/delivery counts, delay lengths, production quantity/timing, and what happened to backlog after the batch finished are unknown.

[n39 — supersedes n16; source: person; basis: remembered outage case plus current process description; standing: refined, not generalized] `operational/process-spine/n39`

About eight months ago, Chinese Supplier had an outage and Site 1000 received only silence on a pending order, not its usual forward signal. By confirmation time Sonaflozin stock was close to its reorder point. Site 1000 chose to use aged Sonaflozin held in quarantine—after Quality's formal release—and move production forward rather than wait and risk stopping production. Quality release added a few unplanned days; the lot was near finishing quality review, not expiry, and its shelf life was still well within range. Production requires both Sonaflozin and Flowbind Material and a free line; production generally takes about a week and completed Sonic Flow enters Site 1000 finished-goods storage (see the activity notes). Some contract orders were backlogged and a few deliveries were late before the batch finished, although no site went completely without. Transfers to other sites are outside the intended model boundary. This is one remembered case, not a general purchasing policy. Exact batch quantity/timing in this incident, order/backlog amounts, local finished-goods availability, and what happened to backlog after completion are not known.

### Time, quantities and variation [operational/quantities]

[n5 — source: person; basis: recalled case; precision: qualitative; standing: settled at this precision] `operational/quantities/n5`

In the recalled Chinese Supplier outage, Sonaflozin stock was “close to the reorder point” by the time the outage was confirmed. This is qualitative proximity only; the reorder-point value, stock quantity, unit, and time series were not supplied.

[n9 — superseded by n12; source: person; basis: recalled case; precision: qualitative and approximate; standing: first statement settled for this case, meaning of “hold” open] `operational/quantities/n9`

In the recalled outage case, Quality release added “a few days” beyond the plan; this is an approximate, case-specific delay, not a measured duration or general distribution. Elena also said the lot was “close to the end of its hold.” It is not yet clear whether “hold” means the quarantine period, remaining shelf life/expiry, or another deadline; do not equate it with expiry without clarification.

[n12 — supersedes n9; source: person; basis: recalled case and explicit clarification; precision: qualitative; standing: earlier ambiguity resolved] `operational/quantities/n12`

The phrase “close to the end of its hold” meant the lot was close to finishing its quarantine quality review; it did not mean close to expiry. Its shelf life was still well within range in this outage case. Elena also states that Sonaflozin continues aging during transit and quarantine, whether or not it has been released. No shelf-life duration, lot age, expiry threshold, clock origin, or unit was supplied. The previously recorded “few days” is a case-specific approximate delay for the quality release, not a general duration.

[n21 — superseded by n24; source: person; basis: current-practice account; precision: qualitative; standing: open for quantification] `operational/quantities/n21`

Contract-order lateness cost accumulates while orders remain late, but its rate, unit, amount and calculation rule are not yet known. Spot-customer cancellation is described only as occurring after waiting “too long”; no duration or threshold is supplied.

[n24 — supersedes n21; source: person; basis: current-practice account and explicit evidence limitation; precision: unquantified; standing: open] `operational/quantities/n24`

Contract-order lateness cost accumulates while orders remain late, but its rate, unit, amount and calculation rule are unknown. No reliable waiting-time duration or distribution is available for spot customers before they stop responding or go elsewhere. Elena says the team has discussed the issue but does not have clean data; do not infer a cancellation threshold, hazard, or probability from the discussion.

[n30 — source: person; basis: current operational account; precision: approximate and qualitative; standing: settled at this granularity] `operational/quantities/n30`

Order sizes are described qualitatively: most are “50-odd units,” and occasional large bulk orders occur. This is not an estimated mean or distribution. The exact quantity range, bulk-order definition and frequency, and order arrival rate over a stated period are unknown.

[n38 — source: person; basis: current operational account; precision: approximate; standing: settled at this granularity] `operational/quantities/n38`

Sonic Flow production takes “about a week.” This is an approximate general duration, not a measured distribution or exact constant. Calendar versus working days, variation by batch/load, and the precise start/finish events used for the duration are not yet specified.

[n43 — superseded by n47; source: person for consumption timing; source: agent for named unknowns; standing: consumption timing settled, quantities open] `operational/quantities/n43`

At each Sonic Flow batch start, both Sonaflozin and Flowbind Material are consumed. The quantity of either raw material per batch, finished Sonic Flow yield, unit conversions, and any loss or scrap are not yet supplied; no inventory balance or conservation ratio can be inferred from the account.

[n47 — supersedes n43; source: person; basis: ratio stated from operational knowledge and average attributed to production records not consulted here; precision: exact stated ratio, qualitative approximate average/spread; standing: ratio settled as stated, records and spread unverified] `operational/quantities/n47`

Elena states the bill of materials is 1 unit of Sonaflozin plus 1 unit of Flowbind Material per 1 unit of Sonic Flow. Batch sizes vary with demand rather than being fixed. She reports production records average around 700 units per batch, with “real spread” around that average; the records have not been shown or checked here, and no range, variance, distribution, period or demand condition is supplied. The approximately 700-unit average is not a fixed batch size or enough to infer a production-size distribution.

[n87 — source: person; basis: explicit evaluation-window clarification; standing: settled] `operational/quantities/n87`

The headline fill-rate evaluation window is the full two-year planning horizon. Monthly breakdowns are useful for interpretation but are not the headline target.

[n89 — superseded by n95; source: person for values and MOQ rounding; basis: current policy account; precision: exact reported values, unit/rounding semantics open] `operational/quantities/n89`

The stated replenishment settings are Sonaflozin reorder point 2,500 and target 7,500; Flowbind Material reorder point 1,500 and target 5,000. These values are in the inventory system's item units, which have not yet been explicitly named. The final purchase quantity is rounded to the supplier's minimum order size, but MOQ values and whether rounding is upward or another rule are unknown.

[n95 — supersedes n89; superseded by n103; source: person; basis: reported purchasing records not shown; precision: exact reported lot figures, item units and 250-unit interpretation open] `operational/quantities/n95`

Reported inventory targets remain Sonaflozin reorder point 2,500/target 7,500 and Flowbind reorder point 1,500/target 5,000, in item inventory units not yet explicitly named. Chinese Supplier orders for Sonaflozin and Indian Supplier orders for Flowbind are reported in 2,500-unit lots; the policy rounds up to the next 2,500-unit multiple. German Supplier's urgent Flowbind top-ups are 250 units. The quantities are attributed to purchasing records/practice not consulted here. Exact unit conversion and whether 250 means a single order size or a repeat increment remain unclear.

[n103 — supersedes n95; source: person; basis: reported records and current-practice account; precision: exact stated triggers/quantities, item units and timing open] `operational/quantities/n103`

Reported settings are Sonaflozin reorder point 2,500/target 7,500 and Flowbind reorder point 1,500/target 5,000 in item inventory units not yet named. Chinese Supplier/Sonaflozin and Indian Supplier/Flowbind use 2,500-unit order lots with round-up to the next multiple. Separately, when on-hand Flowbind is strictly below 500 units, a 250-unit German Supplier top-up is triggered regardless of Indian on-order quantity; this is an urgent top-up quantity, not stated as an increment. The route is faster but no lead-time value is supplied. Values/lot practices are reported by Elena from purchasing records not shown here.

[n108 — superseded by n115; source: person; basis: estimates fitted to purchasing records not shown; precision: approximate averages and qualitative variability; standing: reported estimates, unverified] `operational/quantities/n108`

Reported average time from purchase order placement to material arrival at Site 1000 is about 28 days for Chinese Supplier, 14 days for Indian Supplier, and 15 days for German Supplier. Elena says purchasing-record fits show variability of “a few days either side”; no distribution or tail measure is supplied, and calendar versus working-day convention is not stated. These are person-reported fitted averages, not record values checked here.

[n109 — source: person; basis: reported modelling assumption; precision: approximate; standing: explicitly assumed, not directly observed] `operational/quantities/n109`

Elena describes the split of PO-to-arrival time as about one week of supplier preparation and the remainder in transit, while explicitly identifying that split as a modelling assumption, not a directly measured breakdown. No supplier-specific split or measured preparation/transit timestamps are available in this account.

[n115 — supersedes n108; superseded by n121; source: person; basis: reported SAP timestamp fit, not independently inspected; precision: approximate averages and qualitative variability; standing: calendar-day interpretation tentative] `operational/quantities/n115`

Reported average time from purchase order placement to material arrival is about 28 calendar days for Chinese Supplier, 14 calendar days for Indian Supplier, and 15 calendar days for German Supplier. Elena says the averages were fitted from order/receipt timestamps in SAP and, “as best I know,” are calendar days; the records have not been shown or checked here. Variability is “a few days either side,” without a distribution or tail measure. No explicit working-day calendars have been modelled in this context.

[n121 — supersedes n115; source: person; basis: reported statistics fitted from records not consulted; precision: approximate means, reported standard deviations, German SD bounded only as under one day; standing: moments reported, distribution family open] `operational/quantities/n121`

Reported PO-to-arrival lead-time estimates are calendar-day means fitted from SAP records: Chinese Supplier ~28 days with SD 3.3 days; Indian Supplier ~14 days with SD 3.7 days; German Supplier ~15 days with SD under 1 day. Elena says these are fitted record statistics, but records have not been shown or checked here. The probability-distribution family is not established by operations or directly by the data; the team must choose a modelling assumption. Variability matters, so do not turn these moments into a deterministic delay or assume a normal distribution without an explicit modelling decision. No working-day calendar is modelled here.

### Policies and exceptions [operational/policies]

[n20 — superseded by n23; source: person; basis: described current practice; standing: settled as stated, threshold and prioritization open] `operational/policies/n20`

For contract customers, an order stays open in backlog if Sonic Flow is unavailable; Site 1000 fills it as soon as stock is available. Contract customers do not cancel while waiting, but lateness cost accumulates. Spot customers differ: they have less patience and may walk away if they wait too long. The amount of delay that triggers walking away and how demand is prioritized across order types have not yet been specified.

[n23 — supersedes n20; source: person; basis: current-practice account and limits of recall; standing: contract practice settled as stated, spot departure indication qualitative and threshold open] `operational/policies/n23`

For contract customers, an order stays open in backlog if Sonic Flow is unavailable; Site 1000 fills it as soon as stock is available. Contract customers do not cancel while waiting, but lateness cost accumulates. Spot customers are less patient and may walk away. Elena says they do not always announce cancellation; they may stop responding or go elsewhere, and the loss is recognized later in order records. She cannot point to a specific spot-order case demonstrating a wait limit. The actual cancellation signal, any practiced threshold, and prioritization between contract and spot orders are not established.

[n48 — superseded by n53; source: person; basis: current practice and reported records; standing: variability and demand dependence stated, sizing rule and records unverified] `operational/policies/n48`

Sonic Flow batch size is not fixed and varies depending on demand. Elena reports an average of about 700 units in production records with substantial spread, but the rule that maps current demand or the production plan to a batch size has not been specified.

[n53 — supersedes n48; source: person; basis: current planning account and reported records; standing: static baseline and discussion settled as described, proposed approach and risk magnitude open] `operational/policies/n53`

Production uses a static target batch quantity built from historical patterns. The team is discussing how much live order arrivals should pull that target up or down; Elena says they currently lean toward the live rate, but this is not yet a specified adjustment rule. Batch sizes vary with demand, and Elena reports production records average around 700 units with real spread (see operational/quantities/n47; records not shown here). The risk that noisy demand estimates drive overproduction or underproduction is a team concern, not a measured result. The adjustment method, timing/smoothing, limits and current implemented practice are not yet established.

[n88 — superseded by n94; source: person; basis: stated current replenishment policy; standing: trigger and order-up-to rule settled, units/rounding detail open] `operational/policies/n88`

For both Sonaflozin and Flowbind Material, a purchase order is triggered when inventory position—on-hand plus on-order stock—falls below the material's reorder point. The policy then orders toward the target level, with the quantity rounded to the vendor's minimum order size. The values are item-specific; units and the exact rounding rule were not stated.

[n94 — supersedes n88; superseded by n102; source: person; basis: current practice and reported purchasing records; standing: order trigger and supplier/lot-size account settled as stated, emergency criteria open] `operational/policies/n94`

For both materials, a purchase order is triggered when inventory position (on-hand plus on-order) falls below the material-specific reorder point; the policy orders toward the target level. Standard bulk ordering uses 2,500-unit lots for Chinese Supplier on Sonaflozin and Indian Supplier on Flowbind, rounding up to the next multiple. For Flowbind, German Supplier is the exception for smaller 250-unit urgent top-ups when stock is critically low and Site 1000 cannot wait for Indian Supplier. The urgency threshold and whether a German top-up supplements or replaces an Indian order are not yet stated.

[n102 — supersedes n94; source: person; basis: stated current practice and reported purchasing records; standing: routine and emergency triggers settled as stated, timing and repeat behavior open] `operational/policies/n102`

For both raw materials, the standard purchase trigger is when inventory position (on-hand plus on-order) falls below the material-specific reorder point; the order is brought toward its target and rounded to vendor lots. Standard lots are 2,500 units for Chinese Supplier/Sonaflozin and Indian Supplier/Flowbind. Flowbind has a separate urgent rule: when on-hand Flowbind falls below 500 units, Site 1000 triggers a 250-unit top-up from German Supplier regardless of how much is on order from Indian Supplier. Elena says the German route is faster, which matters near a production stoppage, but its lead time is not given. The exact units, standard-order MOQ semantics, and repeated-trigger behavior remain open.

### Validation evidence and sources [operational/validation]

[n25 — source: person; basis: described order-record practice and data limitation; standing: tentative evidence source, reliability open] `operational/validation/n25`

Spot-customer departures may not be reported as explicit cancellations. Elena says they may be recognized retrospectively in order records when customers stop responding or go elsewhere, but she has no specific case she can point to and says the records are not clean enough to estimate how long customers wait. The record-based signal is retrospective and not yet established as a reliable cancellation timestamp or outcome label.

[n31 — source: person; basis: stated data source and practice; standing: SAP visibility stated, dataset suitability open] `operational/validation/n31`

SAP order lines are the visible record of orders as customers place them, and Elena says historical arrival patterns inform production planning. No extract, observation period, completeness assessment, time-series profile, or quantified order-size/bulk-arrival pattern has been supplied for model calibration.

[n96 — source: material described by person, not consulted; person's standing: not yet shown; basis: reported purchasing records] `operational/validation/n96`

Elena attributes the 2,500-unit ordering lots for Chinese Supplier/Sonaflozin and Indian Supplier/Flowbind, and 250-unit urgent German Flowbind top-ups, to purchasing records. Those records have not been shown or inspected in this conversation; their exact units, time period and whether the 250 units are a minimum lot or typical top-up are unverified.

[n110 — superseded by n116; source: person; basis: purchasing records described but not consulted; standing: source reported, suitability unverified; split remains an assumption] `operational/validation/n110`

Supplier lead-time averages are said to have been fitted from purchasing records, but the records and fit have not been shown or inspected here. Variability is described as a few days either side; no sample period, sample size, distribution fit or tail validation was supplied. The preparation-versus-transit split is explicitly a modelling assumption, not a measured data binding.

[n116 — supersedes n110; superseded by n122; source: person; basis: SAP records described but not consulted; standing: source/timestamp basis reported, calendar interpretation tentative, fit suitability open] `operational/validation/n116`

Supplier lead-time averages are said to be fitted from SAP purchase-order and receipt timestamps; Elena believes the reported 28/14/15-day averages are calendar days, “as best I know.” The records and fit have not been shown or inspected, and no sample period, sample size, exact variability distribution or tail validation was supplied. No working-day calendar has been modelled in this context. The preparation-versus-transit split remains an explicit modelling assumption, not a measured data binding.

[n122 — supersedes n116; source: person; basis: purchasing records described but not consulted; standing: reported source and explicit family-assumption distinction, fit suitability open] `operational/validation/n122`

Elena reports mean and standard-deviation estimates fitted from SAP purchase-order/receipt records, but the records and fit are not shown or inspected in this conversation. She explicitly says the underlying probability model is a team modelling choice rather than something the data directly establish. No distribution family, goodness-of-fit evidence, tail validation, sample period or sample size has been provided. The one-week preparation/rest-transit split is also an assumption, not a measured data binding.

## Construction notes [construction]

[n2 — source: agent; basis: inferred from initial account and current empty-net read; standing: open blocker] `construction/n2`

Construction is blocked at this point: no concrete purchasing or material-flow activity, state changes, decision rule, trigger, quantity or outcome has yet been described. The empty current net has no supported process fragment to represent. Re-enter construction after a concrete case establishes an activity and adjacent state or relationship; do not invent sourcing or inventory semantics.

[n6 — superseded by n10; source: agent; basis: construction check against current empty net and this exchange's outage-case account; standing: open blocker] `construction/n6`

Construction is blocked for the supplier-outage response described in the operational/process-spine Note from this exchange. One remembered choice does not establish the practiced decision conditions, and the quarantine-to-usable-stock handling and material quantities needed for a faithful fragment are unclear. The account also does not yet establish batch consumption, production timing, or how finished goods reach other sites. Do not encode a generalized purchasing policy or invent a quarantine-release path from this case alone; revisit when those operational details are established.

[n10 — supersedes n6; superseded by n13; source: agent; basis: construction check against the current empty net and operational/process-spine/n4 plus this exchange; standing: open blocker, refined] `construction/n10`

The outage case now establishes a real activity and gate: quarantined Sonaflozin requires formal Quality sign-off after the stated checks before production use, and its release added a few unplanned days. Construction remains blocked for a time-faithful purchasing fragment: an instantaneous release would erase a delay Elena says mattered, while no measured or generally applicable release duration, release outcomes for failed checks, or criteria for those outcomes is established. Also unknown are how the early batch consumes material, production timing/volume, the actual finished-goods availability, and the supply result at the other sites. Do not generalize a policy or invent timing, pass/fail rules, or material quantities. Revisit when a representative release timing or decision-relevant bound and the lot/production relationship are established.

[n13 — supersedes n10; superseded by n18; source: agent; basis: proposed target transformation from operational/process-spine/n7 and operational/activities/n8, informed by this exchange; standing: proposal with explicit omissions] `construction/n13`

A limited structural fragment is now supportable: one quarantined Sonaflozin lot may move to production-ready stock only with formal Quality sign-off, and the required checks are recorded in operational/activities/n8. Proposed representation: an uncoloured lot-count place for quarantine, an external input place for lot-specific Quality sign-offs, and a production-ready lot-count place; one release transition consumes one quarantined lot and one sign-off and produces one production-ready lot. This is an agent's target mapping, not an additional operational fact: one token stands for one lot and one single-use sign-off event is required per lot. It represents the approval gate only. It does not represent review duration, check pass/fail criteria or rejected lots, transit, age/expiry, physical quantities, production use, the general purchasing policy, or site demand. This limited fragment cannot establish whether the purchasing policy works. The current net was empty; construction will be inspected after the proposed changes.

[n18 — supersedes n13; superseded by n22; source: agent; basis: target review against operational/process-spine/n11 and operational/goals from this exchange; standing: open construction limitation] `construction/n18`

The constructed fragment maps the supported Quality gate only: a quarantined Sonaflozin lot requires formal Quality sign-off before production use, with checks recorded in operational/activities/n8. It uses uncoloured lot-count places, a separate external sign-off input, and a release transition; the one-token-per-lot and single-use sign-off convention is an agent representation, not an additional operational fact. It does not model review duration, pass/fail outcomes, lot age or expiry, transit, production use, supplier purchasing policy, order arrivals, backlog, delivery allocation or lateness. The new outage outcome in operational/process-spine/n11 makes demand coverage explicitly load-bearing, but the current net cannot assess it. Revisit the broader fragment when order arrival/demand, batch completion timing and quantities, and delivery/backlog handling are established; preserve the qualitative incident outcome meanwhile.

[n22 — supersedes n18; superseded by n27; source: agent; basis: operational/policies and quantities from this exchange, operational/process-spine/n16, and current inspected partial net; standing: open construction blocker] `construction/n22`

The current net represents only the formal Quality sign-off gate for quarantined Sonaflozin lots. The account now also establishes that contract orders remain open in backlog and are filled when Sonic Flow stock becomes available, while contract lateness cost accumulates; spot customers may walk away after an unspecified wait. Do not add demand/order-flow structure yet: there is no order-arrival pattern, order quantity/unit, relationship between production and finished-goods stock, delivery/allocation sequence, lateness-cost rule, or spot-cancellation threshold. The quality-gate fragment cannot derive finished-goods availability from raw-material release. Further construction must preserve the contract/spot distinction and wait-time effects rather than treat all backlog as one undifferentiated count.

[n27 — supersedes n22; superseded by n33; source: agent; basis: current account, open-matters and current inspected partial net; standing: open construction blocker] `construction/n27`

The current net represents only the formal Quality sign-off gate for quarantined Sonaflozin lots. Contract orders remain open and are filled when stock is available, with lateness cost accumulating. Spot customers may leave after an unknown wait; they may not announce cancellation, and retrospective order records are not clean enough to estimate a wait-to-loss rule. Do not add a numeric cancellation threshold, hazard, or cost parameter. The order-flow fragment remains blocked by the missing arrival/order quantities, finished-goods stock and production link, delivery/allocation sequence, lateness-cost calculation, and credible spot-loss timing evidence. Revisit quantitative policy comparison if operational order and delivery histories can support those inputs.

[n33 — supersedes n27; superseded by n40; source: agent; basis: operational/boundary, quantities, validation from this exchange and current inspected partial net; standing: open construction blocker, refined] `construction/n33`

The current net still represents only the formal Quality sign-off gate for quarantined Sonaflozin lots. The contract-order trigger is now known qualitatively: customers place orders, visible as SAP order lines, rather than following a fixed committed forward schedule; most orders are roughly “50-odd units,” with occasional large bulk orders. Do not invent an order arrival rate, distribution, bulk frequency, unit conversion, finished-goods connection, allocation sequence, lateness-cost calculation, or spot-loss timing. Quantitative demand-flow construction remains blocked pending a representative arrival history and the missing production/delivery relationships. Preserve contract/spot distinctions and uncertainty rather than generating orders from an assumed schedule.

[n40 — supersedes n33; superseded by n45; source: agent; basis: operational/activities, resources, quantities and boundary from this exchange plus current inspected partial net; standing: open construction blocker] `construction/n40`

A production activity is now supported in the account: both Sonaflozin and Flowbind Material must be available, a production line must be free, an approximately one-week process produces Sonic Flow in Site 1000 finished-goods storage, and inter-site transfer is outside scope. The current net still contains only the formal Sonaflozin Quality sign-off gate. Do not yet connect that gate directly to production or create stock-balance behavior: input amounts/consumption timing, line count and reservation/release behavior, duration calendar and variability, and finished-goods units are unknown. Using an exact fixed one-week duration, one line token, or one token of each material per batch would add unsupported precision or capacity assumptions. Revisit production structure after those input/resource semantics and the supply-coverage measure are clarified.

[n45 — supersedes n40; superseded by n50; source: agent; basis: operational/activities/n36, resources/n37 and quantities from this exchange plus current inspected partial net; standing: open construction blocker] `construction/n45`

Production semantics are now clearer: a Sonic Flow batch requires both raw materials and a free line; both materials are consumed at start, the line is occupied through the approximately week-long run, and completed Sonic Flow enters Site 1000 finished-goods storage. The current net still represents only the formal Sonaflozin Quality release gate. No production structure has been added because material quantities per batch, finished-goods yield, eligible line count, and exact duration calendar remain unknown, and these determine stock coverage rather than incidental detail. A target fragment must hold the line and consume both materials at start, then return the line and add the recorded finished-goods output at completion; do not invent multiplicities, capacity or an exact seven-day duration.

[n50 — supersedes n45; superseded by n55; source: agent; basis: operational/activities/n41, quantities and policies from this exchange plus current inspected partial net; standing: open construction blocker, refined] `construction/n50`

A 1:1:1 bill of materials is now established, and Elena reports variable demand-dependent batch sizes averaging about 700 units in production records, with real spread. The current net still represents only formal Quality release. No production structure has been added: a fixed 700-unit batch would contradict the stated variability, and a demand-sized batch requires the missing practiced rule or an empirical distribution, alongside a representation of available stocks, line capacity and the approximately week-long process. The exact batch-size spread and production-record basis are not available for review. Do not encode 700 as a fixed or randomly sampled batch without authorization/data; revisit with the sizing rule or suitable records.

[n55 — supersedes n50; superseded by n60; source: agent; basis: current account and current net read; standing: open construction and experiment-readiness blocker] `construction/n55`

The supported planning decision is now static historical target batch size versus a target adjusted by live order arrivals, with concern about noisy estimates driving over/underproduction. The current net still represents only the Quality release gate and has no production, inventory, purchasing policy, comparison scenario or outcome metric. Construction and experiment drafting remain blocked: the candidate live-rate adjustment rule and range, objective measure/direction, operating regime/horizon, and executable process states are absent. Do not invent smoothing, a tuning range, an objective or default. Revisit after the candidate policies and process quantities are established; only then add scenarios/metrics and assess experiment readiness.

[n60 — supersedes n55; superseded by n66; source: agent; basis: current account and current net read; standing: open construction/experiment blocker] `construction/n60`

The person now states the decision comparison and qualitative priorities: static historical target versus a target influenced by live order arrivals; fill rate above 95% is first, then production delay and expiry loss roughly equally, with real late charges and expiry write-offs. The current net still represents only the formal Quality release gate. It has no production/inventory/order flow, no metric for fill rate, delay or expiry, and no scenario or tunable policy. The measure boundary is ambiguous because inter-site transfers are out of scope, and >95% may be a hard threshold or target. Construction and experiment drafting remain blocked; do not invent the order-to-stock metric, cost weights, constraint treatment, policy rule/range, scenario, horizon or defaults. Resolve these account gaps and build the executable process before reassessing experiment readiness.

[n66 — supersedes n60; superseded by n73; source: agent; basis: current account and current net read; standing: open construction and experiment blocker] `construction/n66`

Fill-rate scope is now clear: finished-goods stock ready at Site 1000 by requested date, not downstream delivery. The net still contains only the formal Quality release gate and no production, finished-goods inventory, order due dates, fill-rate metric, delay/expiry measure, or purchasing/batch policy. The 95% level and no-site-stockout requirement are not yet resolved as hard constraints versus aspirations, and the rate calculation is unspecified. Construction and experiment preparation remain blocked; do not infer a metric, policy range, horizon or threshold enforcement. Reassess after order availability and production states are represented and the rate calculation/enforcement status are established.

[n73 — supersedes n66; superseded by n78; source: agent; basis: current account and current net read; standing: open construction/experiment blocker] `construction/n73`

The fill-rate concept is now operationally defined as the volume share of requested units ready in Site 1000 finished-goods storage by requested date, with partial quantities counted and downstream delivery excluded. The current net still contains only the Quality release gate and has no production, inventory, order or requested-date states, so it cannot calculate even this measure. Aggregation period, cancellation/revised-date treatment and whether >95% is a hard requirement remain open. Construction and experiment preparation are blocked until the order/stock process is represented and those metric details are settled; do not invent a metric series or enforcement.

[n78 — supersedes n73; superseded by n85; source: agent; basis: current account and current net read; standing: open construction/experiment blocker] `construction/n78`

The requested fill rate is now defined conceptually as the volume share of requested units ready at Site 1000 by requested date, partial units counted, with downstream delivery excluded; >95% is a comparison target, not a hard constraint, and no per-site zero floor is formally defined. The current net still contains only the Quality release gate and no production, inventory or order states, so it cannot calculate fill rate, production delay or expiry loss or compare static and live-rate policies. Metric aggregation and cancellation/date-change treatment remain open. Construction and experiment preparation are blocked by missing executable process structure, policy range, secondary metric definitions and horizon; do not invent them.

[n85 — supersedes n78; superseded by n91; source: agent; basis: current canonical net read and account; standing: open construction/experiment blocker] `construction/n85`

The person has now specified the headline fill-rate period: the volume share of requested units ready at Site 1000 by requested date over the full two-year planning horizon, with monthly breakdowns informative but secondary; >95% is a target rather than an enforced constraint. The current net read still contains only the Quality release gate and no production, inventory, order/date or metric states. It cannot calculate the outcome or compare static and live-rate batch policies. Construction and experiment drafting remain blocked by absent process structure, live-policy rule/range, monthly/headline metric implementation, secondary delay/expiry measures, and order cancellation/date-change rules. Never invent resolution or policy choices.

[n91 — supersedes n85; superseded by n99; source: agent; basis: operational/policies and quantities from this exchange plus current canonical net read; standing: open construction blocker, refined] `construction/n91`

The account now establishes a raw-material replenishment trigger: when on-hand plus on-order inventory position falls below the material-specific reorder point, the policy orders toward its target, rounded to supplier MOQ. Reported settings are Sonaflozin ROP 2,500/target 7,500 and Flowbind ROP 1,500/target 5,000 (operational/quantities/n90). The current net still represents only Quality release; it has no on-hand/on-order states, order quantities, receipts or supplier timing. No procurement structure has been added because material units, MOQ values/rounding, PO-to-receipt timing and outage behavior are missing, and the transition must update on-order inventory to prevent duplicate or distorted triggers. The production/live-rate comparison and performance metric also remain absent; do not encode these settings as a working policy in an unconnected fragment.

[n99 — supersedes n91; superseded by n106; source: agent; basis: operational/resources/n3, policies and quantities from this exchange plus current canonical net read; standing: open construction blocker, refined] `construction/n99`

The account now specifies standard supplier lot multiples: 2,500 units for Chinese Supplier/Sonaflozin and Indian Supplier/Flowbind, plus a German Supplier 250-unit urgent Flowbind top-up when critically low and unable to wait for India. The current net still contains only the Quality release gate; it does not represent on-hand/on-order balances, purchase order placement, receipts or supplier choice. No procurement structure is added because the critical-low trigger, supplier lead times/outages, 250-unit interpretation and interaction between German and Indian orders are unknown. These are needed to avoid fabricating duplicate or mistimed orders. Revisit after those rules and inventory state are established.

[n106 — supersedes n99; superseded by n113; source: agent; basis: operational/policies and quantities from this exchange plus current canonical net read; standing: open construction blocker, refined] `construction/n106`

Supplier choice for Flowbind now has a supported emergency branch: if on-hand stock falls below 500, a 250-unit German Supplier top-up is triggered regardless of Indian on-order quantity; the German route is faster. The current net still contains only the Quality release gate and no raw-material inventory, on-order state, supplier order, transit or receipt. No procurement mutation is added because supplier lead times/reliability, post-arrival Quality availability and repeated-trigger behavior remain unknown; these are needed to model when the added supply can actually prevent stoppage and to avoid false receipt or duplication behavior.

[n113 — supersedes n106; superseded by n119; source: agent; basis: operational/quantities and validation from this exchange plus current canonical net; standing: open construction blocker, refined] `construction/n113`

Supplier PO-to-arrival mean times are now reported as 28 days Chinese, 14 days Indian and 15 days German, with a few days either side; the approximate one-week preparation/rest transit split is explicitly an unmeasured modelling assumption. The current net still has no raw-material inventory, purchase-order, transit, receipt or quality timing structure. Construction remains blocked for a credible arrival process: lead-time distributions/tails, calendar convention, data validation, outage/recovery behavior, and general post-arrival Quality timing are missing. Do not represent the reported averages as fixed durations or assign a distribution from “a few days.”

[n119 — supersedes n113; superseded by n125; source: agent; basis: operational/quantities and validation from this exchange plus current canonical net; standing: open construction blocker, refined] `construction/n119`

Supplier PO-to-arrival average times are now understood, as best Elena knows from SAP timestamps, as calendar days: about 28 Chinese, 14 Indian and 15 German; variability is only described as a few days either side. The split into about one week preparation and remaining transit is explicitly a modelling assumption. The current net has no raw-material inventory, purchase-order, transit, receipt or Quality timing structure. Construction remains blocked for a credible arrival process: variability/tail distribution, SAP data validation, outage/recovery behavior, and general post-arrival Quality timing are missing. Do not turn the means into fixed durations or assign a distribution from “a few days.”

[n125 — supersedes n119; source: agent; basis: operational/quantities and validation from this exchange plus current canonical net; standing: open construction blocker and assumption authorization gap] `construction/n125`

Supplier PO-to-arrival means and standard deviations are now reported from SAP fits (Chinese 28/3.3 days, Indian 14/3.7, German 15/<1, calendar days), but the probability family is explicitly a team modelling choice, not a data-established fact. Elena wants this shown transparently as an assumption rather than a measured claim. No family has been chosen or authorized for this model, and no net element represents supplier lead times. Do not encode a normal/uniform/other distribution or infer tail risk yet; revisit when the team selects or explicitly authorizes a visible assumption. The purchase, outage/recovery, receipt and Quality-availability process structure is also still absent.

## Cross-cutting open matters [open-matters]

[n26 — source: agent for the gap and consequence; underlying policy/data limits supplied by person; standing: open] `open-matters/n26`

The demand-coverage goal in operational/goals/n17 depends on both contract lateness cost and spot-customer attrition described in operational/policies/n20 and operational/quantities/n21, but the cost calculation and spot waiting-time/loss relationship are not quantified. Current order records are described as retrospective and not clean enough to establish a reliable wait-to-loss distribution. This prevents a defensible numerical comparison of policies on lateness versus spot-customer loss. Revisit if a usable order-history extract or a defensible operational definition of spot loss and its timing becomes available; keep the outcome qualitative until then.

[n32 — source: agent for consequence and return condition; source of intake and approximate size account: person; standing: open] `open-matters/n32`

Demand-coverage assessment depends on order timing and quantity, but contract demand is placed into SAP rather than committed on a forward schedule, and only a qualitative size profile (“50-odd units” for most orders, occasional large bulk) is available. Without a representative SAP arrival history with a defined period and order quantities, the model cannot generate or compare realistic demand pressure. Revisit when a suitable order-history extract or defensible arrival summary is available.

[n44 — superseded by n49; source: agent for consequence and return condition; consumption event supplied by person; standing: open] `open-matters/n44`

Quantitative supply coverage depends on how much Sonaflozin and Flowbind Material each batch consumes and how much Sonic Flow it yields, but only the consumption event at batch start is known. This affects raw-material inventory, feasible batch counts, finished-goods replenishment and purchasing-policy comparisons. Revisit with a standard recipe/BOM or representative batch record; until then, do not convert lot counts or purchase quantities into finished-goods supply.

[n49 — supersedes n44; source: agent for consequence and return condition; ratio and reported mean supplied by person; standing: quantity relation refined, variability/sizing unresolved] `open-matters/n49`

The standard bill of materials is now stated as 1:1:1: one unit each of Sonaflozin and Flowbind Material yields one unit of Sonic Flow. Production batch sizes vary with demand and Elena reports a production-record average around 700 units, but the spread and sizing rule are not available here. The exact material ratio alone does not give a usable order/batch policy or an empirical output profile. This still affects raw-material inventory and finished-goods coverage; revisit with a representative batch/demand record or the practiced rule for choosing quantity.

[n54 — source: agent for gap and consequence; underlying comparison and concern supplied by person; standing: open] `open-matters/n54`

The static-versus-live planning comparison in purpose/n34 and operational/goals/n17 lacks the actual policy equation: how live order arrivals adjust the historical target, over what window or smoothing, and whether there are any bounds. The team worries noisy estimates may overproduce or underproduce, but the operational response and acceptable trade-off are unknown. Without these candidate rules, a model would invent the policy being compared. Revisit when Elena or the team can state the static baseline and a concrete live-adjustment rule (or decide how alternative rules should be represented).

[n59 — superseded by n65; source: agent for ambiguity and consequence, based on person's stated goal and boundary; standing: open] `open-matters/n59`

The stated primary measure is fill rate above 95% and the phrase “we can't have sites running out,” but the modeled boundary ends at Site 1000 finished-goods storage and excludes transfers to other sites (operational/boundary/n35). It is unclear whether fill rate means demand covered by stock available at Site 1000 by an order due time, or completed downstream site deliveries; those are not interchangeable. The 95% statement may also be a hard threshold or a target, and its relationship to no site running out is unresolved. This blocks a faithful metric and experiment constraint; resolve the measure definition and scope before comparing policies.

[n65 — supersedes n59; superseded by n72; source: agent for the remaining gap and consequence; boundary meaning supplied by person; standing: boundary resolved, calculation/threshold open] `open-matters/n65`

The boundary ambiguity is resolved: fill rate is finished Sonic Flow available at Site 1000 by the requested date; actual transfer and arrival at the other sites are outside scope (see operational/boundary/n62, recorded in this exchange). The remaining measure gap is how to calculate the rate—numerator/denominator, aggregation window and partial-order treatment—and whether >95% is a binding minimum or an aspiration despite the phrase “can't have sites running out.” This prevents a defensible metric and constraint treatment; resolve those details before comparing policies.

[n72 — supersedes n65; superseded by n77; source: agent for remaining gaps and consequence; boundary and unit-based rule supplied by person; standing: boundary/metric basis resolved, aggregation and threshold status open] `open-matters/n72`

The boundary and fill-rate basis are resolved: requested Sonic Flow units that are ready in Site 1000 finished-goods storage by requested date count toward a volume-based rate; partial quantities count, and destination delivery is excluded (operational/boundary/n70, recorded in this exchange). Still open are the aggregation period, cancellation/revised-date treatment, whether >95% is binding or aspirational, and how that target relates to “no site running out.” These details are needed for a defensible metric and constraint; resolve them before comparing policies.

[n77 — supersedes n72; superseded by n84; source: agent for remaining gap and consequence; boundary/target status supplied by person; standing: constraint question resolved, metric aggregation open] `open-matters/n77`

The boundary, unit basis and target status are now resolved: fill rate is the volume share of requested units ready at Site 1000 by requested date, partial units count, downstream destination delivery is excluded, >95% is a comparison target rather than a hard constraint, and no individual-site zero-tolerance floor is formally defined. These statements are recorded in operational/boundary/n70 and operational/goals/n75 (from this exchange). Still unspecified are the period over which fill rate is aggregated and treatment of cancellations or changed requested dates. Resolve these before defining a reproducible metric; do not enforce 95% as a constraint.

[n84 — supersedes n77; source: agent for remaining gaps and consequence; period and target supplied by person; standing: headline period resolved, order accounting open] `open-matters/n84`

The fill-rate calculation's headline aggregation window is now resolved: requested Sonic Flow units ready at Site 1000 by requested date are assessed over the full two-year planning horizon; monthly breakdowns are informative but not the headline target. The target is >95%, not a hard constraint, and no per-site zero floor is defined. Still open are how cancellations, changed requested dates and partially cancelled orders enter the numerator/denominator and whether the two-year window follows a business-calendar start/end rule. These details matter for a reproducible metric; resolve them before implementing the calculation.

[n90 — superseded by n97; source: agent for consequence and return condition; policy values and rule supplied by person; standing: open] `open-matters/n90`

The purchasing policy now has item-specific reorder points and order-up-to targets (operational/quantities/n90) but rounds orders to vendor minimums whose values and rounding direction are not known. The effect on replenishment and inventory position also depends on when purchase orders enter the on-order balance, transit/receipt timing and supplier outage recovery, none of which is specified yet. This prevents calculating repeated order quantities and when raw materials become available under a two-year comparison. Revisit with item-specific MOQ/units and the purchase-order-to-receipt timing and outage behavior.

[n97 — supersedes n90; superseded by n104; source: agent for consequence and return condition; supplier roles/lot sizes supplied by person from records not shown; standing: routine MOQ clarified, exception semantics/timing open] `open-matters/n97`

The standard supplier order multiples are now reported as 2,500 units for Chinese Supplier/Sonaflozin and Indian Supplier/Flowbind, with 250-unit urgent Flowbind top-ups from German Supplier. Still unknown are the exact item unit conversions, whether 250 is a fixed order or increment, and the rule that decides Flowbind is “critically low” and cannot wait for India. Lead times, outage behavior and how a German top-up interacts with any Indian order are also unspecified. These details determine when material becomes available and how inventory position changes; revisit with the operating trigger and supplier timing/PO records.

[n98 — superseded by n101; source: agent for consequence and return condition; supplier alternatives stated by person; standing: open] `open-matters/n98`

Flowbind can be sourced from Indian Supplier in 2,500-unit lots or from German Supplier for 250-unit urgent top-ups when critically low and unable to wait (operational/policies/n93 recorded this exchange). The threshold for critical low, the evidence that Indian supply cannot be awaited, supplier-specific lead times, and whether German orders cancel or supplement an Indian order are not known. This prevents a defensible supplier-switch branch and inventory-position update. Revisit with the practiced escalation criterion and purchase-order/receipt history.

[n101 — supersedes n98; superseded by n105; source: agent; basis: Ledger correction; standing: corrected reference, open matter unchanged] `open-matters/n101`

Flowbind can be sourced from Indian Supplier in 2,500-unit lots or from German Supplier for 250-unit urgent top-ups when critically low and unable to wait (operational/policies/n94 records this exchange). The threshold for critical low, the evidence that Indian supply cannot be awaited, supplier-specific lead times, and whether German orders cancel or supplement an Indian order are not known. This prevents a defensible supplier-switch branch and inventory-position update. Revisit with the practiced escalation criterion and purchase-order/receipt history.

[n104 — supersedes n97; superseded by n111; source: agent for consequence and return condition; trigger/quantity supplied by person; record evidence not shown; standing: trigger resolved, timing/repeat behavior open] `open-matters/n104`

The Flowbind emergency trigger is now stated: when on-hand stock drops below 500 units, a 250-unit German Supplier top-up is triggered regardless of Indian on-order stock; the German route is faster. Still unknown are its lead time and distribution, how repeated top-ups behave if stock remains below threshold, and how arrival timing combines with Indian orders. The standard 2,500-unit lot rule and material unit definitions also need record-level verification. These gaps affect available supply, expiry exposure and policy comparison; revisit with PO/receipt history and the repeated-trigger practice.

[n105 — supersedes n101; superseded by n112; source: agent for remaining gap and consequence; emergency trigger supplied by person; standing: trigger resolved, timing/availability open] `open-matters/n105`

The Flowbind emergency rule is now established: if on-hand stock falls strictly below 500 units, trigger a 250-unit German Supplier top-up regardless of the Indian Supplier's on-order quantity. The German route is faster. Its lead-time value, variation, arrival reliability and effect on production-usable stock after transit and Quality quarantine are not known. Those facts determine how quickly the emergency order helps avoid a production stoppage and whether it overlaps with Indian supply. Revisit with supplier PO/receipt history and post-arrival Quality timing.

[n111 — supersedes n104; superseded by n117; source: agent for gap/consequence; means and status supplied by person; standing: average estimates stated, distribution and split validation open] `open-matters/n111`

Supplier average PO-to-arrival times are now reported from fits to purchasing records: Chinese 28 days, Indian 14 days, German 15 days, with variability described as a few days either side. The records and fits have not been checked and no distribution, tail, sample period, or calendar/business-day convention is stated. The split into about one week supplier preparation and remaining transit is explicitly a modelling assumption, not a measured decomposition. Post-arrival Quality release still adds a few unplanned days in the remembered incident; general release duration is unknown. These timings affect availability and outage comparisons; revisit with usable PO, receipt and quality-release timestamps before treating them as calibrated.

[n112 — supersedes n105; superseded by n118; source: agent for remaining gap and consequence; time estimates and assumption status supplied by person; standing: means reported, validation and tails open] `open-matters/n112`

PO-to-arrival average estimates are now available: Chinese Supplier about 28 days, Indian about 14, and German about 15, with a few days' variability either side, fitted from purchasing records not shown. The roughly one-week preparation/rest-in-transit split is explicitly a modelling assumption. The exact lead-time distribution, tails, day calendar, supplier-specific split, arrival reliability and post-arrival Quality-usable timing remain open. These determine whether a replenishment or German top-up can prevent a stoppage; revisit with PO/receipt and quality release history.

[n117 — supersedes n111; superseded by n123; source: agent for gap/consequence; average calendar-day estimates and split status supplied by person; standing: calendar-day interpretation tentative, distributions and split validation open] `open-matters/n117`

Supplier PO-to-arrival averages are reported as 28 calendar days Chinese, 14 calendar days Indian and 15 calendar days German, based on SAP order/receipt timestamp fits as best Elena knows. Variability is only “a few days either side,” with no distribution, sample period or tail detail; the SAP records have not been inspected. The approximate one-week preparation/rest-transit split is explicitly a modelling assumption, not a measured decomposition. Post-arrival Quality release adds a few unplanned days in the remembered case, but general release timing remains unknown. These timings affect availability and outage comparison; revisit with usable timestamp extracts before treating them as calibrated.

[n118 — supersedes n112; superseded by n124; source: agent for remaining gap and consequence; reported timing from person; standing: calendar-day basis tentative, variation and availability open] `open-matters/n118`

PO-to-arrival average estimates are about 28 calendar days Chinese, 14 calendar days Indian and 15 calendar days German, as best Elena knows from SAP PO/receipt timestamps. The variability remains only “a few days either side”; no distribution/tail, sample period, explicit supplier-specific preparation split, or data validation is available. The roughly one-week preparation/rest-transit split is an unmeasured modelling assumption. Post-arrival Quality-usable timing and arrival reliability remain open. These determine whether urgent or routine supply is available in time; revisit with PO, receipt and Quality release timestamps.

[n123 — supersedes n117; source: agent for remaining gap and consequence; moments and epistemic preference supplied by person; standing: moments reported, probability model open] `open-matters/n123`

Supplier lead-time moments are now reported as calendar-day mean/SD pairs: Chinese ~28/3.3, Indian ~14/3.7, German ~15/<1, fitted from SAP records not shown. The family used to generate lead times is not an operational fact or directly established by those records; Elena says the team must choose it and wants it labeled as an assumption, not a measured fact. The one-week preparation/rest-transit split is likewise an explicit modelling assumption. General post-arrival Quality timing remains unknown. Revisit with the team's chosen, transparently labelled probability assumption and usable record validation before treating simulated tails as evidence.

[n124 — supersedes n118; source: agent for remaining gap/consequence; moments and source status supplied by person; standing: moments reported, family/open availability untested] `open-matters/n124`

Urgent German lead time has a reported calendar-day mean of about 15 days and SD under one day, fitted from SAP records not shown. The supplier's probability distribution family is not determined by operations/data; the team must choose a labelled modelling assumption. Exact lead-time tails and post-arrival Quality-usable timing remain open, so the model cannot infer that the 250-unit top-up will be available by a particular stoppage date. Revisit when the family is selected and timing is validated or explicitly accepted as an assumption.

## Delivery status [delivery]

[n14 — superseded by n19; source: agent; basis: current tool results and structural review; standing: settled for observed structure and checks, title discrepancy and policy effectiveness open] `delivery/n14`

The current inspected Petrinaut definition contains three uncoloured places—QuarantinedLots, QualitySignoffs, and ProductionReadyLots—and Formal Quality Release consumes one token from each of the first two and produces one production-ready lot. The place/transition/arc tool calls were accepted, auto-layout was applied, and the inspected endpoints match the intended partial gate. This fragment is structurally reviewed against the account as a representation of “formal Quality sign-off before production use,” with the construction mapping and omissions in construction/n13. `getNetCompilationErrors` reported no errors or warnings in net function code; the fragment contains no authored code, scenarios, or metrics. No simulation, experiment, or stronger behavioral analysis was run. It cannot yet assess whether the purchasing policy works. The net-title tool twice reported success, but subsequent current reads still show “New Process”; treat the rename as unresolved rather than claiming the title changed.

[n19 — supersedes n14; superseded by n28; source: agent; basis: current inspected net and checks plus the updated account; standing: settled for observed partial structure, effectiveness and title unresolved] `delivery/n19`

The current inspected Petrinaut definition still contains QuarantinedLots, QualitySignoffs, ProductionReadyLots and Formal Quality Release. The accepted tools created the three uncoloured places, transition and arcs; auto-layout was applied. Its structure was reviewed against the account as the formal Quality release gate only. The model does not represent production lead time, demand/orders, backlog, late deliveries, expiry or purchasing policy, so it cannot answer Elena's demand-coverage question. `getNetCompilationErrors` reported no errors or warnings in net function code; no authored code, scenarios or metrics are present. No simulation, experiment or stronger behavioral analysis has been run. The title tool twice reported success, but subsequent current reads still show “New Process”; the rename remains unresolved and is not claimed as complete.

[n28 — supersedes n19; superseded by n56; source: agent; basis: prior current net inspection and checks plus this exchange's account; standing: settled for current partial structure and limits, title unresolved] `delivery/n28`

The current inspected Petrinaut definition contains QuarantinedLots, QualitySignoffs, ProductionReadyLots, and Formal Quality Release. Accepted tool calls created the three uncoloured places, transition and arcs; auto-layout was applied. Its structure is reviewed against the account as the formal Quality sign-off gate only. It does not represent production lead time, order arrivals, finished-goods stock, backlog, late deliveries, contract lateness cost, spot-customer attrition, expiry, or purchasing policy; it cannot answer Elena's demand-coverage question. The order-record signal for spot departure is retrospective and not clean enough to calibrate a waiting-time rule. `getNetCompilationErrors` reported no errors or warnings in net function code; no authored code, scenarios, or metrics are present. No simulation, experiment, or stronger behavioral analysis has been run. The title tool reported success twice, but subsequent current reads still show “New Process”; the rename remains unresolved.

[n56 — supersedes n28; superseded by n61; source: agent; basis: prior current net inspection/check and updated decision account; standing: settled for observed partial model and readiness, title unresolved] `delivery/n56`

The current inspected net remains a partial Quality release gate: QuarantinedLots and QualitySignoffs feed Formal Quality Release, which produces ProductionReadyLots. Its tools accepted the structure and auto-layout; it is structurally reviewed only for the release prerequisite. It does not model the newly stated static-versus-live batch-size comparison, production, inventories, demand, backlog, costs or expiry. Net function diagnostics previously reported no errors or warnings; no authored code, scenario or metric exists, and no simulation or experiment was run. An experiment is not ready: the process structure, saved regime/scenario, comparison metric and direction, live-policy tunable/range and horizon are missing. The title tool reported success twice, but subsequent reads still showed “New Process,” so the rename remains unresolved.

[n61 — supersedes n56; superseded by n67; source: agent; basis: prior current net inspection/check and updated goal account; standing: settled for partial structure and gaps, title unresolved] `delivery/n61`

The inspected current net remains a partial Quality release gate: QuarantinedLots and QualitySignoffs feed Formal Quality Release, which produces ProductionReadyLots. The accepted structure is structurally reviewed only for that sign-off prerequisite. It does not model production, inventory, live/static batch policies, order demand, fill rate, production delay or expiry; it cannot assess the requested trade-offs. Net function diagnostics previously reported no errors or warnings, but there are no authored code surfaces, scenarios or metrics. No simulation, experiment or stronger analysis was run. Experiment drafting is not ready because executable process states, saved scenario, metric definitions, tunable policy/range and horizon are absent. Fill-rate definition and whether >95% is enforced remain unresolved. The title tool twice reported success, but later reads still showed “New Process”; the rename remains unresolved.

[n67 — supersedes n61; superseded by n74; source: agent; basis: prior current net inspection/check and current goal clarification; standing: settled for partial structure and limits, title unresolved] `delivery/n67`

The current inspected net remains a partial Quality release gate, structurally reviewed only for the requirement that formal Quality sign-off precedes production use. The user has now defined fill rate conceptually as finished Sonic Flow ready at Site 1000 by requested date, not delivery at the destination, but the net still has no production, inventory, order, date, policy or outcome metric structures. Net function diagnostics previously reported no errors or warnings; there is no authored code, scenario or metric and no simulation, experiment or stronger analysis. Experiment drafting is not ready because executable process states, a saved regime, metric calculation, tunable policy/range, direction and horizon are absent; the 95% threshold's enforcement status is also open. The title tool twice reported success but later reads still showed “New Process”; title remains unresolved.

[n74 — supersedes n67; superseded by n79; source: agent; basis: prior current net inspection/check and current metric clarification; standing: settled for partial structure and gaps, title unresolved] `delivery/n74`

The inspected current net remains a partial Quality release gate, structurally reviewed only for the formal sign-off prerequisite. Elena has clarified the desired fill measure: volume-based requested units ready at Site 1000 by requested date, including partial-order units; downstream arrival is excluded. The net has no production, inventory, order or date states and no metric, so it cannot assess the static-versus-live plan. Net function diagnostics previously reported no errors or warnings; no authored code, scenario or metric exists, and no simulation, experiment or stronger analysis was run. Experiment drafting remains unready: process structure, saved regime, metric implementation, tunable policy/range, direction and horizon are absent; aggregation/cancellation rules and >95% enforcement status are open. The title tool twice reported success but subsequent reads still showed “New Process”; title remains unresolved.

[n79 — supersedes n74; superseded by n86; source: agent; basis: prior current net inspection/check and latest goal clarification; standing: settled for partial structure and readiness, title unresolved] `delivery/n79`

The inspected current net remains a partial Quality release gate, structurally reviewed only for formal release before production use. The fill-rate target is now clarified as a volume share of requested units ready in Site 1000 by requested date, with partial units counted and downstream delivery excluded; >95% is not enforced, and no per-site zero-tolerance floor is formally defined. The net still lacks production, inventory, order/date states, static/live policy, fill-rate/delay/expiry metrics, scenarios and parameters. Net function diagnostics previously reported no errors or warnings; no simulation, experiment or stronger analysis was run. Experiment drafting is not ready because process structure, metric aggregation, tunable policy/range, secondary objectives, regime and horizon are absent. The title tool reported success twice but later reads still showed “New Process”; title remains unresolved.

[n86 — supersedes n79; superseded by n92; source: agent; basis: current canonical net read and current goal account; standing: settled for current structure and evidence level, title unresolved] `delivery/n86`

The current canonical net still contains only the three uncoloured Quality-release places and Formal Quality Release, structurally reviewed only for the formal sign-off gate. Elena's headline measure is now defined conceptually over a two-year planning horizon: volume share of requested units ready at Site 1000 by due date, partial units counted; monthly breakdowns are informative. The net has no production, inventory, orders, due dates or metrics, so it cannot evaluate the target or compare policies. Net function diagnostics previously reported no errors/warnings; no authored code, scenarios or metrics exist, and no simulation or stronger analysis ran. Experiment drafting remains unready: executable process, scenario, metric, tunable policy/range, and secondary outcomes are absent. Title tool success remains inconsistent with reads showing “New Process.”

[n92 — supersedes n86; superseded by n100; source: agent; basis: current canonical net read and this exchange's purchasing-policy account; standing: settled for current partial structure and gaps] `delivery/n92`

The current canonical net still contains only the Quality release gate. It has no inventory-position calculation, reorder thresholds, purchase orders, MOQ logic, receipts, supplier lead times/outages, production, demand or comparison policy. The account now supplies an on-hand-plus-on-order reorder trigger and Sonaflozin/Flowbind reorder/target values, but their item units, MOQ and order-to-receipt behavior are not yet available for construction. No metric/scenario exists, no simulation or stronger analysis was run, and the two-year comparison is not modelled. The experiment proposal remains unready; the latest canonical net read showed only three places and one transition, with no scenario or metric.

[n100 — supersedes n92; superseded by n107; source: agent; basis: current canonical net read and purchasing account; standing: settled for current partial structure and readiness limits] `delivery/n100`

The current canonical net remains only a Quality release gate and does not represent supplier sourcing, inventory position, reorder points, order increments, urgent Flowbind source switching, receipts or transit. The current account now specifies 2,500-unit lot multiples for Chinese/Sonaflozin and Indian/Flowbind and 250-unit German urgent Flowbind top-ups, but exact item units, critical-low rule, supplier timing and order interaction remain unverified/open. Production/demand, policies and outcome metrics are also absent. No scenario/metric or behavioral execution exists; experiment drafting is not ready.

[n107 — supersedes n100; superseded by n114; source: agent; basis: current canonical net read and updated purchasing account; standing: settled for partial model status and gaps] `delivery/n107`

The current canonical net remains only a Quality release gate; it has no on-hand/on-order balances, routine reorder, German urgent Flowbind top-up, receipts, transit or supplier/Quality timing. The account now includes the strict <500 on-hand Flowbind threshold and 250-unit German top-up regardless of Indian on-order quantity, but supplier lead time/reliability, repeated-trigger behavior and when received stock becomes production-usable remain open. No inventory/production/demand metrics or policy comparison are represented; no simulation or experiment has run.

[n114 — supersedes n107; superseded by n120; source: agent; basis: current canonical net read and reported timing account; standing: settled for partial structure/evidence level, data validation open] `delivery/n114`

The inspected current net remains only a Quality release gate and does not represent purchase orders, material inventory, transit/receipt or supplier outage. The account now has reported average PO-to-arrival times of about 28 days Chinese, 14 days Indian and 15 days German, with qualitative variability, plus an explicitly assumed one-week preparation/rest transit split; underlying purchasing records were not inspected. No lead-time distribution, scenario, process metric or policy comparison exists in the net; no simulation or stronger analysis has been run. Experiment drafting remains unready. Model evidence supports the Quality gate only, not the purchasing policy or calibrated supplier timing.

[n120 — supersedes n114; superseded by n126; source: agent; basis: current canonical net read and updated timing account; standing: settled for partial structure/evidence, data validation open] `delivery/n120`

The current canonical net remains only a Quality release gate and does not represent purchase orders, raw-material balances, supplier transit/receipt, outage or production. Reported mean PO-to-arrival times are about 28 calendar days Chinese, 14 Indian and 15 German, as best Elena knows from SAP timestamps; variation is qualitative, records are not inspected, and the preparation/transit split is an explicit assumption. No lead-time distribution, process metric, scenario or policy comparison is present; no simulation or stronger analysis has been run. The current model supports the Quality gate only, not calibrated supplier timing or purchasing-policy effectiveness.

[n126 — supersedes n120; source: agent; basis: current canonical net read and reported time-statistics account; standing: settled for partial structure/evidence, model family/data validity open] `delivery/n126`

The current net remains only a Quality release gate and does not represent purchasing, transit/receipt or supplier outage. The account now reports fitted calendar-day mean/SD lead times (Chinese 28/3.3, Indian 14/3.7, German 15/<1), but the records are uninspected and the distribution family is a team modelling assumption not yet chosen. The one-week preparation/rest-transit split is also explicitly assumed. No simulation, policy metric, scenario or experiment exists; the model cannot establish lead-time tails or purchasing-policy effectiveness. The title tool/read discrepancy remains unresolved.
