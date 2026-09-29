## Turn 1

**Person:** I'm Elena Fischer, materials planning and operations lead for Site 1000. We make Sonic Flow from Sonaflozin and Flowbind Material, and our purchasing has to allow for supplier outages, transit delays, quarantine, expiry and production demand. I'd like to build a model of this from scratch that shows whether our purchasing choices hold up, and that I can explain and change.

**Brunch:** To make this useful for testing purchasing choices, could you walk me through one recent Sonic Flow production need—from when you knew material was needed through ordering, receipt, and what happened when production came to use it? Pick an ordinary case or one that went wrong.

## Turn 2

**Person:** Sure. Last spring we had a Sonaflozin order that was straightforward until it wasn't. The inventory position dropped below the reorder point, SAP triggered the order to Chinese Supplier, and we expected it in around four weeks — which is normal. It arrived, went into quarantine, got released after a few days, and by then the production run was already waiting. We ran the batch and it was fine. The one that went wrong was earlier: the shipment was delayed at customs for something like six weeks, and by the time it arrived we'd already delayed two production orders. Nothing was scrapped, but we had backlog building and I had quality chasing paperwork while purchasing was trying to figure out whether to consider the shipment lost.

**Brunch:** In the delayed-shipment case, what would have let those two production orders go ahead: how much released Sonaflozin and Flowbind Material did each need, and could one shipment cover more than one order? That determines whether the model can show a real shortage rather than just a late delivery.

## Turn 3

**Person:** Each production order uses one unit of Sonaflozin and one of Flowbind per unit of Sonic Flow, so a typical batch around 700 units needs roughly 700 of each. One 2,500-unit shipment would cover several orders, yes. The problem in that case was we didn't have enough released Sonaflozin on hand — the delayed shipment was the one we were counting on. Flowbind was fine.

**Brunch:** One 2,500-unit shipment can now cover several roughly 700-unit orders in the draft, rather than being treated as a single batch. The timing and purchasing rules are still open.

Which purchasing choices do you want to compare first when you ask whether the plan “holds up”—for example, when to reorder, how much to order, or whether to use another supplier?

## Turn 4

**Person:** The reorder points and targets, mainly. We have numbers in SAP but I'm not confident they were set with expiry and supplier disruption in mind — they were probably set to cover a comfortable lead time and that's it. The other thing I want to test is whether to keep production following the live forecast or bring it back toward the static plan.

**Brunch:** Can you recall a time when the live forecast pulled away from the static plan? What changed in the production orders you actually released, compared with what the static plan would have called for?

## Turn 5

**Person:** Yes, last autumn we had a run of larger spot orders over a few weeks and the forecast jumped. Production tried to chase it, batches came out bigger, and then demand dropped back and we ended up with more finished stock than we needed. The static plan would have kept batches around 700 regardless. Whether that would have been better I honestly can't say — we didn't have a backlog problem, we just had more stock sitting there than I'd have liked.

**Brunch:** When demand fell back, what normally took finished Sonic Flow out of stock—customer shipments, another use, or something else? And was the concern simply how much was left, or that it might expire before it could be used?

## Turn 6

**Person:** Customer orders drew it down, yes — nothing else. The concern was expiry. Sonic Flow has a relatively short shelf life, something like 28 weeks from what I can see in the records, so if you overproduce and then have a quiet period you can find yourself with stock that won't last long enough to be useful.

**Brunch:** For the SAP settings you most want to test, what happens when Sonaflozin falls below its reorder point? In particular, what does SAP count as the inventory position, and does the target determine how much it orders?

## Turn 7

**Person:** The inventory position includes what's on hand plus what's already on order, I believe. When it drops below the reorder point, we place an order to bring it up to the target — so the order quantity is target minus current position, rounded up to the minimum order quantity. For Sonaflozin that's a reorder point of 2,500 and a target of 7,500.

**Brunch:** When you say SAP rounds the order up to the minimum order quantity, does that mean it orders **at least** a minimum amount, or only **whole multiples** of that amount? What is the Sonaflozin minimum? The draft currently uses a clearly labelled 1-unit stand-in, so its calculated order sizes should not yet be used to judge the settings.

## Turn 8

**Person:** Multiples, I think — the purchase orders in SAP come in 2,500-unit increments for Sonaflozin. So it would round up to the nearest 2,500. Flowbind is similar, 2,500 from the Indian supplier, and German Supplier handles the 250-unit top-ups.

**Brunch:** Do the German Supplier’s 250-unit top-ups apply to Sonaflozin, Flowbind, or both? And what makes you use a top-up instead of the regular supplier order?

## Turn 9

**Person:** Flowbind only — German Supplier doesn't supply Sonaflozin. We use them when our Flowbind stock drops critically low, below 500 units, or when the Indian supplier is out. It's not a routine order, just an emergency top-up.

**Brunch:** For the expiry risk behind the reorder settings, does Sonaflozin or Flowbind expire while you hold it? If so, what date starts its usable life, and what happens when it can no longer be used for production?

## Turn 10

**Person:** Both can expire. The shelf life clock starts at the supplier — it's running through preparation and transit and quarantine before we can even use the material. From what's in the records, current Sonaflozin lots have somewhere between 88 and 156 weeks left. We don't have batch expiry records for Flowbind so we've assumed 156 weeks. When it expires it gets removed and we write down the value — we can't use it.

**Brunch:** Is the assumed **156 weeks for Flowbind** its total life starting at the supplier, or an estimate of the life remaining once it reaches Site 1000? That difference matters because transit and quarantine would use up part of the first, but not the second.

## Turn 11

**Person:** That's a fair question. For Sonaflozin we're using the remaining life as of when we look at the records, so the transit and quarantine time comes off what's left. We've assumed the same approach for Flowbind — 156 weeks remaining on current stock, not total from manufacture. Though I should say it's an assumption the team made because we had nothing better.

**Brunch:** For comparing reorder settings against shortages and expiry, how far ahead should the model follow the plan—a season, a year, or another planning window you use?

## Turn 12

**Person:** 104 weeks. That was the team's choice — two years gives disruptions and expiry enough time to actually show up, rather than getting lucky in a short run.

**Brunch:** Over those 104 weeks, what would make one setting better than another for you: fewer delayed production orders, less stock written down at expiry, or a particular balance between the two? Is either outcome a limit you would not accept even if the other improved?

## Turn 13

**Person:** Both matter, but there are limits. We need at least a 95% customer fill rate — production delays that feed through to backlog aren't acceptable below that. And we'd want expiry below 5% of material over the period. Within those, the policy with the lower overall cost wins. If a setting meets both limits but costs more than another that also meets them, I'd want to understand why before choosing it.

**Brunch:** For the 95% customer fill-rate limit, how does Site 1000 calculate it: by orders or units, and does a late shipment count as filled or as a miss?

## Turn 14

**Person:** Honestly I'm not certain how we'd define it precisely for this model. In practice a late delivery to a contract customer is a problem — we're paying for the lateness. A spot customer who cancels while waiting is a lost sale. I'd say a miss is any order that doesn't ship on time, whether it ends up delayed or cancelled.

**Brunch:** When you say “lower overall cost,” which costs does your team put into that comparison? I’ve heard material write-downs, contract lateness payments and lost spot sales; what purchasing or stock-holding costs also count, if any?

## Turn 15

**Person:** Purchase cost, storage, disposal when we reject or expire material, production shortage costs when we can't run a batch, and the switching cost when we have to go to German Supplier in an emergency. Some of those numbers we got from SAP, others the team estimated because the data doesn't have them. I know which is which.

**Brunch:** Which of those cost figures come from SAP, and which are team estimates? For any estimate, what is it based on?

## Turn 16

**Person:** Purchase prices come from SAP — around EUR 89 per unit from Chinese Supplier, EUR 110 from Indian, EUR 82 from German. The Sonic Flow profit figure of roughly EUR 55 per unit is also from the data. Storage, shortage, disposal, lateness and the EUR 5,000 supplier-switching cost are all team estimates; they're reasonable industry figures but they weren't measured at Site 1000.

**Brunch:** For the estimated production-shortage cost, what figure does the team use, and what does one charge apply to—each batch that cannot run, each unit short, or time spent waiting?

## Turn 17

**Person:** I'd have to check the exact figure — I don't have it to hand. It applies per unit short, I believe, not per batch. But don't take that as precise; the team set it and I'd want to confirm before you put a specific number in.

**Brunch:** For the “below 5% material expiry” limit, what goes in the percentage: expired Sonaflozin and Flowbind units divided by units purchased over the 104 weeks, or does your team use a value-based measure or another denominator?

## Turn 18

**Person:** Units, I'd assume — expired units over total units handled in the period, for each material separately. That's the most natural way the team would look at it. We haven't defined a value-based measure.

**Brunch:** When you say units “handled” over the 104 weeks, would you count each unit once when it enters the period—opening stock plus new receipts—or count every movement, including use in production? I want to avoid making the expiry percentage depend on how many times the same unit was moved.

## Turn 19

**Person:** Opening stock plus new receipts — count it once when it enters, not every time it moves. That's the sensible way to do it.

**Brunch:** If a Sonaflozin shipment expires before Site 1000 receives it, does that loss count in your site’s “expired units over opening stock plus receipts” limit, or is it treated as a supplier/transit loss outside that percentage?

## Turn 20

**Person:** That's an edge case I hadn't thought about. Practically speaking, if it expires before it reaches us it would likely be flagged as a quality rejection rather than expiry from our perspective. I'd say count it in our expiry figure only once it's been received and entered our stock.

**Brunch:** How does a routine Flowbind order from the Indian supplier get started and sized? I have the 2,500-unit increment and the separate German emergency rule, but not the regular replenishment rule that would determine most Flowbind receipts.

## Turn 21

**Person:** Same logic as Sonaflozin — when the inventory position drops below the reorder point, we order enough to reach the target, rounded up to 2,500 units. For Flowbind the reorder point is 1,500 and the target is 5,000.

**Brunch:** When an Indian Flowbind shipment arrives, does it also wait in quarantine for quality release before production can use it, as Sonaflozin does? The draft currently credits it as usable at receipt, which may be too early.

## Turn 22

**Person:** Yes, all incoming raw materials go through quarantine before production can touch them. That's standard — you can't use it just because it's physically on site. Both Sonaflozin and Flowbind, regardless of which supplier.

**Brunch:** Once a raw-material shipment is in quarantine, what usually determines when quality releases it, and what happens if quality rejects it? A recent release or rejection would help pin down the waiting time and whether rejected units count in the site’s loss figures.

## Turn 23

**Person:** Quarantine covers checking the delivery against the order — identity, quantity, packaging, damage, and the certificate of analysis from the supplier. If it passes, quality releases it and it moves into usable stock. If something fails, the lot is rejected, moved out of usable inventory, and we dispose of it at a cost. We can't tell in advance which lots will fail — we assume about 5% rejection based on general industry figures, not our own records. The hold itself takes around four days on average.

**Brunch:** Can you walk me through a supplier outage you remember—Chinese Supplier or Indian supplier—from when you learned they were out to when orders started moving again? I’m particularly trying to distinguish an order they couldn’t accept from one they’d accepted but couldn’t dispatch.

## Turn 24

**Person:** Sorry, I've run out of time for today. Can you fill in whatever else you need with your best guesses and carry on from there?

**Brunch:** I carried on with a **partial Site 1000 draft** and saved an *Illustrative one-batch walkthrough* so you can inspect and change the starting values. It uses one 700-unit production order, 2,500 units of each released ingredient, and a contract customer order due in one week. The opening quantities, Sonaflozin’s 100 weeks remaining, and the due date are **my guesses**, not Site 1000 records; Flowbind’s 156 weeks remaining is the team’s current-stock assumption.

The draft represents the reported reorder points and targets, supplier routes, quarantine and rejection, lot ageing, the one-to-one recipe, and some customer and cost outcomes. The construction tools accepted it, and the **net function-code check** found no errors. The saved scenario has **not** been compiled through an experiment or run, so those checks do not establish its behavior.

It **cannot yet tell you which policy holds up over 104 weeks**. Supplier and demand timing, live-versus-static production rules, opening lots, several cost estimates, and orders needing material from multiple lots remain unresolved. The customer fill-rate definition is still provisional; neither the **at-least-95% fill** limit nor the **separate below-5% expiry limits** has been tested or enforced. I did not draft an experiment that could be mistaken for that comparison.
