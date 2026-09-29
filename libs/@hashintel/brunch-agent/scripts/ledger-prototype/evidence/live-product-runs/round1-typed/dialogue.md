## Turn 1

**Person:** I'm Elena Fischer, materials planning and operations lead for Site 1000. We make Sonic Flow from Sonaflozin and Flowbind Material, and our purchasing has to allow for supplier outages, transit delays, quarantine, expiry and production demand. I'd like to build a model of this from scratch that shows whether our purchasing choices hold up, and that I can explain and change.

**Brunch:** What purchasing choice would you most like to test first? If you have a recent Sonic Flow production run in mind, walk me through what happened from deciding to buy Sonaflozin and Flowbind Material to using them—or discovering they weren’t usable.

## Turn 2

**Person:** The reorder points are what I'd want to test. We trigger a Sonaflozin order when inventory position drops below 2,500 and top back up to 7,500, and Flowbind at 1,500 up to 5,000. Those numbers were set by the team based on judgement, not really derived from the lead times or the failure rates, so I don't have confidence they hold up when the Chinese supplier is out for two weeks or a shipment gets delayed at customs.

**Brunch:** I’ve started a draft with your two **strictly-below** reorder rules and order-up-to targets. It currently calculates orders from supplied inventory-position readings; it does **not** yet model delivery, usable stock, or whether production is protected.

For a recent Sonaflozin order, what happened between placing it and having material available for Sonic Flow production—especially if the supplier or customs caused a delay?

## Turn 3

**Person:** I can't point to a specific recent order, I'd have to pull the SAP records. What I can say is the lead time from the Chinese supplier is around 28 days in total, and we assume one week of that is supplier preparation and the rest transit. So if there's an outage when we trigger an order, we're potentially looking at two weeks lost before they even dispatch, on top of the normal lead time. Material in quarantine adds a few more days on top.

**Brunch:** That gives us an approximate path to usable material: seven days of supplier preparation, about 21 in transit, then quarantine. I’ve kept the proposed two-week outage as extra time before dispatch. The draft uses **three days for quarantine as my replaceable placeholder**, not as your estimate.

Does the Chinese supplier provide Sonaflozin, Flowbind Material, or both?

## Turn 4

**Person:** Just Sonaflozin. Flowbind comes from the Indian supplier normally, with German Supplier for urgent top-ups or when India is out.

**Brunch:** That links Sonaflozin orders to the Chinese-supplier path. I’ve left Flowbind’s India-versus-Germany choice explicit rather than inventing an “urgent” cutoff; neither Flowbind delivery path has timings yet.

For a planned Sonic Flow run, how is its need for Sonaflozin and Flowbind Material determined, and what happens if either material isn’t usable when production needs it?

## Turn 5

**Person:** It's one unit of each per unit of Sonic Flow, so the requirement is just the planned batch size. If either material isn't available and released from quarantine, the production order waits. That waiting has a cost, and if it goes on too long it affects our ability to fill customer orders.

**Brunch:** The draft now holds a planned batch until enough **released** Sonaflozin and Flowbind are available, then deducts one unit of each per Sonic Flow unit. It does not yet calculate waiting cost or late customer orders.

For the reorder decision, what does your team include in **inventory position**—for example, usable stock, quarantined stock, open purchase orders, or material already committed to production—and what unit are the 2,500 and 1,500 thresholds in?

## Turn 6

**Person:** The thresholds are in the same units as the material quantities, so units of Sonaflozin or Flowbind respectively. Inventory position would include on-hand stock plus open orders, that's standard. Whether quarantined stock counts I'd have to check—I'd want to say it shouldn't, because it's not usable yet, but I'm not certain that's how it's set up in SAP.

**Brunch:** I’ve recorded inventory position as **on-hand stock plus open orders**, with the important caveat that we haven’t verified whether SAP counts quarantined stock as on-hand. The draft therefore still takes inventory-position readings as inputs rather than claiming it calculates them correctly.

For the two-week China outage, what production plan should the reorder points be tested against—when would Sonic Flow batches be needed, and roughly how large would they be?

## Turn 7

**Person:** Batches run roughly every two weeks, averaging around 700 units, though there's real variation—standard deviation is maybe 200 units from the records. Batch size right now is driven off the live forecast, so it can move around with demand. That's actually one of the things I want to test: whether we'd be better off running batches closer to the recorded static plan size rather than chasing the forecast.

**Brunch:** We can now keep the live-forecast and static-plan batch schedules separate in the draft without treating the roughly 700-unit average or possible 200-unit spread as a made-up demand distribution. Neither schedule has been supplied yet, so the two outage cases are **not ready to compare**.

What batch size is in the recorded static plan—or is it a dated series of planned batch sizes rather than one fixed size?

## Turn 8

**Person:** It's not a single fixed number, it would be a dated series. The recorded average from the data is about 699 units per batch. I'd describe it as the plan staying around that level, whereas the forecast-driven approach would be calculating batch size from current order rate times the plan period times average order size—and that comes out around 662 on average but can move more.

**Brunch:** That corrects an important distinction: the static plan is a **dated series**, not a fixed 699-unit batch. I’ve kept 699 and 662 as approximate averages, and added the forecast-sizing calculation without using those averages as inputs.

Is a forecast-driven batch size recalculated from the **current** order rate when the batch is released, or fixed earlier when its dated production plan is set?

## Turn 9

**Person:** From what I understand it's based on the current rate at the time the batch is being planned, so it would shift if demand has moved. That's what makes it volatile—if there's a noisy week, you get a noisy batch size.

**Brunch:** I’ll treat the order rate as a **planning-time snapshot**, tentatively, rather than recalculating an already planned batch when production starts. I won’t turn “a noisy week” into a probability distribution without the records.

You also flagged expiry. When material expires, what happens to the amount production can use—are Sonaflozin and Flowbind tracked and removed by lot, or handled another way?

## Turn 10

**Person:** Lot level. Each lot has an expiry date and you can't use it once it's expired, it gets written off. We use oldest eligible stock first, so a lot that's close to expiry gets used before a newer one. The concern is material sitting too long in quarantine or during a supplier delay eating into shelf life.

**Brunch:** That changes the model materially: an aggregate stock balance would let expired material appear usable. I’ve replaced it with lot-level usable stock and write-offs, and removed the old production calculation until it can allocate eligible lots correctly. So the draft **cannot yet assess which purchasing or batch policy performs better**.

For Sonaflozin, when is a lot’s expiry date set—before dispatch, on receipt, or at some other point?

## Turn 11

**Person:** It would be set by the manufacturer and confirmed on the certificate of analysis, so it's fixed before dispatch. The shelf life is just counting down from that point—transit, quarantine, time in the warehouse, all of that is eating into it.

**Brunch:** I’ve connected Sonaflozin’s certified expiry date to the journey: remaining shelf life now runs down before dispatch once the certificate exists, through transit and quarantine, and in usable stock. Expired lots cannot be released as usable material.

One provisional shortcut needs checking: does a Sonaflozin order arrive as **one certified lot for the full order quantity**, or can it be split across several lots or dispatches?

## Turn 12

**Person:** In practice a large order could come in multiple lots, each with its own expiry and certificate. I wouldn't assume one lot per order, especially for a 2,500 unit bulk order. But I don't have exact lot sizes to hand.

**Brunch:** I’ve corrected that shortcut: a Sonaflozin order can now be dispatched in several separately certified lots, each keeping its own expiry date. Exact lot sizes still have to come from records.

At production, if the oldest eligible lot contains less than a planned Sonic Flow batch needs, do you take the remainder from the next eligible lot, or does the batch wait for one lot large enough?

## Turn 13

**Person:** You'd take from multiple lots, as long as there's enough total released stock. The batch doesn't need everything from a single lot.

**Brunch:** That confirms a batch can use several eligible lots; it should wait only when their **combined released quantity** is insufficient. I haven’t restored the production calculation yet: the first way I tried to apply the lot order across any number of lots was rejected by Petrinaut’s code checker, so it would be misleading to show a purchasing comparison now.

When “oldest” and “closest to expiry” point to different lots, which one does production use first?

## Turn 14

**Person:** Closest to expiry—that's the standard pharmaceutical practice, FEFO. You want to avoid write-offs.

**Brunch:** FEFO is clear now: use the eligible lot with the nearest expiry first, even if another lot arrived earlier. I’m keeping production allocation open rather than claiming the current draft enforces FEFO.

For deciding whether a purchasing choice “holds up,” what counts as a customer-service failure: missing a promised ship date, a production order waiting beyond a set number of days, or something else?

## Turn 15

**Person:** Fill rate is the main one—we want at least 95% of orders filled. Production delay is a separate indicator, we'd want average delay to be under about a quarter of a week per planned production unit. Expiry rate matters too, under 5% per material. Those are the three targets the team set for the 104-week run.

**Brunch:** Those three targets give us a clear way to judge the 104-week comparison. I haven’t turned them into calculated results yet: the draft still lacks FEFO-compliant production and a customer-order fulfillment path, and the expiry-rate denominator is undefined.

For the **95% fill rate**, does an order count as filled only if it is complete by its promised date, or if it is eventually filled at any point in the 104 weeks?

## Turn 16

**Person:** On time, so by the promised date. An order that ships three weeks late still hurt the customer—and for spot customers, they might have cancelled by then anyway.

**Brunch:** For the 95% on-time fill target, if only **part** of a customer order ships by its promised date, does that order count as filled, or must the whole order ship on time?

## Turn 17

**Person:** I'd want to say the whole order needs to ship on time for it to count as filled. Partial shipments are a workaround, not a success.

**Brunch:** I’ll use **the whole order shipped by its promised date** as the intended success rule, while keeping it distinct from whatever SAP currently reports.

For the “under 5%” expiry target, 5% of which quantity for each material—purchased, received, or released for use? Should a lot that expires before site receipt count?

## Turn 18

**Person:** That's a good question and I don't have a precise answer. I'd think of it as a percentage of what we received and could have used—so material that made it to the warehouse and then expired before we got to it. A lot that expired in transit is a different kind of loss. But I'd want to look at how the team defined it when they set the target.

**Brunch:** I’ve kept **transit expiry separate** from Sonaflozin that expires after becoming usable in the warehouse. The draft reports quantities, not the team’s under-5% rate; its denominator still needs checking.

For the production-delay target, when does a planned unit’s delay clock start and stop—at its scheduled batch start and the **actual start of production**, or at finished production?

## Turn 19

**Person:** I'd measure it as the wait before production actually starts—scheduled versus actual start. Once the batch is running the production time itself is fairly fixed at about a week, so the variable part is the wait for materials.

**Brunch:** I’ve added a waiting-time clock that starts when a planned batch reaches its scheduled start. It cannot stop or produce your average-delay measure until production can start using FEFO-selected lots.

For “per planned production unit,” should a 700-unit batch waiting two days contribute **1,400 unit-days** to the delay average, before dividing by planned units?

## Turn 20

**Person:** That sounds right to me. Bigger batches waiting longer should count more.

**Brunch:** I’ll treat the delay target as **batch-size-weighted waiting before production starts**. The draft has the quantity and waiting clock, but still lacks the production-start step needed to calculate that average.

For Flowbind, how long does an order normally take to become **released and usable** from India, and how does that timing differ for a German urgent top-up?

## Turn 21

**Person:** India is about 14 days total lead time from the records, give or take a few days—one week supplier preparation, rest transit. Germany is about 15 days, similar split, but the German orders are small urgent top-ups so they tend to be prioritised differently. Quarantine adds a few days on top for either source.

**Brunch:** I’ve added separate Flowbind supply timings: roughly 14 days from India and 15 from Germany, with quarantine afterward. The draft stops before counting either delivery as usable stock because its lot and expiry details are still missing. I’ve **not** made Germany faster just because its orders are urgent.

What does “prioritised differently” mean in practice for a German top-up—does it change dispatch timing, which order gets handled first, or something else?

## Turn 22

**Person:** I was just noting that urgent top-ups don't sit in a queue the way a routine bulk order might. In terms of the data, the lead time is what it is—about 15 days. I wouldn't read more into it than that.

**Brunch:** Understood: I won’t add a separate German priority or queue effect. The draft uses the roughly 15-day German lead time you described.

For the 104-week comparison, should both batch plans start from the **same dated SAP snapshot** of material lots and open orders, or from a deliberately chosen starting stock position?

## Turn 23

**Person:** Same starting position—otherwise you're not comparing the policies, you're comparing the starting stock. I'd use the SAP snapshot as the starting point for both.

**Brunch:** Both outage cases are now marked to use the **same SAP starting snapshot**; no snapshot has been loaded, so neither is ready to compare.

Which SAP snapshot date should be **week 0** of the 104-week run?

## Turn 24

**Person:** I'd have to pull that from SAP—I can't give you a specific date off the top of my head. For the model I'd want it to be the most recent clean snapshot we have, but I don't have that date to hand right now.

**Brunch:** We can leave the date open until you pull it from SAP. Both cases will use the same snapshot, selected as the most recent **clean** one; their starting data is still missing, so I won’t compare the policies yet.

When you say a snapshot is “clean,” what would make you reject one?

## Turn 25

**Person:** Something like a system migration, a period where data entry was inconsistent, or a known data correction that hadn't fully propagated. Basically I'd want a snapshot where the stock figures and open orders are reliable, not one taken in the middle of a known data problem.

**Brunch:** That gives us a practical screen: use the most recent SAP snapshot whose stock figures and open orders are reliable, excluding one caught in a migration, inconsistent entry period, or unfinished correction. We still need to identify and check an actual snapshot; I won’t treat the missing starting data as zero.

While that lookup waits: when a Sonic Flow batch finishes, what happens before its units can be shipped against customer orders?

## Turn 26

**Person:** Finished goods go through quarantine as well—same kind of process, quality release before they can be shipped. I'd expect the hold to be similar in length to raw material quarantine.

**Brunch:** Finished Sonic Flow must clear finished-goods quarantine before it can ship. I’ve added that gate to the draft, with quality clearance supplied as an external input rather than assuming an exact hold time. The production and customer-shipping paths still aren’t connected, so this does not yet produce a service result.

If a finished batch **doesn’t** receive quality release, what happens to it—does it remain on hold, get reworked, or get scrapped?

## Turn 27

**Person:** I have to stop here, I've run out of time for today. Can you fill in the rest with your best guesses and flag clearly what you've assumed? I'd rather see a complete draft with marked assumptions than a half-built one.

**Brunch:** I’ve filled in the **production-to-customer path as a clearly marked draft**, rather than leaving it disconnected. A planned batch now has a proposed start gate, an approximately one-week production run, finished-goods quarantine, batch-matched quality release, and a path for shipping whole customer orders. I also added candidate measures for on-time orders and production-start wait.

**The central assumption is not yet safe for a policy comparison:** the draft accepts an *externally supplied* confirmation that both materials were allocated by FEFO. It checks the quantities, but it does **not** select or deduct the actual lots. Purchasing and expiry therefore cannot yet reliably determine when production can start. I also assumed an aggregate pool of released finished goods and immediate whole-order shipment; neither shipping practice nor what happens to a batch denied quality release has been confirmed. No exact finished-goods quarantine duration was invented.

The new code has no reported net-function compilation errors, but **nothing has been simulated**. Both policy cases still lack the shared, checked SAP snapshot, dated plans and demand, and quality-release inputs. The team’s expiry-rate denominator is also unresolved. This is a more complete **structural draft**, not a 104-week result or a recommendation.

When work resumes, the decisive next step is to obtain the most recent clean SAP snapshot and make FEFO allocation deduct the recorded lots before trusting a comparison.
