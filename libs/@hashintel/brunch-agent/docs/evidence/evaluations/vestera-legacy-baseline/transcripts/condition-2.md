# Baseline control — condition 2 (v0 prompt)

- Run started: 2026-08-13T10:25:27.625Z
- Interviewer: claude-opus-5 + v0-prompt.md
- Simulated expert: claude-sonnet-5 + situation-pack.md
- Interviewer turns: 23 (impatience probe at 8, forced wrap at 20)
- Stop reason: delivered-after-forced-wrap
- Tokens: 665855 in / 56415 out across 65 calls

---

**Opening message**:

I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

---

**Interviewer**:

Good — a Petri-net-style engine is a fine target for this; I'll build a coloured/timed Petri net (places, transitions, token colours carrying order attributes, timed transitions with distributions) and describe it precisely enough that a modelling person can load it. The format details I'll handle; what I need from you is how the plant actually works.

Let me start with **why the model exists**, because that determines how deep I dig everywhere else. Four opening questions:

1. **The decision.** When your boss says "test scheduling decisions before making them" — what decisions specifically? Are we talking about sequencing/campaign order on a line, how much to batch, when to promise a customer a date, how many changeovers to accept per week, staffing, something else? Give me one or two real decisions you've argued about in the last couple of months.

2. **The questions.** If the model could answer three questions on demand, what would you ask it? (Phrase them the way you'd actually ask.)

3. **What "better" means.** How is your schedule judged today — formally (a KPI on a board) and informally (what gets you a phone call)? If you had to trade one late order against extra changeover hours, or against inventory, do you have any sense of the exchange rate?

4. **Scope in time and space.** Does "how we schedule production" mean one line, one building, or the whole plant including raw material and filling/packing? And over what horizon do you schedule — a shift, a week, a month?

---

**Expert (Marta)**:

Good questions — let me actually think about these instead of giving you the tidy version.

1. **The decision.** The one my boss keeps poking at is the idle-vs-washdown thing. Two weeks ago I had Line 2 finish a white run at 2pm, next Meridian order not ready to release till the next morning, and the only other thing queued was a small tint job. I sat the line for a couple hours rather than wash it down and then wash it back for the next white. He wants to know if that was the right call or if I just got lucky. The other one is run-size — commercial keeps asking if we can split big orders across two lines to hit dates, and I never know if that's actually faster once you count the extra changeover, or if I'm just moving the pain around.

2. **Three questions, the way I'd actually ask them:**
   - "If Line 1's mill motor takes four days again, what do I move and what slips?"
   - "Is it cheaper to hold a line idle for an hour waiting on a same-family order, or just wash down?"
   - "Where are my changeover hours actually going, and would reordering this week's runs get me any of them back?"

3. **"Better."** Formally, ops director looks at on-time-ship percentage on a board, and changeover hours as a line item cost. Informally — the phone call I get is always about Meridian. Nothing else really generates a call, honestly, other accounts just slip and commercial handles it quietly. Exchange rate between late orders and changeover hours — no, I don't have a number, I wish I did. If you pushed me I'd say I'd eat an extra hour of changeover before I'd risk Meridian, but past that it's a gut call, not a formula.

4. **Scope.** Whole plant, all three lines — they share the changeover crew so you can't really look at one in isolation anyway. Materials I mostly just watch for red flags, I don't actively schedule around them unless something's already short. Horizon is the week — the demand book lands weekly, but I'm re-juggling it basically every day at the huddle, and the mill motor thing showed me plans can blow up inside a single shift.

---

**Interviewer**:

That's the useful version, thank you — especially the idle-vs-washdown case, because that's a decision the model has to be able to _represent_, not just report on. Let me pin down the objective function a bit harder before we go structural, because your three questions imply things you haven't said yet.

**On "better":**

1. **On-time-ship.** Measured against what date — the date commercial promised the customer, or the date the customer asked for? And what's the unit of lateness that counts: a day, a shift, an hour? If an order ships one day late does it count the same as five days late on your board?

2. **Meridian.** Roughly what share of your volume and of your order count is Meridian? Is _every_ Meridian order phone-call-worthy, or is it specific products/sites? And when you say "risk Meridian" — is the risk lateness, or is it something else (quality, a specific short lead time, an audit)?

3. **Changeover hours as a cost line.** Do you know the number they use — dollars per changeover hour, or per washdown? Even the order of magnitude, and whether it's mostly crew time, mostly solvent/waste disposal, or mostly lost line time.

4. **Idle.** Does idle line time cost anything on anyone's board, or is it invisible until it turns into a late order? That matters a lot for question two — if idle is free on paper, the model will always prefer idling and you won't learn anything.

And one on your third question, which is really an accounting question:

1. **"Where are my changeover hours going"** — do you currently have any record of actual changeover durations, or is it all standard times from a matrix? If there's a matrix, I want it later; if it's in your head, I want that instead, because the head version is usually the true one.

---

**Expert (Marta)**:

1. **On-time-ship.** It's measured against the promise date — what commercial told the customer, not what the customer originally asked for. Commercial pads a bit already so there's some slack baked in before I even see it. As for unit — honestly the board just tracks "on time or not," it's binary. One day late and five days late both just show up as a red mark in the weekly summary. Which annoys me, because a one-day slip on a small account is nothing and a five-day slip on a big one is a real conversation, but the board doesn't know the difference.

2. **Meridian.** They're maybe a third of our volume by units — almost all base whites, a couple of tint SKUs too. Order count is smaller than that, they order in bigger batches than most. Not every single Meridian order gets a call — it's specifically anything that's going to miss the ship window, doesn't matter which SKU. The risk is purely lateness — they've got a vendor scorecard and a fine schedule, and if you're late enough often enough they start pulling shelf space. It's not a quality thing for them, it's a contract thing.

3. Honestly? No, I don't know a dollar figure. I know it's treated as a cost because ops brings it up in the monthly review as hours, not dollars — "we spent 40 changeover-hours this month, that's up from 30." Whether that's mostly crew wages or the fact the line's not running during that time, I couldn't tell you. My guess, and it's just a guess, is it's mostly the lost line time that matters to them, because the crew's paid either way, they're just idle or elsewhere.

4. That's a good question and I don't think anyone's ever asked me it straight. I genuinely think idle is invisible on paper — nobody's tracking "line 2 sat for 90 minutes" as a number anywhere, it just quietly turns into either nothing (if I got away with it) or a late order (if I didn't). So yeah — if your model has a free lunch where idling costs nothing, it'll idle constantly and that won't match what actually happens, because eventually idling costs you the due date.

5. It's a matrix, sort of — there's an old spreadsheet, family-to-family changeover standard times, that's what I use when I build the sheet. But it's a standard time, not an actual — nobody logs what a changeover really took unless it went badly wrong and someone complained. So the matrix is the "should take" number, and my gut adjustment on top of it is the "actually takes," and the gut part is not written down anywhere.

---

**Interviewer**:

Right. Let me co-construct the scoring, because you've given me the ingredients and I don't want to invent the weights silently.

Here's my proposal, tell me where it's wrong:

- **Score both ways.** The model reports the board metric (binary on-time %, vs promise date) _and_ a "true cost" metric, because you've told me the board is wrong in a specific way (blind to magnitude and to account). Decisions get made on the true cost; the board number is there so you can tell your boss what the board _will_ say.
- **True cost = lateness penalty + changeover hours.** Lateness penalty scales with hours late and by account tier: Meridian weighted heavily, everyone else light. Changeover hours costed as lost line time, i.e. one changeover hour = one hour of line capacity gone.
- **Idle is not directly costed.** It only hurts by consuming the clock and pushing things late. That matches what you described — but it means the model needs due dates and arrivals to be _realistic and tight_, or idling will look free. I'll come back to that.

Now the exchange rate. I'm going to ask it as concrete bets rather than ask you for a number:

1. **Meridian bet.** Line 2 just finished white. A Meridian white order is releasable tomorrow morning. There's a small tint job that would fill the gap but needs a wash down and a wash back — say 2 hours each way, 4 hours total. Taking the tint job makes the Meridian order finish 6 hours later than its ship window. Do you take the tint job? What if it only made Meridian 1 hour late? What if the changeover were 1 hour each way instead of 2?

2. **Same bet, other account.** Same setup but the white order is Coastal, not Meridian, and it's their whole week's requirement. Does your answer change, and at what point?

3. **Utilisation reality check.** In a normal week, how much of the three lines' available hours are actually consumed by running product? Half? Three-quarters? Flat out? And do you routinely work weekends or overtime, or is the week's capacity fixed?

---

**Expert (Marta)**:

This is fair, and honestly it's already sharper than how I've ever had to think about it out loud. Let me try the bets.

**10. Meridian bet.** No, I don't take the tint job — not if it makes Meridian six hours late. Six hours can tip into "missed the truck," and that's a call I don't want to make. If it only made Meridian one hour late, I'd probably still not take it, because "one hour late" on my estimate has a habit of becoming three hours late by the time QA and the truck schedule get involved — I don't trust my own estimate that tightly. Where it gets interesting is your third variant: if the changeover were only an hour each way instead of two, so two hours total instead of four, and that only pushed things around rather than actually making Meridian late — yeah, then I'd take the tint job, because now it's basically free, I'm just filling a gap. So honestly the real threshold isn't a number of hours, it's: does it touch Meridian's window at all. If it doesn't, do it. If it does, don't, full stop. That's blunter than an exchange rate, I know.

**11. Coastal instead.** Yeah, this changes things. Coastal's not on a scorecard, they're not going to fine us. If it's their whole week's order I'd still care — a full week's requirement matters even for a small account, because if I blow it I've got nowhere to slot them next week either. But I'd take the tint job even at six hours late for Coastal, honestly, as long as six hours doesn't turn into "we missed by two days." Somewhere around a day late is where I'd start to feel bad about it. So there really are two different curves in my head — Meridian's is a cliff, everyone else's is a slope.

**12. Utilization.** Rough guess — three-quarters, maybe. It's never flat out because there's always some changeover eating into it, and Line 3's day-shift-only limits it structurally. Weekends — we don't run them as standard, but if we're in a hole close to a Meridian date, ops director will approve Saturday overtime on Line 1 or 2, that's happened maybe four or five times this year. Line 3 overtime is rarer, mostly because it needs a qualified operator who's willing to come in, not just budget approval.

---

**Interviewer**:

That's not blunter than an exchange rate — it's _more_ informative. A cliff and a slope is a perfectly implementable penalty structure, and it's a real finding: it means your policy is lexicographic (protect Meridian's window absolutely, then optimise everything else), not a weighted sum. I'll build it that way.

Let me record where we are on scoring:

- **Meridian:** step penalty — huge fixed cost if the order misses its promise window at all; magnitude beyond that barely matters (a call is a call).
- **Everyone else:** roughly linear in hours late, with the slope becoming noticeable around a day, plus an extra bump if the order is an account's whole-week requirement (because you can't recover next week).
- **Changeover:** counted as hours of lost line capacity.
- **Board metric:** binary on-time %, reported separately.

Now let's get structural. **Walk me through one concrete order, end to end** — pick a real recent one, ideally a Meridian white, and narrate it from the moment it lands in your demand book to the moment it's on a truck. Don't tidy it. I want every place it sits and waits, every person or system that touches it, and every point where it could have gone a different way.

Specifically I want to hear, as you go: where does the order physically _wait_, who decides when it moves, and what has to be true before each step can start.

---

**Expert (Marta)**:

Okay, let me pull up... well, mentally pull up, one from a couple weeks back. It was a Meridian order, 8,000 units of VW-01, one of the base white golds. Let me walk it through.

**Lands in the demand book.** ERP spits out the weekly book Sunday night, I see it Monday morning — SKU, quantity, ship date. That order had a Thursday ship window. It sits in the book, unallocated, until I get to it — the book doesn't prioritize itself, I have to look at all 40-odd orders and decide order.

**I put it on the sheet.** Monday morning before the huddle I build the week's allocation — which line, roughly what day. Meridian white always goes Line 2, no debate, so that part's automatic. What's not automatic is _when_ in the week — I look at what else Line 2's got queued, what family it's already running, and slot it in. For this one I put it Wednesday day shift, figuring Line 2 would be finishing a run of tinted colours Tuesday night, so there'd be a washdown Wednesday morning before it could start.

**07:30 huddle.** I say out loud what's happening line by line. Someone from maintenance is there, someone from QA sometimes, the line leads. This is where reality intrudes — that Wednesday, the Line 2 lead mentioned the filler had been acting up over the weekend, nothing logged yet, just "keep an eye on it." I made a mental note but didn't replan.

**Materials check.** Before the run can start, I (or actually the line lead) confirms the resin and pigment for VW-01 are physically at the line — this is supposed to happen the day before, via a materials report I glance at each morning. That week it was fine, no shortage flagged.

**Washdown.** Tuesday night the tint run finishes. The changeover crew — two techs, shared across all three lines — has to be free. That week they weren't busy elsewhere, so the tint-to-white washdown happened overnight, the full three hours plus, because it's the expensive direction. It has to be _fully_ done, checked by a line tech, before mix can start — there's a sign-off, someone has to visually confirm no carryover.

**Mix → mill → tint/letdown → fill.** Wednesday morning the actual run starts. VW-01 goes through the four stages. For a white, mix and mill go fast, tint/letdown is basically nothing since it's not being colored, and fill is where it actually spends its time — fill is the bottleneck for whites, like I said. That week the filler hiccuped for about 20 minutes mid-run — small jam, cleared it, lost time but not a disaster.

**QA hold.** Once filled and packed, the pallets go into QA hold. Lab has to sample and release — for whites that's usually about four hours, but it depends on how backed up the lab is. That week it was mid-week, lab wasn't swamped, four hours held.

**Ships.** Once released, warehouse pulls it for the Thursday truck. If QA release comes in Wednesday evening, it comfortably makes Thursday. If it had slipped — say the filler jam had been two hours instead of twenty minutes, or QA had a backlog — Thursday morning becomes tight, and that's the point where I'd be making calls, maybe asking QA to prioritize the pallet, maybe finding out if there's a later truck.

Where could it have gone differently: if the changeover crew had been busy with Line 3 that Tuesday night, the washdown slips to Wednesday morning and the whole run pushes into the day, eating into the QA buffer. If the filler jam had been the "half a shift" kind instead of the "twenty minutes" kind, same problem. Both of those are the ordinary ways a Meridian order gets tight — not exotic, just the normal noise of the plant landing on the wrong day.

---

**Interviewer**:

That walkthrough gave me most of the skeleton. Let me nail the line topology first, because it determines whether this is a four-stage flow shop or a single occupancy block, and that changes the model shape completely.

1. **Pipelining.** Mix → mill → tint/letdown → fill. When VW-01 is at fill, can the _next_ order already be mixing on the same line? Or does one order own the whole line from mix through fill? If it can pipeline, is there physical buffer between stages — tanks, totes — and how many orders' worth?

2. **Batch structure.** Was that 8,000 units one continuous run, or is it broken into batches (a mix vessel's worth) that move through as discrete lumps? If batches — what's a typical batch size relative to that order, and do all batches of an order have to finish before QA samples, or does QA sample per batch?

3. **The three lines.** What can each run, and what can't it? You said Meridian white "always goes Line 2, no debate" — is that a hard qualification (Line 1 physically can't), a quality rule, or just habit? And what makes Line 3 different besides day-shift-only?

---

**Expert (Marta)**:

1. **Pipelining.** Yes, it pipelines, that's basically the whole point of the tanks between stages. While fill's running on the tail end of one batch, mill can already be starting on the next batch of the _same_ order, and mix even earlier than that. But it's not infinite — there's a small holding tank between each stage, and if the downstream stage is slower than upstream, the tank fills up and upstream has to stop. That's the Line 1 mill-to-fill tank problem I mentioned — it's small, so mill backs up waiting for fill to catch up, more than it should. On Line 2 and 3 the tanks seem adequately sized, I've never heard complaints about them. As for "how many orders' worth" — I'd say each tank holds maybe one batch, two if you're lucky, not more. It's not built to buffer a changeover-length gap, it's built to smooth the normal pipeline hiccups.

2. **Batch structure.** Yeah, 8,000 units isn't one continuous pour, it comes off the mix vessel in batches — a mix vessel holds maybe 1,000-1,500 units' worth depending on the product, so that order was probably six, seven batches. They move through as discrete lumps, each one going through mill, tint, fill in sequence, pipelined behind each other like I said. QA doesn't wait for the whole order — they sample per batch, or actually I think it's more like per some number of batches, they don't test every single one if it's the same SKU running clean. But the pallets from the _last_ batch still have to clear QA before the whole order can ship, obviously, so functionally the order's held up by its slowest/last batch through the system.

3. **The three lines.**

- **Meridian on Line 2** — this one really is a hard rule, not physics. Years back Meridian did an audit and specifically qualified Line 2's fill area for their whites — some paperwork thing about equipment. We could probably physically run their orders on Line 1, but nobody's going to risk it without redoing that qualification, and nobody's pushed for that.
- **Line 1** is qualified for everything, including specialty — it's the old reliable, slower but flexible.
- **Line 2** is fast, big-volume, but it was never piped for the clear resins specialty uses, so it flat-out can't run specialty — that's physical, not paperwork.
- **Line 3** is newest and quick, but it's product-by-product qualified — there's a list, and I know two tint SKUs specifically aren't on it yet, someone in quality is slowly working through validating it for more. Day-shift-only is a separate constraint on top — that one's a staffing/overtime decision, not a capability one.

---

**Interviewer**:

Good — that's a proper flow shop with finite buffers, and Line 1's small mill-to-fill tank is a real modelled constraint, not a footnote.

Now the taxonomy, because your changeover matrix is keyed on it.

1. **Families.** You've mentioned base whites, tints/tinted colours, and specialty. Is that the full family list as the changeover matrix sees it? How many SKUs roughly in each, and are there sub-distinctions _within_ a family that change the changeover (e.g. dark tint → light tint worse than light → light)?

2. **Changeover direction and cost.** You said tint→white is "the expensive direction, full three hours plus." Give me the shape of that matrix as you carry it in your head: white→white (same SKU / different SKU), white→tint, tint→tint, tint→white, anything→specialty, specialty→anything. Standard times, and where your gut says the standard is wrong.

3. **Does the changeover differ by line?** Same family transition on Line 1 vs Line 2 vs Line 3 — same hours, or does the bigger/faster line take longer to wash?

---

**Expert (Marta)**:

1. **Families.** Yeah, that's the three the matrix runs on — base whites, tints, specialty. Roughly, of the 14 SKUs: whites are maybe 4-5 SKUs but they're the bulk of the volume, tints are the biggest count, maybe 7-8 different colors, and specialty is the small tail, 2-3 SKUs. Within tints there absolutely are sub-distinctions that matter but the matrix doesn't capture them well — going from a dark tint to a light tint is worse than light-to-light or dark-to-dark, because of exactly the same carryover logic as tint-to-white, just less extreme. The matrix just says "tint-to-tint, X minutes" flat, and I mentally add time if I know it's dark-to-light. That's gut, not written down.

2. **The matrix, as I carry it:**

- White→white, same SKU: basically nothing, a rinse, call it 15 minutes, mostly just checking nothing's off.
- White→white, different SKU: 20-30 minutes, quick rinse — same family, no real risk.
- White→tint: about 45 minutes. Going _into_ pigment from clean is easy, you're not fighting carryover.
- Tint→tint: depends on the direction like I said — light-to-light maybe 30-40 minutes, but dark-to-light I pad it, call it an hour, hour and a half even though the sheet says the same number as any tint-to-tint.
- Tint→white: the bad one, full washdown, 3 hours plus. My gut says the matrix's "3 hours" is actually optimistic — I've seen it run closer to 3.5 more than once, especially after a dark tint.
- Specialty in or out, either direction: about 2 hours. Doesn't matter which way, the clears are just fussy to purge either direction.

1. **By line.** The matrix as written doesn't differentiate by line — same hours regardless. But my gut says that's wrong for at least one case: Line 1's washdowns seem to take a bit longer than the same transition on Line 2, and I've always figured it's because Line 1's older, more pipework, more places for carryover to hide. Nobody's ever timed it properly to confirm that though, it's just a feeling from watching it happen for years.

---

**Interviewer**:

Useful — I'll model the standard matrix _and_ your gut adjustment as separate layers, so you can run "what if the standard times are real" vs "what if my padding is real" and see whether it changes any decision. That's a cheap experiment and it tells you whether it's worth timing changeovers properly.

Now durations of the actual work.

1. **Run rates.** For each stage — mix, mill, tint/letdown, fill — how long does one _batch_ take, and does it differ by family and by line? You said fill is the bottleneck for whites; is something else the bottleneck for tints or specialty (I'd guess mill or tint/letdown)? Give me per-batch hours as best you can, per line if they differ.

2. **Batch size.** 1,000–1,500 units per mix vessel — does that vary by line as well as by product? Is Line 2's vessel bigger than Line 1's?

3. **Variability.** Take the one you know best — a white batch on Line 2's fill. Typical duration? One time in ten it's worse than **_? One time in ten it's better than _**? And what causes the bad tail — the filler jams you mentioned, or something else?

---

**Expert (Marta)**:

I'll be honest, this is where you're going to hit the edge of what I actually track — I know the _sheet_ numbers, which are the "should take" numbers, and I know the vibe of how wrong they are, but per-batch-per-stage isn't something I've ever broken down that finely. Let me give you what I've got.

**19. Run rates.** The sheet doesn't even really have stage-level rates — it has one number per product-per-line, "units per hour," and I back into a run time from that. So if you want stage-by-stage I'm partly guessing based on watching the line.

For a white batch, say 1,200 units, on Line 2: mix is maybe 20 minutes, mill maybe 20-30, tint/letdown almost nothing since there's no color to add, and fill... fill is the long pole, I'd guess an hour, hour and a half for that batch size, because line speed is really a fill-head-count thing. On Line 1, same batch, mix and mill are similar, but fill is slower — maybe double, hour and a half to two hours, since Line 1's older equipment.

For tints, mill and tint/letdown both stretch out — you're actually incorporating pigment and it has to mix properly, so I'd guess mill is more like 40 minutes to an hour, tint/letdown similar, and fill is actually not that different from white fill rates, maybe a bit slower. That's the "funny, Line 1 and Line 2 are nearly even on tints" thing — I think it's because tint fill isn't as fast-head-dependent, but don't hold me to the mechanism, I'm guessing.

For specialty — this is the one I feel most confident about because it's so obviously different — mill is the slow one, could be two, three hours for a batch because the stuff is thick and has to be milled properly or it's ruined. Fill for specialty is actually fine, comparable to tint fill, it's not the bottleneck at all.

**20. Batch size.** Yeah it varies. Line 2's vessel is bigger — I think it's closer to 1,500-1,800 units per batch, Line 1's more like 1,000-1,200, Line 3 I honestly am not sure, I think it's similar to Line 2 but smaller-side, maybe 1,200-1,500. Don't quote me hard on Line 3's number.

**21. Variability — white batch, Line 2 fill.** Typical, like I said, an hour to an hour and a half. One time in ten it's worse — that's your filler jam scenario, tack on 20 minutes to half an hour for a small jam, or if it's a bad one, could eat the rest of the shift, but that's rarer than one-in-ten, that's more like once every couple weeks across the whole line, not per batch. One time in ten it's better — honestly not much better, maybe you shave ten minutes if everything's smooth, there's not a lot of upside slack in fill, it runs close to its rate when nothing's wrong. So the bad tail is real and fat, the good tail is thin. The cause of the bad tail is almost always the filler — jams, or waiting on packaging materials running low, that happens too, cases or labels not being restocked fast enough, that's more a warehouse problem than a line problem but it still stops the fill head.

---

**Interviewer**:

That asymmetry — thin upside, fat downside — is exactly what I need; I'll use a right-skewed distribution rather than anything symmetric. And the packaging-materials stall is a distinct failure mode from a jam, so I'll keep them separate: you might discover the warehouse restock is a cheaper fix than the filler.

Now resources and calendars, which your walkthrough showed are where the contention actually lives.

1. **Changeover crew.** Two techs, shared across three lines. Do both techs work one changeover together, or can they split and do two changeovers at once? Are they on all shifts, or day only? And when a line finishes a run at 2am and needs a washdown — are they _there_, or do they get called?

2. **Shifts.** What's the shift pattern per line — Line 1 and 2 running nights, Line 3 day only? How many shifts a day, how many days a week? Do lines run unattended across a shift boundary, or does the run stop and restart?

3. **QA lab.** Who and how many, what hours? You said whites are "usually about four hours" — what does the tail look like when the lab's backed up, and what makes it back up? Does the lab work nights and weekends, or does a batch finishing at 11pm just sit until morning?

---

**Expert (Marta)**:

1. **Changeover crew.** They usually work a changeover together, one crew, one job at a time — that's the actual constraint I was talking about, if two lines need one at once, someone waits. I don't think they physically _need_ two people for a quick rinse, but for the big washdowns and the specialty purges, yeah, it's genuinely a two-person job, there's stuff to hold and stuff to check simultaneously. They're day shift, nominally, but they flex — if I know a washdown's needed overnight I ask them to stay late or come in early, that's a normal ask, not overtime-approval-required the way Saturday production is. If a line finishes at 2am with nobody expecting it and no changeover pre-arranged, it just sits dirty until someone's available — usually that means it waits till the day crew starts, so you lose the overnight hours you didn't plan to lose.

2. **Shifts.** Line 1 and Line 2 run two shifts, so days and evenings, some weeks a skeleton night crew if we're behind, but that's not standard. Line 3 is day shift only, like I said, that's the default — overtime unlocks a second shift on any line but needs the ops director's sign-off. Within a shift, if a run's not done and the shift ends, generally it does keep running — there's a handover, second-shift operator picks it up mid-batch, the line doesn't need to be babysat every second, it just needs someone there. Between last shift ending and next one starting is the gap where nothing runs unless someone's specifically staying late — that's the 2am problem, that gap is a black hole for anything that needs a person, changeover crew or otherwise.

3. **QA lab.** Two people, day shift basically, maybe a bit into evening if something's backed up, but nobody's in that lab at 2am or on weekends normally. Four hours is the typical hold-to-release for whites when the lab isn't backed up. What backs it up is exactly what you'd guess — everything landing on Wednesday/Thursday because that's when the week's runs tend to finish, so the lab gets a pile all at once. When it's backed up I've seen holds stretch to eight, ten hours, and if a batch finishes Friday evening or over a weekend, it can just sit until Monday morning — that's actually happened, and it's ugly, because now your Friday-finished order can't ship till Monday afternoon at the earliest, blown right through the week's window. That's probably the single biggest hidden Meridian risk, worse than the filler honestly, because it's totally invisible until it isn't.

(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)

---

**Interviewer**:

Roughly three more rounds — call it 15 minutes total, not now. Here's the honest inventory so you can choose how to spend it.

**Solid enough to build on:** objectives and the cliff/slope penalty structure; line topology and pipelining with finite tanks; families and the changeover matrix plus your gut layer; qualifications (Meridian↔Line 2, no specialty on Line 2, Line 3's SKU list, day-shift-only); stage durations at the accuracy you have them; the changeover crew as a single shared server; shift calendar and the overnight black hole; QA lab hours and the Friday-evening trap.

**Still genuinely missing, in priority order:**

1. **Policies at conflict points.** This is the biggest gap and the model is mostly worthless without it. Two lines want the changeover crew at once — who wins, and does an in-progress changeover ever get abandoned? How do you sequence orders _within_ a line (due date? family campaigning? Meridian first?)? Can QA be told to jump a pallet, and does that cost someone else? What actually triggers the Saturday-overtime ask, and how late in the week can you still ask?
2. **Breakdowns.** Your question one is literally "if Line 1's mill motor takes four days again." I need failure frequency and repair duration for the mill motor class of event, the bad filler jam, and anything else that has ever taken a line down for more than a shift.
3. **Arrivals and order shape.** ~40 orders/week — size distribution, split by family and by account, and how promise dates relate to the book date (how much slack does commercial actually pad in?). Plus: what gates "ready to release" — you said the Meridian order wasn't releasable till next morning, and I don't know what was holding it.
4. **Order splitting and campaigning.** Do an order's batches have to run contiguously, or can you interleave? That's the whole substance of your commercial-wants-to-split-across-two-lines question.
5. **The unwritten rules.** What would a new scheduler get wrong in week one; what you always/never do that's on no document; which rules exist because of something that went wrong once.

**My recommendation:** give me 15 minutes later today or tomorrow on items 1, 4 and 5 — those are pure head-knowledge, nobody else in the plant can supply them, and item 1 is where your idle-vs-washdown question actually lives. Items 2 and 3 I can partly reconstruct: maintenance may have downtime records and the ERP has the order book, so point me at whoever holds those, or I'll put placeholder distributions in the assumption ledger clearly marked as invented.

Go to your huddle. Tell me when, and whether you can pull the order book extract and any downtime log in the meantime.

---

**Expert (Marta)**:

Fair, that's a good split. Let's say tomorrow, same time, fifteen minutes — I'll block it so it doesn't get eaten by the huddle.

For the records: I'll ping the plant maintenance coordinator today for whatever CMMS downtime export he can pull — I know it exists, I've just never asked for it in this shape. And I'll get the order book pulled from ERP, that one's easy, it's just a report I don't normally bother running historically. If either of those comes back thin or ugly, flag it and I'll chase harder rather than let you guess quietly — I'd rather know where the model's standing on sand.

See you tomorrow.

---

**Interviewer**:

Blocked in — tomorrow, fifteen minutes, items 1, 4 and 5. I'll come with those as concrete scenarios rather than open questions so we don't burn time.

To make the two data pulls useful first time, here's exactly what I need from each. Forward these verbatim if it's easier.

**Maintenance coordinator — CMMS downtime export, last 12 months:**

- One row per downtime event: line, equipment/stage (mix / mill / tint-letdown / fill / other), start timestamp, end timestamp or duration, short description, and planned-vs-unplanned flag if it exists.
- I don't need cost, parts, or work-order text. I need _frequency and duration_, and specifically I need the long tail preserved — if the export truncates or buckets anything over 24 hours, that's the part I care most about, since your mill motor question lives there.
- If the only thing he can give me is a list of the big ones from memory with rough dates, take it. Four data points about four-day outages beat four hundred about five-minute stops.

**ERP — order book, last 26 weeks if it goes back that far:**

- One row per order line: order ID, account, SKU, family if it's a field, quantity, date the order entered the book, promise date (the one on-time is scored against), actual ship date, and line it ran on if that's captured.
- The two fields that matter most and are most likely to be missing are **date-entered-the-book** and **actual ship date** — without both I can't measure the slack commercial pads in, or reconstruct your real on-time rate. If either is absent, tell me and I'll ask you for the pattern from memory instead.

**Flagging protocol, as you asked:** anything I can't get from those exports goes in a numbered assumption ledger with the value I invented, why, and the cheapest way for you to check it. Nothing gets smuggled in quietly.

Two things you can answer in ten seconds whenever, no rush — they'll save time tomorrow:

- Does the ERP order book have a **"release" or "firm" status** separate from the promise date? (That's the thing that was holding your Meridian order until the next morning, and I still don't know what it is.)
- Roughly how many of the ~40 weekly orders are Meridian?

See you tomorrow.

---

**Expert (Marta)**:

Both quick ones:

**Release/firm status** — yeah, there's a field for it, I think it's literally called something like order status: pending, released, in-production, shipped. What was holding my Meridian order that morning specifically was a **credit/allocation hold** — logistics releases orders in batches once the truck's confirmed and the paperwork's clean, and that particular one hadn't been released yet when I wanted to start it, purely an admin timing thing, not a materials or capacity issue. It happens more than you'd think — I sometimes know an order's coming and want to slot it, but I can't actually pull the trigger till ERP says it's released, which can lag the promise date planning by a day or so.

**Meridian count** — out of the ~40, I'd guess 6 to 8 are Meridian in a typical week. Fewer orders than their volume share would suggest, because like I said, they order big.

I'll get both requests out today, verbatim. See you tomorrow.

---

**Interviewer**:

Both useful — and the second one reframes the first.

**The credit/allocation hold is a modelled object, not admin noise.** Your headline decision — sit Line 2 idle at 2pm Tuesday or wash down — only exists _because_ the next white wasn't releasable yet. That gap isn't a scheduling artefact, it's manufactured by a release process you don't control. Which means the model can answer a question your boss didn't ask: how many idle-vs-washdown dilemmas would simply evaporate if logistics released a few hours earlier, or released Meridian orders on a standing basis rather than truck-by-truck. If that's the real lever, it's a phone call to logistics, not a scheduling change — much cheaper than anything you can do on the floor.

So I'm adding to tomorrow: **how long is the lag between "I know it's coming" and "ERP says released", how variable is it, and does it differ for Meridian?** If the ERP export has a released-date or status-change timestamp, that measures it directly — worth adding to your request while it's still unsent.

**6–8 of 40 orders, one-third of volume** also tells me Meridian batches are roughly 2–3× everyone else's. That matters more than it sounds: big orders are many batches, many batches occupy a line for a long contiguous stretch, and a long stretch on Line 2 is exactly what makes everything else queue behind the cliff. I'll check that against the order book rather than assume it.

Tomorrow, in this order:

1. **Conflict points** — I'll put four concrete scenarios to you: two lines wanting the crew simultaneously; how you sequence within a line; whether QA can be jumped and who pays; what triggers and what blocks the Saturday ask.
2. **Splitting and campaigning** — must an order's batches run contiguously, and what actually happens when commercial asks to split across lines.
3. **Unwritten rules** — week-one mistakes, always/nevers, and rules that exist because of one bad incident.

Then I'll read back the whole model in summary, you correct it, and I build. Enjoy the huddle.

---

**Expert (Marta)**:

Good catch, actually — I hadn't thought about it that way, but you're right, if that's the real lever it's a much cheaper fix than anything I can do with the sheet. I'll add the released-date/status-change timestamp to the ERP ask, and I'll ask the logistics lead directly tomorrow what drives the timing on Meridian releases specifically — my gut says it's tied to truck booking confirmation, which they do a day or two out, but I've never actually asked why it's a day or two and not same-day.

See you tomorrow — 1, 2, 3 in that order works for me.

---

**Interviewer**:

Perfect. Two things to make the logistics conversation pay off, since you're having it anyway:

- **Ask what the release is actually waiting on** — truck booking confirmation, credit check, paperwork, or all three in sequence. If it's a chain, the binding one is usually not the one people name first.
- **Ask whether a standing release for Meridian is possible** — i.e. release on the production plan rather than on truck confirmation, with the truck booked in parallel. If the answer is "we've never been asked," that's your lever. If it's "we tried it and stopped," find out what went wrong; that's a constraint I need to model.

I'll come tomorrow with the four conflict scenarios pre-written, so you're reacting to concrete cases rather than generating from scratch. Fifteen minutes should hold if we don't wander.

See you then.

---

**Expert (Marta)**:

Will do — both of those are exactly the right questions, and I should've asked them myself years ago instead of just working around the gap. I'll bring back whatever logistics says, even if it's "nobody's ever asked."

See you tomorrow.

---

**Interviewer**:

Good luck with it.

So you're not generating from cold tomorrow, here are the four scenarios in advance — no need to prepare, just useful if you happen to read them before we talk. Answer them the way you actually behave, not the way the procedure would read.

**A. Crew contention.** It's 18:00. Line 1 has just finished a specialty run and needs a 2-hour purge before its next job. Line 2 finishes a dark tint at 18:30 and the next thing on it is a Meridian white — a 3½-hour washdown. Both need the two techs, and the techs are already an hour past their nominal day. Who gets them, who waits, and what do you actually do about the loser?

**B. Sequencing within a line.** Line 3 has four releasable orders queued Monday: two light tints due Thursday, one dark tint due Wednesday, one white due Friday. What order do you run them, and what would make you break that order?

**C. Jumping QA.** A Meridian pallet finishes at 16:00 Thursday; the truck is Friday 06:00; the lab has six other batches ahead of it. You ask them to jump it. Do they? Who authorises it, what does the displaced work lose, and has anyone ever said no?

**D. The Saturday ask.** What has to be true before you go to the ops director for Saturday overtime — how far behind, and how late in the week can you still ask before it stops helping? And is there a case where you'd have asked and deliberately didn't?

**Interim assumption ledger** (things I've inferred or invented so far, all provisional — flagging now so none of it goes quiet):

1. **Lateness scored in hours against promise date**, not days. _Assumed_ — your board is binary, but a binary metric can't distinguish your own cliff/slope answer. _Check:_ ship-date vs promise-date fields in the ERP pull.
2. **Meridian penalty modelled as a step at "misses the ship window"**, magnitude-insensitive beyond that. _From your answer to Q10_, but "ship window" needs a definition — I've provisionally taken it as the truck departure, not end-of-promise-day. _Check:_ tell me tomorrow if that's wrong.
3. **Non-Meridian penalty linear in hours, kink upward around 24 hours**, plus a surcharge if the order is an account's whole-week requirement. _Assumed shape_ from your Coastal answer. _Check:_ none cheap — sensitivity-test it instead.
4. **Idle time costs nothing directly.** _Your answer to Q8._ Consequence: results only mean anything if due dates and arrivals are realistically tight, so item 3 of tomorrow's list (arrivals) is load-bearing.
5. **Changeover crew = one indivisible 2-person server**, one job at a time, day shift with discretionary flex. _From Q22_, but I've assumed the quick rinses also consume the full crew. _Check:_ scenario A will probably settle it.
6. **Line 3 batch size ~1,200–1,500 units.** _Your explicit "don't quote me."_ _Check:_ mix vessel nameplate, 30 seconds on the floor.
7. **Gut changeover padding modelled as a separate switchable layer** (dark→light tint +30–60 min; all Line 1 washdowns +~15%; tint→white standard 3h → 3.5h). _Your gut, not the matrix._ _Check:_ time six changeovers with a phone; the model will tell you first whether it's worth doing.
8. **Packaging-material stalls modelled separately from filler jams.** _My decomposition, not yours._ _Check:_ whether the CMMS export distinguishes them — it may only log equipment faults, in which case the stalls are invisible and I'll need your memory instead.

See you tomorrow.

---

**Expert (Marta)**:

Read these on the way out, quick reactions before tomorrow so you're not starting cold either:

**A.** Line 2 wins, no contest — Meridian white beats specialty purge every time, that's not even a hard call. What actually happens to Line 1 is it just sits dirty, purge waits till the crew's free, which given they're already an hour over means it probably doesn't happen till the next morning. So Line 1 loses that overnight slot entirely, not just two hours — the whole gap till someone's back on shift. I might quietly ask the techs to do a shortened version if I'm desperate, but that's rare and it makes maintenance nervous.

**B.** I'd run dark tint first, then the two light tints together, white last — campaigning by family to save changeover, even though the dark tint isn't due till Wednesday and the white's not due till Friday. I'd only break that order if the white were needed sooner than Friday, or if Line 3 wasn't qualified for one of those SKUs yet, in which case it just doesn't go on Line 3 at all and I'm rearranging everything anyway.

**C.** Usually yes, they jump it — I ask the lab lead directly, no formal authorisation, it's a favor system. Displaced work just sits longer, and if it's near end-of-week that can mean _that_ batch is the one that hits the Friday-evening trap. Nobody's said no outright, but I've had the lab lead push back hard enough that I backed off once, when jumping it would've meant something else missing its own Friday truck.

**D.** Behind by about a shift is roughly the trigger — if I can see Wednesday that a Meridian order won't make it without extra hours, I ask then. Asking Thursday or later usually doesn't help, not enough runway to get approval and staff it. I've had a case where I didn't ask even though I was tempted — a slip that would've needed Saturday overtime, but it was Coastal, not Meridian, and I judged it wasn't worth the argument with the ops director for a non-scorecard account. That one shipped a day late and nobody outside the plant noticed.

All good on the ledger — nothing jumps out as wrong. See you tomorrow.

---

**Interviewer**:

Those four answers did a lot of work — A and D in particular. Three things they settled, and three new probes I'll fold into tomorrow rather than adding time.

**Settled:**

- **Crew priority is a strict rule, not a judgement:** Meridian-enabling changeover outranks everything. Non-preemptive, and the loser's penalty isn't the changeover duration — it's _the remainder of the gap until the crew is back on shift_. That's a much harsher cost than a queueing delay and it will show up strongly in results.
- **Sequencing within a line is campaign-first**, not due-date-first — you deliberately ran the Wednesday-due dark tint ahead of nothing and the Friday white last to save changeovers. Due dates only break the campaign when they'd actually be missed.
- **QA jumping is an informal, socially-limited resource**, and you've been refused once by being persuaded, which means it has a real budget.

**New probes for tomorrow (short):**

1. **Scenario A, variant:** same clash but _both_ lines are waiting on Meridian whites. Is there a tiebreak, or is it whoever's due first? I need to know whether "Meridian first" is a rule or shorthand for "most urgent first."
2. **Scenario B, hidden bit:** you put white _last_ on Line 3. Were you thinking about what the line has to run _next_ week — leaving it in a good state? If you schedule with one eye on the following Monday, the model needs an end-of-horizon state value, or it will cheat by leaving every line filthy on Friday.
3. **QA jump budget:** how often do you actually spend it — weekly, monthly? Once per week is a modellable allowance; unlimited is not.

**And one finding from D worth testing, which I don't think you said out loud:** you get Saturday overtime approved on Line 1 or 2 — but the lab is day-shift, weekdays. So Saturday production may just queue for Monday's lab and arrive no earlier than if it hadn't run. Unless the Saturday ask _includes_ a lab person, or the Friday-evening trap catches it anyway. Worth asking the ops director whether lab overtime has ever been part of that approval — if it hasn't, some of those four or five Saturdays this year may have bought you nothing.

**Ledger additions:**

1. **Changeover crew is non-preemptive** — an in-progress changeover is never abandoned mid-way for a higher-priority line. _Inferred from A._ _Check:_ one word tomorrow.
2. **A line that misses its changeover window waits until the crew's next shift start**, not merely until the crew is free. _From A._ This is the single most punitive mechanism in the model so far.
3. **QA jump is front-of-queue, not preemptive** — the test in progress finishes. _Assumed._ _Check:_ trivial, ask the lab lead.
4. **Saturday overtime adds line hours only, not lab or changeover-crew hours.** _Assumed and probably wrong in at least one direction._ _Check:_ the ops director question above.

Nothing needed before tomorrow. See you then.

---

**Expert (Marta)**:

Ha — the Saturday-lab thing is a genuinely good catch, I've never once thought about whether the lab covers it. I'll ask the ops director point blank tomorrow before our slot if I catch him.

Quick gut reactions on the three probes, so tomorrow's faster:

1. If both lines were waiting on Meridian whites, I think I'd go by whichever ships sooner — so yes, "Meridian first" is really shorthand for "most urgent first," Meridian just happens to almost always be the most urgent thing in the room. I'd want to think about whether there's a case where I'd break that, but my instinct says urgency wins even within Meridian.

2. Honestly — yes, guilty, I was thinking about Monday. Ending the week with Line 3 dirty from a white means Monday probably starts with a tint anyway and I've bought myself nothing; ending clean-ish or on a family that's likely to continue into next week is a real thing I do, even if I don't always say it out loud.

3. QA jump — maybe two, three times a month, not every week. If it were weekly the lab lead would start pushing back the way she did that one time.

See you tomorrow, and nice catch on the lab.

---

**Interviewer**:

Good — those three tighten a lot for free.

**What they settle:**

- **Priority rule is "earliest ship window first, Meridian-weighted"**, not a hard account hierarchy. That's better news than a strict rule: it's a single sortable key, so the model can implement your current policy _and_ test alternatives (pure due-date, pure campaign, campaign-with-Meridian-override) without restructuring anything.
- **You schedule with a terminal state value.** That's a real modelling requirement and I'd have got it wrong: without it, a week-long simulation happily ends with all three lines dirty on Friday, because the wash-back cost falls outside the window and the model never pays it. I'll add an end-of-week charge for leaving a line in a state that the following Monday's likely demand doesn't match — effectively "what changeover would Monday have to buy." That also stops the model from recommending changeover-avoidance tricks that just push cost over the horizon.
- **QA jump ≈ 2–3 per month** — a spendable allowance, roughly 0.6/week. Modelled as a budget with a refusal probability that rises as you spend it, which reproduces the lab lead pushing back.

**Ledger additions:**

1. **Changeover-crew priority key = earliest promise-date-at-risk, with Meridian ordered first among ties.** _From probe 1._ _Check:_ if you find a real case where you'd knowingly let the sooner-shipping order wait, tell me — it would mean the key needs a second term.
2. **End-of-horizon state value: each line charged at Friday close for the expected changeover into next week's likely first job.** _My construct, not your words — you described the behaviour, not the accounting._ _Check:_ look at what actually ran Monday morning on each line for the last few weeks; if it usually matches Friday's family, my charge is roughly right.
3. **QA jump allowance = 0.6/week, refusal probability rising with recent usage.** _From probe 3._ _Check:_ none needed; sensitivity-test it.

**Tomorrow's slot is now down to three things**, which should fit comfortably in fifteen minutes:

1. **Splitting and campaigning** — must an order's batches run contiguously; what really happens when commercial asks to split across two lines; has it ever worked.
2. **Unwritten rules** — week-one mistakes, always/nevers, the rules that exist because of one bad incident.
3. **Whatever the two data pulls and your logistics/ops-director conversations turn up** — arrivals, release lag, breakdown durations, Saturday lab cover.

Then I read the whole thing back and build. See you then.

---

**Expert (Marta)**:

Sounds right — see you tomorrow, I'll have the logistics and ops director answers plus whatever comes back from maintenance and ERP by then, even if it's partial.

---

**Interviewer**:

Good. One request on the pulls, whatever shape they arrive in: send them raw rather than tidied. If the CMMS export is 900 rows of five-minute stops with four monsters buried in it, the monsters are the point and I'd rather find them myself than have them pre-summarised away. Same for the order book — I want the messy rows, the cancelled lines, the ones with blank promise dates. The gaps tell me what the plant doesn't record, which is itself a modelling input.

If either pull is late, we still run the slot: items 1 and 2 are pure head-knowledge and don't depend on the data. I'll build with flagged placeholders and swap them out when the exports land.

See you tomorrow.

---

**Expert (Marta)**:

Understood — raw and messy it is, no cleaning up on my end. I'll tell whoever's pulling it not to bother tidying, just dump what the system gives them.

See you tomorrow.

---

**Interviewer**:

Understood — raw is right.

I'll use the gap to draft the structural skeleton, so tomorrow's fifteen minutes goes entirely on splitting/campaigning, the unwritten rules, and the data — not on me reading back things you've already told me twice.

One thing you don't need to answer now, but it surfaced while I was laying out the net, and it's structural enough that I'd rather you see it coming than have me guess:

**Is a changeover a whole-line event, or does it cascade stage by stage?** You told me the line pipelines — mix can start the next batch while fill finishes the last. But if the next batch is a _different family_, that can't be true unless the washdown happens stage-by-stage as each empties: mix gets cleaned first, then mill, then tint, then fill, with the new order following the cleaning down the line. The alternative is that the whole line drains, the crew washes everything, then the new order starts. Those two produce very different answers to your run-size question — the cascading version makes changeovers much cheaper for long runs, because the wash overlaps with the tail of the previous order. I suspect the truth is "mostly whole-line for the big tint→white washdown, but the small rinses are more casual," but that's me guessing, and it's assumption 16 in the ledger until you tell me.

Provisional skeleton, two minutes to eyeball — tell me tomorrow if the shape is wrong:

- **Token = one batch**, carrying colour: order ID, account, SKU, family, tint depth, promise date, order's batch index and count.
- **Per line, in series:** Mix → tank → Mill → tank → Tint/Letdown → tank → Fill → QA Hold → Released → Shipped. Tanks capacity 1 (Line 1 mill→fill) or 2 (Lines 2, 3), which is where your Line 1 backup comes from.
- **Per line, one setup-state place** holding a token for the family/SKU the line is currently dressed for. Changeover transitions consume the crew, the old state token, and emit the new one.
- **Shared resources as single-token places:** changeover crew (one indivisible 2-person server), lab (two analysts, day shift), each line's shift calendar as an availability gate. The overnight black hole falls straight out of the calendars — no special mechanism needed.
- **Order release** as a source transition gated by the ERP release timestamp, which is the thing your idle-vs-washdown dilemma actually hangs on.
- **Scoring** as sink-side observers: board metric (binary, vs promise), true cost (Meridian step + others' slope + changeover hours + end-of-week state charge).

1. **Changeover granularity — whole-line vs cascading per stage.** _Assumed whole-line for washdowns ≥2h, cascading for rinses <1h._ _Check:_ one question tomorrow; it materially changes the split-across-lines answer.

See you tomorrow.

---

**Expert (Marta)**:

That skeleton looks right to me at the level I can judge it — I recognize the plant in it, which is more than I expected to say about a diagram.

On the changeover granularity, since you asked me to sit with it: my honest instinct, without having ever watched it stage-by-stage on purpose, is that you're right — the big tint-to-white washdown really does feel like a whole-line stop, everything's dirty and everyone's waiting, nothing pipelines through it. The quick rinses I genuinely don't know if they cascade or not, I've just never watched closely enough to say, I always think of the line as "down for 25 minutes" rather than picturing what's happening stage by stage. I'll actually go stand at Line 2 for one of the small rinses before tomorrow and watch instead of guessing — that one's cheap to check and I'd rather give you a real answer than a guess dressed up as one.

See you tomorrow.

---

**Interviewer**:

That's the right instinct, and it'll take you five minutes. So the observation is worth having, here's what to look for — otherwise it's easy to watch a rinse and come away with "yep, took 25 minutes," which is what you already know.

**Three things to note, in this order:**

1. **Does mix restart before fill is clean?** That's the whole question. If you see the mixer running the new product while the fill head is still being wiped, it cascades. If everyone stands around until the last stage is signed off, it's whole-line.
2. **Do both techs work the same stage, or split up?** For a quick rinse specifically — if one tech does mix and mill while the other does tint and fill, that's not just cascading, it's a _parallel_ crew, and my "one indivisible 2-person server" assumption (ledger 5) is wrong for small changeovers. That would meaningfully change crew contention, because it would mean two quick rinses on two lines might actually be possible at once.
3. **When does the clock actually start and stop?** Is the 25 minutes wall-to-wall from last-batch-out to first-batch-in, or is there dead time either side — waiting for the tech to arrive, waiting for a sign-off, waiting for the line lead to confirm? Dead time that isn't crew time is a different fix from crew time.

If you can, note the wall-clock times of each — start, first stage clean, last stage clean, next batch started. Four timestamps on your phone is enough.

See you tomorrow.

---

**Expert (Marta)**:

Good, that's specific enough that I'll actually catch something real instead of just confirming what I already believe. I'll grab those four timestamps and watch for the split-crew thing especially — I hadn't even considered they might work separate stages, but now you say it I think I actually have seen the two of them go to opposite ends of the line at once and just never registered it as meaningful.

See you tomorrow with real numbers instead of a vibe.

---

**Interviewer**:

Good. One addition while you're standing there, since it costs nothing: **if you do see them split to opposite ends, note whether that's rinse-only or whether they'd split on a big washdown too.** My guess from what you said earlier — "genuinely a two-person job, stuff to hold and check simultaneously" — is that the big ones force them together and only the small ones allow splitting. If that's right, the crew is one server for washdowns and two for rinses, which is an easy thing to represent and a slightly awkward thing to discover later.

And if what you see contradicts the skeleton, that's a good outcome, not a setback — it's cheaper to find it now than after I've built the net around it.

See you tomorrow.

---

**Expert (Marta)**:

Good point — I'll watch for exactly that distinction, whether the splitting is a rinse-only thing or whether they'd do it on a washdown too if they had reason to. And you're right, I'd much rather walk in tomorrow saying "actually, no" than have you build the whole thing around something I half-remembered.

See you tomorrow.

---

**Interviewer**:

See you tomorrow.

I'll have the net drafted to the point where only the open questions are holes — splitting/campaigning, changeover granularity, and the placeholder distributions for breakdowns and arrivals. Tomorrow: your three answers, the data if it's landed, then I read the whole thing back for correction and build.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Understood. Here is the model as it stands, built on what you gave me, with everything I had to invent flagged rather than smuggled.

**One honest caveat up front:** we stopped before covering three things I'd listed as material — order splitting/campaigning contiguity (your run-size question), the unwritten rules, and the two data pulls. The model is built and runnable without them, but two of your three headline questions are affected. I've said exactly where in Section C, and the ledger tells you which dials to turn when the data lands.

---

# A. THE MODEL

A coloured, timed Petri net with priority-resolved conflicts. Tokens are **batches**; colours carry the order attributes; timed transitions carry the durations; shared resources are capacity-limited places; calendars are gate places. Everything is named in your vocabulary.

## A.0 Global switches (set these per experiment)

| Switch           | Values                                                                    | Default           | Why it exists                                                                                                 |
| ---------------- | ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `TIME_BASIS`     | `SHEET` \| `GUT`                                                          | `GUT`             | Standard matrix times vs your padding. Running both tells you whether it's worth timing changeovers properly. |
| `CO_GRANULARITY` | `WHOLE_LINE` \| `CASCADE` \| `SPLIT_BY_SIZE`                              | `SPLIT_BY_SIZE`   | Whole-line for washdowns ≥2 h, cascading for rinses <1 h. Unresolved — you were going to watch a rinse.       |
| `CREW_MODE`      | `ONE_SERVER` \| `SPLIT_ON_RINSE`                                          | `ONE_SERVER`      | Whether the two techs can work two rinses at once. Unresolved — the thing you'd half-noticed.                 |
| `RELEASE_POLICY` | `TRUCK_CONFIRMED` \| `STANDING_MERIDIAN`                                  | `TRUCK_CONFIRMED` | Models the logistics lever. This is the cheap-fix experiment.                                                 |
| `SAT_LAB_COVER`  | `OFF` \| `ON`                                                             | `OFF`             | Whether Saturday overtime includes a lab analyst.                                                             |
| `SEQ_RULE`       | `CAMPAIGN_FIRST` \| `DUE_DATE_FIRST` \| `CAMPAIGN_WITH_MERIDIAN_OVERRIDE` | `CAMPAIGN_FIRST`  | Your current policy is the default; the others are the alternatives to test.                                  |
| `EOW_CHARGE`     | `ON` \| `OFF`                                                             | `ON`              | End-of-week dirty-line charge. Off = the model cheats.                                                        |

## A.1 Colour sets

```
FAMILY   = { WHITE, TINT, SPECIALTY }
DEPTH    = { NA, LIGHT, DARK }              (* tints only *)
ACCOUNT  = { MERIDIAN, OTHER }
LINE     = { L1, L2, L3 }

SKU      = record { skuId : STRING,
                    family : FAMILY,
                    depth : DEPTH,
                    meridianQual : BOOL,     (* Line 2 fill-area qualification *)
                    l3Qual : BOOL }          (* on Line 3's validated list *)

ORDER    = record { oid : STRING,
                    account : ACCOUNT,
                    sku : SKU,
                    qty : INT,
                    bookTime : TIME,         (* Sunday 23:00 *)
                    releaseTime : TIME,      (* ERP status -> released *)
                    promiseTime : TIME,      (* the truck it must make *)
                    wholeWeek : BOOL,        (* account's whole-week requirement *)
                    line : LINE,             (* set by allocation *)
                    nBatches : INT }

BATCH    = record { oid, idx, of : INT,
                    units : INT,
                    sku : SKU,
                    account : ACCOUNT,
                    promiseTime : TIME,
                    testFlag : BOOL,         (* does QA sample this one *)
                    startedAt : TIME }

SETUP    = record { line : LINE, sku : SKU,
                    family : FAMILY, depth : DEPTH }   (* what the line is dressed for *)

TECH     = unit                              (* changeover crew member *)
ANALYST  = unit                              (* lab *)
```

## A.2 Places

**Order-level (plant-wide)**

| Place          | Contents                                         | Capacity |
| -------------- | ------------------------------------------------ | -------- |
| `P_Book`       | ORDER, status pending                            | ∞        |
| `P_Allocated`  | ORDER with `line` set, still pending ERP release | ∞        |
| `P_Releasable` | ORDER, ERP-released, awaiting line               | ∞        |
| `P_OrderDone`  | ORDER, all batches QA-released                   | ∞        |
| `P_Shipped`    | ORDER, on the truck                              | ∞        |

**Per line L ∈ {L1, L2, L3}** (the flow shop, exactly as you walked it)

| Place               | Contents                                    | Capacity                                                |
| ------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `P_MixQueue_L`      | BATCH awaiting mix                          | ∞                                                       |
| `P_Mixing_L`        | BATCH in mix vessel                         | 1                                                       |
| `P_Tank_MixMill_L`  | BATCH in holding tank                       | `TANKCAP(L)`                                            |
| `P_Milling_L`       | BATCH in mill                               | 1                                                       |
| `P_Tank_MillFill_L` | BATCH in holding tank                       | `TANKCAP(L)` ← **Line 1 = 1, the backup you described** |
| `P_Tinting_L`       | BATCH in tint/letdown                       | 1                                                       |
| `P_Tank_TintFill_L` | BATCH in holding tank                       | `TANKCAP(L)`                                            |
| `P_Filling_L`       | BATCH at fill head                          | 1                                                       |
| `P_SetupState_L`    | exactly one SETUP token                     | 1                                                       |
| `P_LineIdleClean_L` | 1 token iff no batch anywhere in L's stages | 1                                                       |
| `P_LineUp_L`        | 1 token iff not broken down                 | 1                                                       |
| `P_ShiftOpen_L`     | 1 token iff a shift is manned               | 1                                                       |
| `P_COinProgress_L`  | 1 token during a whole-line changeover      | 1                                                       |

`TANKCAP(L1) = 1` (mill→fill specifically; the other two tanks on L1 = 2), `TANKCAP(L2) = TANKCAP(L3) = 2`.

**Shared resources**

| Place           | Contents                            | Capacity           | Notes                                                     |
| --------------- | ----------------------------------- | ------------------ | --------------------------------------------------------- |
| `P_CrewPool`    | TECH tokens                         | 2                  | Both techs = one crew unless `CREW_MODE = SPLIT_ON_RINSE` |
| `P_CrewShift`   | 1 token iff crew on shift or flexed | 1                  | Absence of this token is the **2 a.m. black hole**        |
| `P_QAHold`      | BATCH awaiting sample               | ∞                  | The pallets sitting in hold                               |
| `P_LabAnalysts` | ANALYST tokens                      | 2                  |                                                           |
| `P_LabShift`    | 1 token iff lab manned              | 1                  | Absence = the **Friday-evening trap**                     |
| `P_Testing`     | BATCH under test                    | 2                  |                                                           |
| `P_QAReleased`  | BATCH released                      | ∞                  |                                                           |
| `P_JumpBudget`  | jump tokens                         | replenished 0.6/wk | The favour-with-the-lab-lead allowance                    |

## A.3 Transitions

### Arrivals and release

| Transition     | Guard                                               | Timing                           | Effect                                                                                                                                                            |
| -------------- | --------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T_BookLands`  | fires Sun 23:00 weekly                              | —                                | Emits ~40 ORDER tokens into `P_Book` (composition in ledger 27–29)                                                                                                |
| `T_Allocate`   | ORDER in `P_Book`; line qualification guard (below) | Mon 07:00 (fires for whole book) | Sets `line`, computes `nBatches = ceil(qty / VESSEL(line))`, moves to `P_Allocated`                                                                               |
| `T_ERPRelease` | ORDER in `P_Allocated`                              | at `releaseTime`                 | → `P_Releasable`. **This is the transition your idle-vs-washdown dilemma hangs on.** Under `STANDING_MERIDIAN`, Meridian orders bypass and release at allocation. |
| `T_Explode`    | ORDER in `P_Releasable`, line's queue accepts it    | instant                          | Emits `nBatches` BATCH tokens into `P_MixQueue_L`, sets `testFlag` per sampling rule                                                                              |

**Allocation qualification guard (hard constraints):**

```
account = MERIDIAN            ⇒  line = L2                     (audit qualification)
sku.family = SPECIALTY        ⇒  line = L1                     (L2 not piped for clears)
line = L3                     ⇒  sku.l3Qual = true             (validated-SKU list)
```

### Production stages (per line, per batch)

Each stage is a pair: `T_Start_<stage>_L` and `T_End_<stage>_L`.

| Transition                      | Preconditions                                                                                                                                                      | Duration                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `T_StartMix_L`                  | BATCH in `P_MixQueue_L` (chosen by sequencing policy), `P_Mixing_L` free, `P_SetupState_L` matches batch SKU, `P_ShiftOpen_L`, `P_LineUp_L`, no `P_COinProgress_L` | —                                                               |
| `T_EndMix_L`                    |                                                                                                                                                                    | `units / RATE(mix, family, L)`                                  |
| `T_StartMill_L`                 | token in `P_Tank_MixMill_L`, `P_Milling_L` free, gates as above                                                                                                    | —                                                               |
| `T_EndMill_L`                   | **blocks if `P_Tank_MillFill_L` at capacity** ← Line 1's problem                                                                                                   | `units / RATE(mill, family, L)`                                 |
| `T_StartTint_L` / `T_EndTint_L` | as above                                                                                                                                                           | `units / RATE(tint, family, L)`                                 |
| `T_StartFill_L`                 |                                                                                                                                                                    | —                                                               |
| `T_EndFill_L`                   |                                                                                                                                                                    | `units / RATE(fill, family, L)` × Noise + JamAdder + StallAdder |
| `T_ToQAHold`                    | fill complete                                                                                                                                                      | instant                                                         | → `P_QAHold` if `testFlag`, else straight to `P_QAReleased` |

**Rates (units/hour).** Derived from your per-batch times, expressed the way your sheet does it:

| Stage             | WHITE              | TINT | SPECIALTY     |
| ----------------- | ------------------ | ---- | ------------- |
| Mix (all lines)   | 3600               | 3600 | 3600          |
| Mill L1 / L2 / L3 | 2900 / 2900 / 2900 | 1450 | 480 (L1 only) |
| Tint-letdown      | 12000 (negligible) | 1450 | 2400          |
| **Fill L1**       | **700**            | 700  | 650           |
| **Fill L2**       | **950**            | 800  | n/a           |
| **Fill L3**       | **900**            | 800  | n/a           |

Note what this reproduces: whites are fill-bound and L2 is ~35% faster than L1; tints are mill/tint-bound so L1 and L2 come out **nearly even on tints**, which is the thing you noticed and couldn't explain; specialty is mill-bound on L1.

**Vessel sizes (units/batch):** L1 = 1,100; L2 = 1,650; L3 = 1,350 _(the one you told me not to quote)_.

**Fill-stage disruption (the fat right tail):**

```
Noise       ~ LogNormal(median 1.00, σ 0.06)      (* thin upside — fill runs near rate *)
JamAdder    = 0 w.p. 0.90 ; Uniform(0.33, 0.50) h w.p. 0.10     (* small filler jam *)
StallAdder  = 0 w.p. 0.95 ; Uniform(0.25, 1.00) h w.p. 0.05     (* packaging/labels not restocked *)
```

Jams and stalls are kept separate deliberately — you may find the warehouse restock is the cheaper fix.

### Changeover

`T_Changeover_L` fires when the next batch selected for line L has a SKU that doesn't match `P_SetupState_L`.

**Preconditions (WHOLE_LINE mode — the ≥2 h washdowns):**

- `P_LineIdleClean_L` (every stage empty — the line has drained)
- 2 TECH tokens from `P_CrewPool`
- `P_CrewShift` present
- Emits `P_COinProgress_L`, consumes old SETUP, emits new SETUP after duration

**Preconditions (CASCADE mode — the <1 h rinses):** four sub-transitions `T_CO_Mix_L`, `T_CO_Mill_L`, `T_CO_Tint_L`, `T_CO_Fill_L`, each requiring only its own stage to be empty and 1 or 2 TECH tokens per `CREW_MODE`. The new order follows the cleaning down the line.

**Changeover matrix (hours).** SHEET = your spreadsheet; GUT = your padding.

| From → To                                 | SHEET    | GUT                                  |
| ----------------------------------------- | -------- | ------------------------------------ |
| WHITE → WHITE, same SKU                   | 0.25     | 0.25                                 |
| WHITE → WHITE, different SKU              | 0.42     | 0.42                                 |
| WHITE → TINT                              | 0.75     | 0.75                                 |
| TINT → TINT, light→light or dark→dark     | 0.58     | 0.58                                 |
| TINT → TINT, **dark→light**               | 0.58     | **1.25**                             |
| **TINT → WHITE**                          | **3.00** | **3.50** (3.75 if previous was dark) |
| any ↔ SPECIALTY                           | 2.00     | 2.00                                 |
| Line 1 multiplier on any changeover ≥ 2 h | 1.00     | **1.15**                             |

**The punitive mechanism (from your Scenario A answer):** because the crew requires `P_CrewShift`, a line that misses the crew window doesn't wait for the crew to _finish_ — it waits until the crew's next shift _starts_. Line 1 in your scenario doesn't lose 2 hours, it loses the whole overnight. This falls out of the net structure; no special rule needed.

### QA

| Transition  | Preconditions                                           | Duration                                                                                                     |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `T_Sample`  | BATCH in `P_QAHold`, ANALYST free, `P_LabShift`         | WHITE 3.5 h, TINT 4.0 h, SPECIALTY 5.0 h (median, LogNormal σ 0.25)                                          |
| `T_Release` | test complete                                           | instant → `P_QAReleased`                                                                                     |
| `T_Jump`    | BATCH is Meridian-critical **and** jump token available | Moves batch to head of `P_QAHold`; consumes 1 jump token; **not preemptive** — the test in progress finishes |

Jump refusal: `P(refuse) = min(0.8, 0.15 × jumps_used_this_month)` — reproduces the lab lead pushing back as you spend the favour.

**Sampling rule:** first batch of an order always; every 3rd thereafter; **last batch of an order always** (this is what makes the order held up by its last batch, as you described).

### Shipping and scoring

| Transition          | Preconditions                                | Effect                                                                  |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `T_OrderComplete`   | all of an order's batches in `P_QAReleased`  | → `P_OrderDone`                                                         |
| `T_Ship`            | order complete, truck departure time reached | → `P_Shipped`, records `shipTime`                                       |
| `T_ScoreOrder`      | on shipping                                  | writes board metric + true cost                                         |
| `T_EndOfWeekCharge` | Fri 22:00                                    | charges each line for the changeover next Monday's first job would need |

### Breakdowns

| Event                                                      | Rate                                           | Duration                         |
| ---------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| **Major outage** (mill motor class) — removes `P_LineUp_L` | 0.038 per line-week (~1 per 6 months per line) | LogNormal median 48 h, P90 120 h |
| **Bad filler jam** — blocks `P_Filling_L`                  | 0.5 per line-week                              | LogNormal median 3 h, P90 6 h    |

Repair only proceeds during manned hours (a Friday-night motor failure is not being fixed Saturday).

## A.4 Calendars (gate sub-nets)

| Gate                               | Pattern                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P_ShiftOpen_L1`, `P_ShiftOpen_L2` | Mon–Fri 06:00–22:00 (two shifts, handover mid-batch permitted)                                                                                   |
| `P_ShiftOpen_L3`                   | Mon–Fri 06:00–14:00 (day only)                                                                                                                   |
| `P_CrewShift`                      | Mon–Fri 07:00–15:30 base; extended 05:00–19:00 **for a changeover pre-arranged ≥8 h ahead**                                                      |
| `P_LabShift`                       | Mon–Fri 07:00–17:00                                                                                                                              |
| Saturday overtime                  | Adds `P_ShiftOpen_L1` or `L2` Sat 06:00–18:00. Requires trigger by **Wed 17:00**. **Adds no lab and no crew hours** unless `SAT_LAB_COVER = ON`. |
| Trucks                             | Depart 06:00 daily, Mon–Fri                                                                                                                      |

## A.5 The policy layer — conflict resolution

Petri nets need explicit resolution wherever transitions compete. Every one of these is a policy you told me, and every one is swappable.

**Conflict 1 — two lines want the changeover crew.**
Priority key: `(is_Meridian_enabling DESC, earliest_promise_at_risk ASC)`. **Non-preemptive** — an in-progress changeover is never abandoned. Loser waits for crew _and_ `P_CrewShift`, which is where the overnight loss comes from.

**Conflict 2 — which batch starts next on a line (`SEQ_RULE`).**

- `CAMPAIGN_FIRST` _(your current behaviour)_: group by family to avoid changeover; within a campaign, earliest promise first; break the campaign only if a due date would actually be missed.
- `DUE_DATE_FIRST`: pure earliest-promise.
- `CAMPAIGN_WITH_MERIDIAN_OVERRIDE`: campaign, but any Meridian order at risk jumps immediately.

**Conflict 3 — idle vs washdown** _(your headline decision)_. When a line goes empty and the next same-family order isn't releasable yet:

```
IF (wash away + wash back) would touch any Meridian order's ship window
   THEN idle                                      (* the cliff *)
ELSE IF gap_hours ≥ (wash_away + gap_job_runtime + wash_back)
   THEN take the gap job
ELSE idle
```

This is your Q10 answer, implemented literally. It's also a _replaceable_ rule — the point of the model is to run alternatives against it.

**Conflict 4 — lab queue.** FIFO on arrival at `P_QAHold`, except jump tokens. Displaced work simply waits, and if it's late in the week it hits the Friday trap — which is exactly the cost of a jump.

**Conflict 5 — Saturday ask.** Trigger: at Wed 17:00, if any Meridian order's projected completion exceeds its ship window by ≥1 shift, request overtime on whichever of L1/L2 carries it. Non-Meridian shortfalls do **not** trigger a request (your Coastal case: you didn't ask, it shipped a day late, nobody outside noticed).

## A.6 Scoring

**Board metric** — binary on-time % against promise date. Reported separately so you can tell your boss what the board will say.

**True cost** — unit is one line-hour.

```
Changeover      = 1.0 × changeover_hours                    (* lost line time *)
Idle            = 0                                          (* invisible on paper; hurts only via the clock *)

Meridian late   = 200  (step, on missing the truck at all)  + 1.0 × hours_late
Other late      = 0                    for hours_late ≤ 4
                = 0.5 × (h − 4)        for 4 < h ≤ 24
                = 10 + 4.0 × (h − 24)  for h > 24
Whole-week req. = × 2 multiplier on the above

End-of-week     = expected changeover hours from each line's Friday state
                  into next Monday's first job
```

Calibration check on these weights: they reproduce your two bets. Meridian 6 h late = 206 ≫ 4 changeover-hours, so you idle. Coastal 6 h late = 1.0 < 4 changeover-hours, so you take the tint job. Coastal 48 h late = 106 ≫ 4, so you don't. That's your cliff and your slope.

## A.7 Experiments mapped to your three questions

| Your question                                                                    | Run                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _"If Line 1's mill motor takes four days again, what do I move and what slips?"_ | Inject a 96 h `P_LineUp_L1` outage at chosen points in the week; compare re-allocation policies. Note L1 holds all specialty, so specialty has nowhere to go — the model will show you that as a hard block, not a delay. |
| _"Idle an hour or wash down?"_                                                   | Sweep the Conflict-3 rule against alternatives, crossed with `RELEASE_POLICY`. **Run `STANDING_MERIDIAN` first** — the hypothesis is that most of these dilemmas are manufactured by release timing, not by scheduling.   |
| _"Where are my changeover hours going, and would reordering get them back?"_     | Changeover-hours ledger by line × family-transition × cause. Then `SEQ_RULE` sweep. Cross with `TIME_BASIS` to see whether your gut padding changes any decision — if it doesn't, don't bother timing changeovers.        |
| _(bonus, from Saturday overtime)_                                                | `SAT_LAB_COVER = OFF` vs `ON`. Tests whether some of this year's four or five Saturdays bought you nothing because the lab was shut Monday-ward.                                                                          |

**Validation target when the data lands:** replay the last 26 weeks and check the model produces (a) ~75% line utilisation, (b) **30–40 changeover-hours per month** — your ops director's own number, and the single best calibration anchor you gave me — and (c) a board on-time % matching history. If changeover-hours come out low, `CO_GRANULARITY` or the sequencing rule is wrong.

---

# B. ASSUMPTION LEDGER

Everything below is mine, not yours. **Bold = load-bearing** (could change a recommendation).

### From the interview, provisionally agreed

1. **Lateness scored in hours vs promise date.** Your board is binary but binary can't express your own cliff/slope. _Check:_ ship-date vs promise-date in the ERP pull.
2. \*\*Meridian penalty

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Section A above stands as the model — it is complete and runnable. Here are the two remaining deliverables.

---

# B. ASSUMPTION LEDGER

Everything here is mine, not yours. **Bold = load-bearing**: it could change a recommendation, so check it before you act on a result that depends on it.

### Objectives and scoring

1. **Lateness scored in hours against promise date**, not days. Your board is binary, but a binary metric cannot express the cliff/slope you described. _Check:_ promise-date vs actual-ship-date fields in the ERP pull.
2. **Meridian penalty = step of 200 line-hours at "misses the truck", plus a token 1.0/hour after.** Your Q10 answer was a cliff; the small linear term only breaks ties. **I defined "ship window" as truck departure (06:00), not end-of-promise-day.** _Check:_ one sentence from you — if the window is really end-of-day, several tight cases flip.
3. **Non-Meridian penalty: free under 4 h, 0.5/h to 24 h, then 4.0/h.** Invented shape from your Coastal answer ("somewhere around a day is where I'd feel bad"). _Check:_ none cheap — sensitivity-test the kink location instead.
4. **Whole-week-requirement multiplier = ×2.** Pure invention; you said it "matters" without quantifying. _Check:_ judgement call from you.
5. **Idle costs zero directly.** Your Q8 answer. Consequence: results are only meaningful if arrivals and due dates are realistically tight — which makes item 27–29 load-bearing.
6. **Changeover costed at 1.0 line-hour per hour**, i.e. purely lost line time, no crew wage or solvent cost. Your guess in Q7. _Check:_ ask finance what the 40-changeover-hours line item actually contains.
7. **The 200-vs-4.0 ratio was reverse-engineered to reproduce your two bets**, not elicited. It is a _fitted_ number. _Check:_ run three more of your own bets against the scoring function and see if it still agrees with you.

### Structure and taxonomy

1. **Four stages per line, all three lines identical in topology.** From your walkthrough of Line 2 only. _Check:_ does Line 3 have a separate tint/letdown stage at all, or is it combined?
2. **Tank capacity: Line 1 mill→fill = 1 batch; all other tanks = 2.** From "small, so mill backs up" and "adequately sized" elsewhere. _Check:_ nameplate volumes ÷ batch size, ten minutes on the floor.
3. **Vessel sizes: L1 = 1,100, L2 = 1,650, L3 = 1,350 units.** You explicitly said don't quote L3. _Check:_ mix vessel nameplate, 30 seconds.
4. **14 SKUs split 4 white / 8 tint / 2 specialty**, with tint depth assigned arbitrarily. _Check:_ the SKU master; also tells me which tints are dark.
5. **Line 3's unqualified list = 2 tint SKUs.** Your number, but I picked _which_ two. _Check:_ the quality validation list.
6. **Specialty runs on Line 1 only.** Follows from L2 not being piped and L3's list — but I never asked whether L3 can run specialty. _Check:_ one question. **If L3 can, the mill-motor scenario changes materially**, because specialty currently has nowhere to go.
7. **Meridian orders are Line 2 only**, and this is absolute — no emergency override exists. _Check:_ has anyone ever run Meridian on L1 in a crisis?

### Durations

1. **Stage rates in the table are reconstructed from your per-batch estimates**, which you flagged as partly guesswork. The _pattern_ (whites fill-bound, L2 faster on whites, L1≈L2 on tints, specialty mill-bound) is yours; the numbers are mine. _Check:_ the sheet's units/hour per product per line — that's a direct calibration and you already have it.
2. **Mix time identical across families and lines.** Never asked. Probably wrong for specialty.
3. **Fill noise LogNormal σ=0.06, jam 10% at 20–30 min, packaging stall 5% at 15–60 min.** Jam frequency is yours; the stall frequency is invented, and **I invented the stall/jam split entirely** — you described both but never separated them. _Check:_ whether the CMMS distinguishes equipment faults from material starvation. It probably doesn't, in which case only your memory can separate them.
4. **QA test durations: white 3.5 h, tint 4.0 h, specialty 5.0 h**, LogNormal σ=0.25. Only "about four hours for whites" is yours; the family differences and the spread are invented. _Check:_ lab lead, five minutes.
5. **QA sampling rule: first batch, every third, and always the last.** You said "per some number of batches"; the "always the last" is my inference from your "held up by its last batch". _Check:_ lab lead.
6. **Changeover matrix as tabulated**, both layers. SHEET values are your recollection of a spreadsheet neither of us has seen. _Check:_ open the spreadsheet.
7. **GUT layer: dark→light tint 0.58→1.25 h; tint→white 3.0→3.5 h (3.75 after dark); Line 1 ×1.15 on washdowns.** All your gut, quantified by me. _Check:_ four timestamps on six changeovers — but run `TIME_BASIS` both ways _first_; if it changes no decision, don't bother.
8. **Changeover granularity: whole-line ≥2 h, cascading <1 h.** Unresolved — you were going to watch a rinse. **This materially changes the split-across-lines answer**, because cascading makes changeovers much cheaper for long runs.
9. **Crew is one indivisible 2-person server for all changeovers.** Unresolved — you'd half-noticed them working opposite ends of the line. If rinses can be split, two lines can rinse simultaneously and crew contention drops significantly.

### Policies

1. **Crew priority = Meridian-enabling first, then earliest promise at risk; non-preemptive.** From Scenario A and your follow-up that "Meridian first" is really shorthand for "most urgent first". _Check:_ whether an in-progress changeover has ever been abandoned.
2. **A line missing the crew window waits for the crew's next shift start**, not merely until the crew frees up. From Scenario A. **This is the most punitive mechanism in the model** — it converts a 2-hour changeover into a lost overnight.
3. **Crew flex window (05:00–19:00) requires ≥8 h notice.** Invented; you said flexing is "a normal ask" without saying how much warning it needs. _Check:_ ask the techs. **It directly governs whether an evening washdown happens or waits for morning**, which is the core of your headline decision.
4. **QA jump: front-of-queue, non-preemptive, 0.6 tokens/week, refusal probability 0.15 × jumps-used-this-month.** The 2–3/month is yours; the refusal curve is invented to reproduce the one time you backed off.
5. **Saturday overtime: triggered Wed 17:00, Meridian shortfall ≥1 shift, L1/L2 only, adds no lab or crew hours.** Trigger and timing are yours; **the "no lab cover" assumption is the one I most expect to be wrong in a useful direction.** _Check:_ the ops director question you were going to ask.
6. **End-of-week charge = expected changeover into Monday's first job.** You described the behaviour ("ending clean-ish is a real thing I do"); the accounting is entirely my construct. _Check:_ compare each Friday's finishing family to the following Monday's first job for the last few weeks. Without this the model cheats by leaving every line filthy on Friday.

### Boundary conditions

1. **40 orders/week arriving Sunday 23:00 as a single batch**, of which 6–8 Meridian. Yours. But **arrivals within the week are modelled as zero — nothing arrives mid-week.** Never asked. If urgent mid-week orders exist, they're a major missing disturbance.
2. **Order size distribution: Meridian LogNormal median 7,000 units; others median 2,500.** Derived from "one-third of volume from 6–8 of 40 orders". _Check:_ the ERP pull directly.
3. **Promise dates 4–9 days after book date, uniform.** Pure invention — I never got commercial's padding. **This is the single most load-bearing unknown in the model**, because assumption 5 means idling is only penalised through due-date pressure. Too much padding and the model idles happily and tells you nothing. _Check:_ ERP pull, book-date vs promise-date.
4. **ERP release lag: 24 h before promise date, ±12 h, same for all accounts.** Invented from "can lag by a day or so". **This is the mechanism that creates your headline dilemma**, so it deserves the release-timestamp field you added to the ask.
5. **Breakdowns: major outage 1 per line per 6 months, median 48 h / P90 120 h; bad filler jam 0.5/line-week, median 3 h.** Anchored only to "the mill motor took four days once" and "a bad one every couple of weeks". **Entirely invented rates.** _Check:_ the CMMS export — this is what it's for.
6. **Repairs only progress during manned hours.** Never asked; plausible but could be badly wrong for a contracted motor rebuild.
7. **Simulation starts Monday 06:00 with all lines empty and clean, dressed for white.** Convenient, not real. _Check:_ run a one-week warm-up before scoring, which is what I'd recommend regardless.
8. **No materials constraint.** You said you only watch for red flags. Means the model can never reproduce a resin shortage. _Check:_ how often does a red flag actually stop a run? If more than once a quarter, it needs modelling.

---

# C. WHAT THE MODEL DELIBERATELY LEAVES OUT

**Left out because we ran out of time — these are real gaps, not simplifications:**

1. **Batch contiguity and order splitting.** I never learned whether an order's batches must run contiguously on a line, or whether you can interleave two orders. The model currently assumes **contiguous** — once an order starts on a line, its batches run to completion before another order's batches begin. **This directly limits your run-size question.** The model can compare "whole order on L1" vs "half on L1, half on L2" as two allocations, and will correctly count the extra changeover on both lines — but it cannot represent the finer manoeuvres you might actually use, and if interleaving is possible in reality the model will overstate the cost of splitting. _This is the first thing to fix._

2. **The unwritten rules.** We never covered week-one mistakes, always/nevers, or rules that exist because of one bad incident. In my experience this category produces two or three constraints that invalidate otherwise-attractive schedules — the model will likely propose something that makes you say "we'd never do that," and each time it does, that's an unwritten rule surfacing. **Treat those moments as findings, not bugs**, and send them to me.

3. **All historical data.** Neither the CMMS export nor the ERP order book arrived. Every arrival, promise-date, release-lag and breakdown number is invented (ledger 30–34). **Do not run the model for decisions until at least the order book is loaded** — assumption 32 in particular can make the whole thing tell you a comfortable lie.

**Left out on purpose:**

1. **Materials and the supply chain.** You don't schedule around them, so modelling them would add a large disturbance you don't control and can't act on. Revisit only if red flags stop runs more than rarely (ledger 37).
2. **Individual operators, skills and absence** — except where you named them as a constraint (the changeover crew, the lab, Line 3's qualified operator). Modelling the labour pool properly would double the model's size to answer a question you didn't ask.
3. **Quality failures and rework.** You never mentioned a batch failing QA, only waiting for it. If batches do occasionally fail, that's a missing feedback loop and a significant one — tell me.
4. **Warehouse, truck capacity and logistics beyond the release gate.** Trucks are a fixed daily departure. The one place logistics _does_ bite — the credit/allocation release — is modelled explicitly, because it's your headline lever.
5. **Commercial's promise-date-setting behaviour.** Promise dates are exogenous input. If you later want to ask "should commercial pad more or less," that's a different model with this one inside it.
6. **Cost in dollars.** Everything is denominated in line-hours, because nobody could give me a dollar figure and a fake conversion would only add false precision. If finance produces a rate for changeover hours, the scoring function converts in one line.

---

**If you do three things before the first real run, do these:** load the ERP order book (kills assumptions 31–33, the ones that can make the model lie comfortably); answer the batch-contiguity question in one sentence (unblocks your run-size question); and run `RELEASE_POLICY = STANDING_MERIDIAN` against the default (tests whether your headline dilemma is manufactured upstream of you, which is the cheapest finding available and doesn't need the data at all).

Send me the exports and the answers to the flagged items when you have them, and I'll revise. Thanks — that was an unusually good interview to conduct; the cliff-and-slope answer in particular is the kind of thing most people can't articulate about their own judgement.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

# COATINGS PLANT SCHEDULING MODEL — FINAL DELIVERABLE

Complete and self-contained. Hand Section A to your modelling person; keep Section B for yourself.

---

# A. THE MODEL

A **coloured, timed Petri net with priority-resolved conflicts**. Tokens are _batches_; token colours carry order attributes; transitions are timed; shared resources and calendars are capacity-limited places.

## A.0 Experiment switches

| Switch           | Values                                                                  | Default           | Purpose                                                               |
| ---------------- | ----------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `TIME_BASIS`     | `SHEET` / `GUT`                                                         | `GUT`             | Matrix standard times vs your padding                                 |
| `CO_GRANULARITY` | `WHOLE_LINE` / `CASCADE` / `SPLIT_BY_SIZE`                              | `SPLIT_BY_SIZE`   | Whole-line for washdowns ≥2 h, cascade for rinses <1 h _(unresolved)_ |
| `CREW_MODE`      | `ONE_SERVER` / `SPLIT_ON_RINSE`                                         | `ONE_SERVER`      | Can the two techs run two rinses at once _(unresolved)_               |
| `RELEASE_POLICY` | `TRUCK_CONFIRMED` / `STANDING_MERIDIAN`                                 | `TRUCK_CONFIRMED` | The logistics lever                                                   |
| `SAT_LAB_COVER`  | `OFF` / `ON`                                                            | `OFF`             | Does Saturday OT include a lab analyst                                |
| `SEQ_RULE`       | `CAMPAIGN_FIRST` / `DUE_DATE_FIRST` / `CAMPAIGN_WITH_MERIDIAN_OVERRIDE` | `CAMPAIGN_FIRST`  | Your current policy is default                                        |
| `EOW_CHARGE`     | `ON` / `OFF`                                                            | `ON`              | End-of-week dirty-line charge; OFF lets the model cheat               |

## A.1 Colour sets

```
FAMILY  = { WHITE, TINT, SPECIALTY }
DEPTH   = { NA, LIGHT, DARK }
ACCOUNT = { MERIDIAN, OTHER }
LINE    = { L1, L2, L3 }

SKU     = { skuId, family, depth, meridianQual, l3Qual }
ORDER   = { oid, account, sku, qty, bookTime, releaseTime, promiseTime,
            wholeWeek, line, nBatches }
BATCH   = { oid, idx, of, units, sku, account, promiseTime, testFlag, startedAt }
SETUP   = { line, sku, family, depth }
TECH, ANALYST = unit tokens
```

## A.2 Places

**Order level:** `P_Book` → `P_Allocated` → `P_Releasable` → `P_OrderDone` → `P_Shipped` (all ∞).

**Per line L ∈ {L1,L2,L3}:**

| Place               | Cap                                 |
| ------------------- | ----------------------------------- |
| `P_MixQueue_L`      | ∞                                   |
| `P_Mixing_L`        | 1                                   |
| `P_Tank_MixMill_L`  | TANKCAP                             |
| `P_Milling_L`       | 1                                   |
| `P_Tank_MillFill_L` | **L1 = 1** (your backup), L2/L3 = 2 |
| `P_Tinting_L`       | 1                                   |
| `P_Tank_TintFill_L` | TANKCAP                             |
| `P_Filling_L`       | 1                                   |
| `P_SetupState_L`    | 1 (what the line is dressed for)    |
| `P_LineIdleClean_L` | 1 iff all stages empty              |
| `P_LineUp_L`        | 1 iff not broken down               |
| `P_ShiftOpen_L`     | 1 iff shift manned                  |
| `P_COinProgress_L`  | 1 during whole-line changeover      |

**Shared:** `P_CrewPool` (2 TECH), `P_CrewShift` (1 — its _absence_ is the 2 a.m. black hole), `P_QAHold` (∞), `P_LabAnalysts` (2), `P_LabShift` (1 — its absence is the Friday-evening trap), `P_Testing` (2), `P_QAReleased` (∞), `P_JumpBudget` (0.6 tokens/wk).

## A.3 Transitions

### Arrival and release

| Transition     | Trigger            | Effect                                                                                                                                                  |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T_BookLands`  | Sun 23:00 weekly   | ~40 ORDERs → `P_Book`                                                                                                                                   |
| `T_Allocate`   | Mon 07:00          | Sets `line` (guards below), `nBatches = ceil(qty/VESSEL(line))` → `P_Allocated`                                                                         |
| `T_ERPRelease` | at `releaseTime`   | → `P_Releasable`. **This transition is what creates your idle-vs-washdown dilemma.** Under `STANDING_MERIDIAN`, Meridian releases at allocation instead |
| `T_Explode`    | line queue accepts | Emits `nBatches` BATCH tokens; sets `testFlag`                                                                                                          |

**Hard allocation guards:**

```
account = MERIDIAN      ⇒ line = L2        (audit qualification)
family  = SPECIALTY     ⇒ line = L1        (L2 not piped for clears)
line    = L3            ⇒ sku.l3Qual       (validated-SKU list)
```

### Production (per line, per batch)

Paired `T_Start_<stage>_L` / `T_End_<stage>_L`. Start requires: batch available (per `SEQ_RULE`), stage free, `P_SetupState_L` matches SKU, `P_ShiftOpen_L`, `P_LineUp_L`, no `P_COinProgress_L`.
`T_EndMill_L` **blocks if `P_Tank_MillFill_L` is full** — this reproduces Line 1's mill backup.

**Rates (units/hour):**

| Stage        | WHITE   | TINT | SPECIALTY |
| ------------ | ------- | ---- | --------- |
| Mix (all)    | 3600    | 3600 | 3600      |
| Mill (all)   | 2900    | 1450 | 480 (L1)  |
| Tint/letdown | 12000   | 1450 | 2400      |
| **Fill L1**  | **700** | 700  | 650       |
| **Fill L2**  | **950** | 800  | n/a       |
| **Fill L3**  | **900** | 800  | n/a       |

This reproduces: whites fill-bound, L2 ~35% faster than L1 on whites, **L1 ≈ L2 on tints** (the thing you noticed and couldn't explain), specialty mill-bound.

**Vessels (units/batch):** L1 = 1,100 · L2 = 1,650 · L3 = 1,350 _(the one you said not to quote)_.

**Fill disruption — fat right tail, thin left:**

```
Noise      ~ LogNormal(median 1.00, σ 0.06)
JamAdder   = 0 w.p. .90 ; U(0.33, 0.50) h w.p. .10     (filler jam)
StallAdder = 0 w.p. .95 ; U(0.25, 1.00) h w.p. .05     (packaging/labels)
```

Jams and stalls kept separate — the warehouse restock may be the cheaper fix.

### Changeover

`T_Changeover_L` fires when the next selected batch's SKU ≠ `P_SetupState_L`.

- **WHOLE_LINE** (≥2 h washdowns): requires `P_LineIdleClean_L` (line fully drained) + 2 TECH + `P_CrewShift`.
- **CASCADE** (<1 h rinses): four sub-transitions `T_CO_{Mix,Mill,Tint,Fill}_L`, each needing only its own stage empty and 1–2 TECH per `CREW_MODE`; the new order follows the cleaning down the line.

**Matrix (hours):**

| From → To                            | SHEET    | GUT                        |
| ------------------------------------ | -------- | -------------------------- |
| WHITE → WHITE same SKU               | 0.25     | 0.25                       |
| WHITE → WHITE diff SKU               | 0.42     | 0.42                       |
| WHITE → TINT                         | 0.75     | 0.75                       |
| TINT → TINT (light→light, dark→dark) | 0.58     | 0.58                       |
| TINT → TINT **dark→light**           | 0.58     | **1.25**                   |
| **TINT → WHITE**                     | **3.00** | **3.50** (3.75 after dark) |
| any ↔ SPECIALTY                      | 2.00     | 2.00                       |
| L1 multiplier, changeovers ≥2 h      | 1.00     | **1.15**                   |

**The punitive mechanism:** because changeover needs `P_CrewShift`, a line that misses the crew window waits for the crew's **next shift start**, not for the crew to free up. Your Scenario-A Line 1 loses the whole overnight, not two hours. This emerges from the net structure — no special rule.

### QA

| Transition  | Requires                                   | Duration                                                                            |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `T_Sample`  | batch in `P_QAHold`, ANALYST, `P_LabShift` | WHITE 3.5 h / TINT 4.0 / SPECIALTY 5.0, LogNormal σ 0.25                            |
| `T_Release` | test done                                  | instant                                                                             |
| `T_Jump`    | Meridian-critical + jump token             | Front of queue, **non-preemptive**; `P(refuse) = min(0.8, 0.15 × jumps_this_month)` |

**Sampling:** first batch always, every 3rd thereafter, **last batch always** — this is what makes an order hostage to its last batch.

### Ship, score, break

`T_OrderComplete` (all batches released) → `T_Ship` (at truck departure) → `T_ScoreOrder`.
`T_EndOfWeekCharge` fires Fri 22:00, charging each line for the changeover Monday's first job would need.

| Breakdown                                             | Rate            | Duration                         |
| ----------------------------------------------------- | --------------- | -------------------------------- |
| Major outage (mill-motor class), removes `P_LineUp_L` | 0.038/line-week | LogNormal median 48 h, P90 120 h |
| Bad filler jam, blocks `P_Filling_L`                  | 0.5/line-week   | LogNormal median 3 h, P90 6 h    |

Repair progresses only during manned hours.

## A.4 Calendars

| Gate                | Pattern                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `P_ShiftOpen_L1/L2` | Mon–Fri 06:00–22:00 (handover mid-batch allowed)                                                                   |
| `P_ShiftOpen_L3`    | Mon–Fri 06:00–14:00                                                                                                |
| `P_CrewShift`       | Mon–Fri 07:00–15:30; extends 05:00–19:00 if changeover pre-arranged ≥8 h ahead                                     |
| `P_LabShift`        | Mon–Fri 07:00–17:00                                                                                                |
| Saturday OT         | Adds L1 or L2 Sat 06:00–18:00; requires trigger by Wed 17:00; **adds no lab, no crew** unless `SAT_LAB_COVER = ON` |
| Trucks              | Depart 06:00, Mon–Fri                                                                                              |

## A.5 Policy layer (every rule swappable)

**1 — Crew contention.** Key: `(Meridian-enabling DESC, earliest promise-at-risk ASC)`. **Non-preemptive.** Loser waits for crew _and_ shift.

**2 — Batch sequencing (`SEQ_RULE`).** `CAMPAIGN_FIRST` (yours): group by family; within campaign, earliest promise; break campaign only if a due date would actually be missed. Alternatives: pure due-date; campaign with Meridian override.

**3 — Idle vs washdown** _(your headline decision, implemented literally from Q10)_:

```
IF (wash_away + wash_back) touches ANY Meridian ship window
   THEN idle                                       (* the cliff *)
ELSE IF gap_hours ≥ (wash_away + gap_job_runtime + wash_back)
   THEN take the gap job
ELSE idle
```

**4 — Lab queue.** FIFO, except jump tokens. Displaced work waits, and near week's end may hit the Friday trap — that is the true cost of a jump.

**5 — Saturday ask.** Wed 17:00: if a Meridian order's projected completion misses its window by ≥1 shift, request OT on L1/L2. Non-Meridian shortfalls trigger nothing (your Coastal case).

## A.6 Scoring — unit is one line-hour

```
Changeover      = 1.0 × changeover_hours
Idle            = 0                        (invisible on paper; bites only via the clock)

Meridian late   = 200 (step, on missing the truck) + 1.0 × hours_late
Other late      = 0                     h ≤ 4
                = 0.5 × (h − 4)         4 < h ≤ 24
                = 10 + 4.0 × (h − 24)   h > 24
Whole-week req. = ×2 on the above

End-of-week     = expected changeover hours from each line's Friday state
                  into Monday's likely first job
```

**Board metric reported separately:** binary on-time % vs promise date — so you can tell your boss what the board will say.

_Calibration against your own bets:_ Meridian 6 h late = 206 ≫ 4 changeover-hours → you idle. Coastal 6 h late = 1.0 < 4 → you take the tint job. Coastal 48 h late = 106 ≫ 4 → you don't. Cliff and slope, reproduced.

## A.7 Experiments → your three questions

| Question                                              | Run                                                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _"Line 1's mill motor takes four days — what slips?"_ | Inject 96 h `P_LineUp_L1` outage at various points; compare re-allocation policies. **Watch specialty: it has nowhere to go** (guard: specialty ⇒ L1), so it appears as a hard block, not a delay |
| _"Idle an hour or wash down?"_                        | Sweep Conflict-3 rule × `RELEASE_POLICY`. **Run `STANDING_MERIDIAN` first** — hypothesis is that most of these dilemmas are manufactured by release timing, not by your scheduling                |
| _"Where are my changeover hours going?"_              | Changeover-hours ledger by line × transition × cause; then `SEQ_RULE` sweep; cross with `TIME_BASIS` — if your gut padding changes no decision, don't bother timing changeovers                   |
| _(bonus)_                                             | `SAT_LAB_COVER` OFF vs ON — tests whether this year's Saturdays bought you anything given a shut Monday-ward lab                                                                                  |

**Validation when data lands:** replay 26 weeks; target (a) ~75% utilisation, (b) **30–40 changeover-hours/month** — your ops director's number, the best anchor you gave me — (c) board on-time % matching history. Low changeover-hours ⇒ `CO_GRANULARITY` or sequencing is wrong.

---

# B. ASSUMPTION LEDGER

Mine, not yours. **Bold = load-bearing.**

**Scoring**

1. Lateness in hours vs promise date (board is binary but can't express your cliff/slope). _Check: ERP promise vs ship dates._
2. **Meridian = 200-hour step at "misses the truck", +1.0/h after. I defined the window as truck departure 06:00, not end-of-promise-day.** _Check: one sentence from you — several tight cases flip._
3. Non-Meridian: free <4 h, 0.5/h to 24 h, 4.0/h beyond. Invented shape from your Coastal answer. _Sensitivity-test the kink._
4. Whole-week multiplier ×2. Pure invention.
5. Idle costs zero (your Q8). Makes arrival/due-date realism load-bearing.
6. Changeover = pure lost line time, no wage/solvent. _Check with finance what the 40-hours line item contains._
7. **The 200:4 ratio was reverse-engineered from your two bets, not elicited.** _Check by putting three more of your own bets to it._

**Structure** 8. Four stages, identical topology on all three lines (you walked me through L2 only). 9. **Tank caps: L1 mill→fill = 1 batch, others = 2.** _Check: nameplate ÷ batch size._ 10. Vessels 1,100 / 1,650 / 1,350 — **L3 is the one you said not to quote.** _Check: 30 seconds at the vessel._ 11. 14 SKUs as 4 white / 8 tint / 2 specialty, tint depths assigned arbitrarily. _Check: SKU master — also tells me which tints are dark._ 12. L3's two unqualified tint SKUs — your count, my choice of which. _Check: quality's validation list._ 13. **Specialty on L1 only. I never asked whether L3 can run specialty — if it can, the mill-motor answer changes materially.** 14. Meridian ⇒ L2 is absolute, no emergency override. _Check: has it ever been broken?_

**Durations** 15. **Stage rates reconstructed from your estimates. The pattern is yours; the numbers are mine.** _Check: the sheet's units/hour per product per line — direct calibration, you already have it._ 16. Mix time identical across families/lines. Never asked; probably wrong for specialty. 17. **The jam/stall split is entirely my decomposition** (you described both, never separated them); stall frequency invented. _Check: whether CMMS distinguishes faults from material starvation — it probably doesn't._ 18. QA 3.5/4.0/5.0 h by family, σ 0.25 — only "about four hours for whites" is yours. _Check: lab lead, 5 min._ 19. Sampling = first, every 3rd, **always last** (my inference from "held up by its last batch"). 20. SHEET matrix = your recollection of a spreadsheet neither of us has opened. _Check: open it._ 21. GUT layer quantified by me from your instincts. _Check: time six changeovers — but run `TIME_BASIS` both ways first; if nothing changes, don't bother._ 22. **`CO_GRANULARITY` unresolved — you were going to watch a rinse. This materially changes the split-across-lines answer.** 23. **`CREW_MODE` unresolved — you'd half-noticed the techs working opposite ends. If rinses split, crew contention drops significantly.**

**Policies** 24. Crew key = Meridian-enabling, then earliest at risk; non-preemptive. _Check: has an in-progress changeover ever been abandoned?_ 25. **A line missing the crew window waits for next shift start. Most punitive mechanism in the model — it turns a 2 h changeover into a lost overnight.** 26. **Crew flex needs ≥8 h notice — invented. Directly governs whether an evening washdown happens or waits for morning, i.e. the core of your headline decision.** _Check: ask the techs._ 27. Jump budget 0.6/wk with rising refusal — 2–3/month is yours, the refusal curve is invented to reproduce the one time you backed off. 28. **Saturday OT adds line hours only, no lab, no crew. The assumption I most expect to be wrong in a useful direction.** _Check: the ops director question._ 29. **End-of-week charge is my accounting construct** for behaviour you described. _Check: compare Friday's finishing family to Monday's first job over recent weeks._ Without it the model cheats by leaving every line filthy on Friday.

**Boundary conditions** 30. **40 orders arrive Sunday 23:00 in one batch; nothing arrives mid-week.** Never asked. If urgent mid-week orders exist, that's a major missing disturbance. 31. Order sizes: Meridian median 7,000 units, others 2,500 — derived from your one-third-of-volume figure. _Check: ERP directly._ 32. **Promise dates 4–9 days after book date, uniform — pure invention, and the single most load-bearing unknown.** Because idle is only penalised via due-date pressure, too much padding makes the model idle happily and tell you nothing. _Check: ERP book-date vs promise-date._ 33. **ERP release lag 24 h ± 12 h before promise, same for all accounts — invented, and it's the mechanism that creates your headline dilemma.** _Check: the release-timestamp field you added to the ask._ 34. **Breakdown rates entirely invented**, anchored only to "the motor took four days once" and "a bad one every couple of weeks." _Check: the CMMS export — this is what it's for._ 35. Repairs progress only in manned hours. Never asked; could be wrong for a contracted rebuild. 36. Starts Monday 06:00, all lines empty, clean, dressed for white. _Use a one-week warm-up before scoring regardless._ 37. No materials constraint (you only watch for red flags). _Check: if red flags stop runs more than quarterly, this needs modelling._

---

# C. WHAT THE MODEL LEAVES OUT

**Gaps from stopping early — real, not simplifications:**

1. **Batch contiguity / order splitting.** The model assumes an order's batches run **contiguously** on a line. It can compare "whole order on L1" vs "split across L1 and L2" and will correctly charge the extra changeover on both — but it can't represent interleaving. **If interleaving is possible in reality, the model overstates the cost of splitting, which is exactly your run-size question.** _Fix this first — it's one sentence from you._

2. **The unwritten rules.** Never covered. Expect the model to propose schedules that make you say "we'd never do that." **Treat each of those as a finding, not a bug** — that's an unwritten rule surfacing.

3. **All historical data.** Neither export arrived. Every arrival, promise date, release lag and breakdown figure is invented (30–34). **Don't make decisions on the model until at least the order book is loaded** — assumption 32 can make it tell you a comfortable lie.

**Deliberate exclusions:**

1. **Materials/supply chain** — you don't schedule around them; modelling them adds noise you can't act on.
2. **Individual operators, skills, absence** — except where you named them as constraints (crew, lab, L3's qualified operator). Modelling the labour pool would double the size to answer a question you didn't ask.
3. **Quality failures and rework** — you never mentioned a batch _failing_ QA, only waiting for it. If they do fail, that's a missing feedback loop and a significant one.
4. **Warehouse and truck capacity** — trucks are a fixed daily departure. The one place logistics bites, the release gate, _is_ modelled, because it's your headline lever.
5. **Commercial's promise-date behaviour** — exogenous. "Should commercial pad more or less" is a different model with this one inside it.
6. **Dollars** — everything is in line-hours, because nobody could give a dollar figure and a fake conversion adds only false precision. One line converts it if finance produces a rate.

---

**Three things before your first real run:**

1. **Load the ERP order book** — kills assumptions 31–33, the ones that can make the model lie comfortably.
2. **Answer batch contiguity in one sentence** — unblocks the run-size question.
3. **Run `RELEASE_POLICY = STANDING_MERIDIAN` against the default** — tests whether your headline dilemma is manufactured upstream of you. It's the cheapest finding available and needs no data at all.

Send the exports and the flagged answers whenever you have them and I'll revise. Good luck with it.
