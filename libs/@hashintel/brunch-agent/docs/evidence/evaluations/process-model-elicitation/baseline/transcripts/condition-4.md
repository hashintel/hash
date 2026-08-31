# Baseline control — condition 4 (rendered repertoire + plugin definition, prompt only)

- Run started: 2026-08-26T15:00:21.375Z
- Interviewer: claude-opus-5 + condition-4-prompt.md + rendered repertoire.yaml + plugin-sdcpn/plugin.yaml (see condition-4-system.md)
- Simulated expert: claude-sonnet-5 + situation-pack.md
- Interviewer turns: 24 (impatience probe at 8, forced wrap at 20)
- Stop reason: hard-stop
- Tokens: 1006344 in (+0 cache write, +0 cache read) / 57851 out across 67 calls

---
**Opening message**:

I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

---

**Interviewer**:

Good — that's enough for me to know what I'm building toward. I'll interview you in your own words about how the plant actually runs, keep a running note of what I've got and what I still need, and hand you back a structured model at the end. I won't invent numbers; anything I have to assume I'll list separately so you can check it.

Let me start with what the model is *for*, because everything else gets prioritised against that.

**When your boss says "test scheduling decisions before making them" — what's a decision you've actually had to make recently where you'd have wanted to try it in a model first?** Tell me the specific situation if you can.

And alongside that: **when a schedule turns out to have been a bad one, how do you find out — what's the thing that goes wrong that you notice?**

---

**Expert (Marta)**:

Okay, good question. Let me think of a real one.

A couple weeks back Line 1's mill motor hiccuped — not the four-day disaster, just a few hours down — right when I had a specialty batch and a Meridian white order both needing to move. I had to decide on the spot whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2 instead. I did it by gut at the huddle — moved the specialty, kept the white going — but I genuinely don't know if that was the right call or if I just got lucky. That's the kind of thing I'd love to run twice and see which one bites me less.

The other recurring one is the idle-line-versus-washdown thing — do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now. I make that call almost weekly and it's pure feel.

As for how I find out a schedule was bad — honestly, it's usually the huddle two days later, or a call from Meridian's account rep. Late orders are the loudest signal — someone above me hears about it before I do sometimes. Quieter version is the changeover crew looking wrecked by Thursday because I stacked too many family switches back to back. And every so often quality flags a scrap spike and I go "oh, right, that was the week I rushed the ramp after a washdown."

---

**Interviewer**:

That's exactly the right kind of answer — two concrete recurring decisions, and three different ways badness shows up.

Let me pin the purpose down before I ask about the plant itself.

1. I'm hearing **two questions the model must answer**: *"when a line goes down mid-run, do I reroute the affected job to another line and eat requalification, or hold it and let something else slip?"* and *"do I hold a line idle waiting for a same-family order, or pay the washdown now?"* Is that a fair statement of both, in your words? And is there a third recurring call of that type that you'd want to test — anything around sequencing, or order acceptance, or overtime?

2. You said you'd want to see "which one bites me less." If I ran both versions of that Line 1 decision and handed you two sets of results — **what would you look at to say one was better?** Late orders, scrap, crew load, something else — and if one option gave you one late order and the other gave you a scrap spike, do you already know which way you'd lean, or does that depend?

3. **How far ahead do you schedule, and at what resolution?** I want to know whether the model needs to be useful over a shift, a week, or a quarter.

---

**Expert (Marta)**:

Let me take those one at a time.

**On the two decisions** — yes, that's fair, that's the two big ones. A third I'd add: **run-size / sequencing** — whether to split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one of them ships a bit early and sits in the warehouse. I do that juggling every week on the sheet and I've never had a way to check if I'm leaving hours on the table.

I wouldn't say overtime approval is mine to test — that's the ops director's call, though I do feed him the "we'll miss X without it" argument, so maybe that's a variant of the same question rather than a fourth one.

**On what I'd look at to judge the two options** — first thing, always, is: did anything ship late, and to whom. A late order to Meridian is worse than three late orders to a small distributor, so it's not just a count, it matters *who*. After that, changeover hours lost and scrap. If one path gives me a late Meridian order and the other gives me a scrap spike — I'll take the scrap spike every time, no contest. Scrap costs money, a late Meridian order costs a relationship and a fine. So there is a rough pecking order in my head, I just don't have it written down as numbers — that's the bit I said I'd need to sit down with commercial for.

**On horizon** — the sheet is a rolling weekly thing, built fresh every Monday against that week's demand book, but I'm constantly re-juggling it day to day as breakdowns and rush orders land. So really it needs to be useful at two grains: a full week, so I can see the whole book, but responsive enough to redo at shift-level when something breaks at 6am. A quarter's too far out — I don't plan that far, ERP just doesn't give me visibility past a few weeks anyway.

---

**Interviewer**:

Good. I've got three objectives now, a rough pecking order (late Meridian ≫ late small distributor > changeover hours ≈ scrap; and scrap spike beats a late Meridian order every time), and a two-grain horizon — a full week, re-runnable at shift level. The exchange rate in numbers is parked as needing commercial; I'll flag it rather than invent it.

Two more framing questions and then I want you to walk me through an actual order.

1. **What's inside the model and what's outside?** Specifically: does it start when an order lands in your demand book, or earlier? Does it end when the batch is filled off the line, or does it follow through QC, packing, warehouse, shipping? And is raw material supply something you ever wait on, or is it always just there?

2. **The accuracy bar.** If I gave you the model loaded with last week's demand book and it produced a schedule, **what would you look at to decide "yes, that's basically our plant" versus "no, that's a toy"?** Is there a week you could replay from memory or from the sheet?

---

**Expert (Marta)**:

**On scope:**

Starting point — order lands in the demand book, that's the natural start, ERP hands it to me and it becomes a line on my sheet. I don't need the model reasoning about how orders get generated upstream, sales does whatever it does.

End point — I'd say it ends when the batch clears QC hold and is released to the warehouse. What happens after that — trucks, warehouse slotting — isn't my problem, that's logistics' sheet, not mine. But QC hold has to be in there, because that four-hours-typical wait genuinely ties up my thinking about whether an order will make its due date, especially for specialty where it can be a full day. If a model ignored QC hold it would look like orders finish the moment they're filled, and that's just wrong — I've had orders filled on time and *still* gone late because the lab backed up on a Friday.

Materials — mostly it's just there, I don't sit and calculate feedstock. But it's not *never* an issue — resin slips maybe once a month and when it does it stalls the run and I have to shuffle around it. So I'd say: outside the model most of the time, but there needs to be some way for "oh, the resin didn't show up" to occasionally throw a wrench in, otherwise you're modelling a plant that never has a bad Tuesday.

**On the accuracy bar:**

Honestly, the first thing I'd check is boring but telling: does it get the *unwritten rules* right — does Meridian white actually land on Line 2, does it never send specialty to Line 2, does it respect that Line 3 isn't qualified for those two tint SKUs. If it violates any of that, I'll dismiss it in about ten seconds, doesn't matter how clever the maths is.

Second — does the changeover pattern look like our week, not a fantasy week. If it shows tint-to-white as quick and white-to-tint as the long one, I'll know someone got the plant backwards.

Third, and this is the real test — I could take last week's actual book, run it through, and see whether the late orders it predicts are roughly the ones that *actually* went late. I remember last week pretty well: we had a Meridian order squeak through by a few hours, and a distributor order slid four days with a phone call and nobody blinked. If the model's version of last week says something wildly different — says Meridian went late, say, or doesn't flag the Line 1 tank issue that actually bit us — I'd say it's a toy. I can probably reconstruct two or three weeks like that from memory and the sheet if you want a real test case.

---

**Interviewer**:

That accuracy bar is unusually useful — the unwritten rules first, then the changeover asymmetry, then a replay of last week. I'm noting all three as the acceptance test, and I'm noting the direction-dependence you just gave away: **tint→white quick, white→tint long**. I'll come back and check I've got that the right way round.

Now let me walk one real case end to end.

1. First, so I follow the right thing: **what's "one" for you — an order, a batch, a run?** If a customer order can be split across two runs, or several orders can go down as one run, I need to know which unit you actually track on the sheet.

2. Then: **take that Meridian white order from last week — the one that squeaked through — and walk me through it.** From the moment it lands in your book to the moment it's released to the warehouse. Just tell it as it happened, including the boring steps; I'll stop you where I need detail.

---

**Expert (Marta)**:

Ha — good catch, let me actually correct myself before we go further: I said it that way round out of habit, but hang on, let me think it through properly. Pigment carryover into a white is the disaster — a speck of tint ruins a batch of white. So it's **white → tint that's the quick one** (a bit of white residue in a tinted batch, who cares, it's getting colour anyway) and **tint → white that needs the full three-hour washdown**, because you cannot have any tint carryover into white. I had it backwards just now. Sorry — glad you flagged it instead of writing it down.

**On the unit:** the sheet tracks at the **run** level, not the order. An order is a line in the demand book — SKU, quantity, due date — but what actually sits on the sheet as a block of time on a line is a run, and a run can be one order's worth or several small orders of the same SKU lumped together to clear the minimum-run-size bar. Occasionally a big order gets split into two runs if I need to interleave a rush job — that's the sequencing juggling I mentioned. So: orders are what demand gives me, runs are what I actually schedule, and I'm the one deciding the mapping between them week to week.

**Walking the Meridian order:**

It landed in Monday's demand book — a decent-sized white order, due Friday close of business, which for Meridian really means Friday, no wiggle. I put it on Line 2, because Meridian white always goes there. On the sheet I slotted it Wednesday, because Line 2 had a tint run booked Tuesday and I didn't want back-to-back — tint before white means I'm looking at the long washdown, and I wanted that overnight rather than eating into the day.

Tuesday afternoon the tint run overran a bit — nothing dramatic, maybe an hour past what the sheet said — so the crew didn't get the washdown started until early evening instead of mid-afternoon. That's a three-hour job, so it ran into the night shift. Wednesday morning, line's clean, but we lost the ramp-up scrap at start of shift, and then the filler jammed for about forty minutes mid-morning — one of the routine jams, nothing scary. So the run itself finished later Wednesday than planned.

It went to QC hold Wednesday evening. Normally that's four-ish hours and it'd be released overnight, but the lab had a backlog from earlier in the week, so it didn't actually get signed off until Thursday midday. Released to the warehouse Thursday afternoon — comfortably ahead of the Friday deadline in the end, but it "squeaked" in my head because if the filler jam had been the four-hour kind instead of the forty-minute kind, or if QC's Thursday had been as backed up as Friday usually is, it wouldn't have made it.

---

**Interviewer**:

Thank you for correcting the direction — tint→white is the three-hour washdown, white→tint is the quick one. That's now recorded that way round, and I've thrown away my earlier note.

That walkthrough gave me the spine. Let me fill in the machinery inside it — three related things:

1. **Within a run, does your sheet treat it as one block of time on the line, or are there distinct stages you track separately?** You mentioned a mill motor and a filler, which sounds like at least two things happening — is making the batch and filling it one continuous occupation of the line, or can one order be mixing while a different one is filling?

2. **Who does the washdown?** Is there a dedicated changeover crew, how many of them, and can two lines be washing at the same time — or does one line's washdown block another's?

3. **The QC lab** — is it one lab serving all three lines? Can it work on several batches at once, or is it one at a time, and is it staffed around the clock or only on shifts?

---

**Expert (Marta)**:

Good questions, and honestly the answers get at things I only half-think about because the sheet flattens them.

**1. Within a run:** On the sheet it's one block of time — I put down "Meridian order, Line 2, Wed 06:00–18:00" and that's it, I don't sub-divide it. But physically, no, it's not one continuous thing happening in one spot. There's mix, then mill, then tint/letdown, then fill — four stages, and they're at different points on the line with small holding tanks between them. So in principle, while the back end of a batch is filling, the front end of the *next* batch could already be mixing, if there's product to feed it — it's a bit of a flow, not a single monolithic block. My sheet doesn't capture that at all, it just says "Line 2 busy 06:00–18:00" and moves on. Whether that's actually true — whether the line is fully occupied that whole window or there's slack — I genuinely couldn't tell you without going and watching it, which is part of why I said the sheet flatters reality.

The tanks between stages are exactly why I keep grumbling about Line 1's mill-to-fill tank — if fill is slow and the tank's small, mill has to stop and wait, and that's dead time my sheet never sees.

**2. The changeover crew:** One crew, two techs, day shift, covers all three lines. So no, two lines can't wash down at once — if Line 1 and Line 3 both want a washdown Tuesday morning, one of them waits its turn. That's the thing I mentioned with Line 3 sitting clean but idle waiting on the crew — it happens more than I'd like. Outside day shift, if a changeover's needed on night shift... honestly that's rare, we try to schedule washdowns for when the crew's on, but I couldn't tell you what happens if one gets forced onto nights. Might be we call someone in. Might be it waits till morning. I'd have to check with the crew lead.

**3. QC lab:** One lab, serves all three lines, two people. I don't know the mechanics of whether they can run two batches' tests in parallel or whether it's strictly one-at-a-time per person — I just know that by Thursday/Friday there's a queue and things that should take four hours take longer. They're day-shift as far as I know, maybe with someone covering into evening, but I don't think there's a night presence. That's another one I'm going on impression, not fact — worth you asking them directly if it matters to the model.

---

**Interviewer**:

Two deposits noted, both yours to check later: (a) what happens when a washdown is forced onto night shift — crew lead; (b) whether the lab runs batches in parallel and how far into the evening they cover — lab. I'll model something provisional and flag it.

Now the thing you said you'd dismiss the model in ten seconds over: the lines and what may run where.

1. **Give me the three lines and what distinguishes them** — capacity or speed, what each is qualified for, what physically differs. You've mentioned Line 1's mill motor and its small mill-to-fill tank, Line 2 as Meridian white's home, Line 3 as not qualified for two tint SKUs.

2. **Give me the product families as you'd group them for scheduling.** You've said white, tint, specialty — is that the right cut, and are there others? What makes two things "same family" for the purposes of "I could run these back to back without a washdown"?

3. **"Meridian white always goes on Line 2"** — is that a hard qualification, a customer requirement, or a habit? I want to know whether the model should treat it as a rule that can never break, or one you'd break under pressure.

---

**Expert (Marta)**:

**1. The three lines:**

- **Line 1** — the old workhorse. Slower overall, but the most flexible: it's qualified for everything, whites, tints, specialty, all of it. It's the one you send something to when nowhere else can take it. Its weak point is the mill-to-fill tank being small — if fill lags, mill backs up and stalls. Also home to the scary mill motor that occasionally takes days to fix.
- **Line 2** — the fast line. Built for volume. Roughly twice Line 1's speed on whites, though — and I only realised this when you pushed me on it earlier — that gap seems to shrink for tints, I don't actually know why. Not piped for the clear specialty resins at all, so specialty simply cannot run there, full stop, that's physical not a preference.
- **Line 3** — newest, quick, but still being qualified SKU by SKU. Two tint SKUs specifically aren't signed off yet — I couldn't tell you technically why, that's a QA/engineering decision from before my time on this role, I just know not to put them there.

**2. Product families:**

Whites, tints, specialty — that's the cut I use, and it's really about what a washdown has to deal with, not the product itself. "Same family, no washdown" for whites means any white after any white is just a quick rinse. Same for tint-after-tint, more or less, though I think some tint-to-tint switches (light to light) are gentler than others (light to dark, or vice versa) — I've never separated that out on the sheet, it's all just "tint changeover, 20–30 min" to me, but I wouldn't swear every tint-to-tint pair is really equal.

**3. Meridian white on Line 2:**

It's not written down anywhere as a hard qualification like the specialty-can't-run-on-Line-2 thing. It's a habit that calcified into a rule — Line 2's fill area got audited by Meridian's people years back for a supplier qualification, and ever since, if a Meridian order ran anywhere else, and they ever found out, it'd be a whole conversation nobody wants to have. So it's soft in the sense that physically Line 1 could make that batch. But in practice I have never once put a Meridian order on Line 1, even under real pressure — the one time Line 2 was going to be down most of a day, I held the order and let it run late-ish rather than move it, because breaking that rule felt riskier than a few hours' delay. So: treat it as effectively hard. If the model wants to explore breaking it, that's a "what if" experiment, not something I'd sanction as a live scheduling option.

---

**Interviewer**:

Good — and I'll record the Meridian rule as effectively hard, breakable only as an explicit what-if.

Now durations, which I need as ranges rather than single figures. Before I ask for numbers:

1. **Is a run's length driven mainly by the quantity ordered, or do runs come in fairly standard sizes?** I want to know whether to ask you "how fast is Line 2 in litres per hour" or "how long is a typical white run on Line 2."

2. Whichever way you answer — **for the decisions you care about, is it the typical run length that matters, or the bad one?** You said the Meridian order "squeaked" because a jam could have been the four-hour kind. That suggests the tail is what bites you. Is that generally true?

3. And a nag from your last answer: **you said Line 2 is roughly twice Line 1's speed on whites but the gap seems to shrink for tints.** Is there anyone who'd know why, or a place that would show it? I don't want to write "twice as fast" across the board if it's only true for whites.

---

**Expert (Marta)**:

**1. Quantity vs. standard size:** It's driven by quantity, not standard batch sizes — the demand book gives me an order quantity in whatever units (drums, usually, sometimes bulk litres for the big Meridian stuff), and I convert that to run length using the rate for that product on that line. So it really is "quantity divided by rate, plus fill-up time" — which is why I'd answer "how fast is Line 2" more naturally than "how long is a typical run," except that in conversation I usually think in run-hours because that's what goes on the sheet. If you want the raw rate, I'd have to go dig for it — I keep the sheet in run-hours already converted.

**2. Typical vs. tail:** Yeah, you've got it right. For deciding *how much to promise* — whether an order fits in the week — I use typical, because if I planned for worst-case every time I'd never fit anything on the sheet and everyone would think I was hoarding capacity. But for deciding whether something's actually going to be *late*, it's always the tail that gets me: the jam that runs long, the washdown that overruns, the QC backlog on a Friday. The plan is built on typical; the disasters come from the tail. So if the model's going to be useful for the "will this ship on time" question, it needs the tail, not just an average — that Meridian order was fine on a typical week and nearly wasn't.

**3. The Line 2 speed gap:** Honestly, no, I don't have a good answer, and I said "funny, never thought about why" earlier because I meant it — I've just always used "2x on whites" as my mental shorthand and never checked whether it holds for tints because tints don't move through Line 2 as often. If I had to guess who'd know, it'd be **process engineering** — they set the line rates originally and would know if something about tint viscosity or the letdown stage behaves differently machine to machine. Or possibly it's sitting in the historian data if someone actually pulled cycle times apart by product and stage, which — as I said — nobody's done. I wouldn't trust my own instinct on this one; flag it as something to verify, don't take "twice as fast" as gospel outside whites.

---

**Interviewer**:

Understood — I'll carry "2× on whites, unverified for tints" as a flagged assumption with process engineering as the source to check.

Now let me get actual numbers. You think in run-hours, so let's use those, and I'll ask each one as a low/high first, then typical.

Think of a **white run on Line 2 of the size you'd typically see in the book** — say a Meridian-sized one like last week's:

1. **What's the shortest and longest that run could plausibly take, from starting the line to the last drum filled?** Then: what's the typical? I'm after the whole occupation of the line, including the ramp-up scrap period you mentioned, but *not* including the washdown before it or QC after.

2. **Roughly how many run-hours does a typical week's book add up to across all three lines** — and how many hours of line time do you actually have in a week? I want to know how tight you normally are, because that tells me how much the tails actually matter.

---

**Expert (Marta)**:

Okay, let's do the Meridian-sized white run on Line 2 first.

**1. Run duration:** On a good day, that size order — call it the volume that took roughly a shift and a half on the sheet — runs about **10-11 hours** if nothing goes wrong, that's the number that's actually on the sheet for it. Shortest it's ever been, maybe 9 hours if the line just behaves and there's no jam at all — line's fast, it doesn't take much to knock a few hours off. Longest — if the filler has one of its worse jams, or there's more than one, I've seen that same-sized run stretch to 16, 18 hours. I did have one, maybe a year ago, that went nearly 24 because we had a jam *and* a short material stall on top of it, but I'd call that a genuine outlier, not "the bad day," more "the terrible day." So: typical **10-11**, shortest realistically **9**, and a bad-but-not-freak day is more like **14-16**. The 24-hour one I'd treat as a once-a-year tail, not the normal worst case.

**2. Weekly book vs weekly capacity:** This one I can give you better because it's exactly the tension I live with every Monday. A typical week's book runs somewhere around **380-420 run-hours** total demand across the three lines, once I've converted everything. Capacity — Line 1 and Line 2 both run two shifts, so each is about 112 hours a week if fully utilised (16 hours a day times 7, though we don't always run weekends flat out — more like five and a half, six days realistically). Line 3's day-shift-only unless overtime's approved, so call it 56 hours normally. So total available is somewhere in the **270-300 run-hour** range in a normal week if I'm honest about weekends, versus a book that wants 380-420.

Which tells you immediately: I am *always* over capacity on paper, which is exactly why changeover hours and scrap matter so much — every hour lost to a washdown or a jam is an hour I don't have to spare, and why late orders happen at all. It's also why weekend and overtime running is a live lever, not a nice-to-have — Line 3 running an extra day, or Line 1/2 pushing into Sunday, is often the difference between the week working or not.

(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)

---

**Interviewer**:

Ten minutes is useful — let me name what's still missing so you can choose, rather than pretend we're done.

**Still open and load-bearing:**
- **How often things go wrong** — I have durations for the filler jam, mill motor, resin slip, QC backlog, but almost no *rates*. You told me the tail is what makes orders late; without frequencies I can't produce tails.
- **The two decision rules as you actually practice them** — the reroute-vs-hold rule and the idle-vs-washdown rule. I have the situations, not the rule you apply.
- **Requalification** — "eat the requalification headache" is a cost I have no size for.
- **How orders arrive** — rush orders, due-date patterns, which customers are Meridian-tier.
- Run rates for Lines 1 and 3, and washdowns involving specialty.

If I get one thing now, I'd take the frequencies, because they're quick and nothing else substitutes for them. Three, same frame:

1. **In a typical week, how many filler jams do you get across the plant** — and roughly what's the split between the forty-minute kind and the four-hour kind?
2. **How often does Line 1's mill motor take the line down** — the multi-day sort, not the few-hour hiccup? Once a quarter, twice a year?
3. **How often is QC actually backed up** enough that a four-hour hold becomes a day-plus — is it genuinely a Friday thing, or any day?

Answer what you can in the time; then tell me when we can pick up the rest.

---

**Expert (Marta)**:

Quick ones, then I have to run.

1. **Filler jams:** Most weeks, one or two. Almost all of them are the short kind, half hour to an hour, that's the bulk of them — I'd say four out of five. The multi-hour kind, the real headache, is more like once a month, maybe every six weeks. It's Line 2's filler mostly, that's the one I'd flag as jam-prone.

2. **Mill motor, the multi-day sort:** Rare — I've seen it maybe three, four times in the years I've been doing this job. So call it once, maybe twice a year. When it happens it's ugly, but it's genuinely not a weekly worry the way the filler is.

3. **QC backlog:** Mostly a Friday thing, yes — book's heaviest early week, orders queue up at the lab by Thursday/Friday, so nine times out of ten if I'm going to see a hold stretch past a day it's end of week. Early week it's rare, maybe one bad Monday or Tuesday a month if something upstream bunched up.

That's what I've got off the top of my head — day-to-day impression, not a logged rate, so treat it as roughly-right rather than exact.

I've got to get to the huddle — same time tomorrow, or whenever suits you, we can pick up the decision rules and the requalification cost. That's probably the meatier half anyway.

---

**Interviewer**:

Understood — go to your huddle. I won't open anything new. Here's where we got to, read back so you can correct it, plus exactly what I'll ask tomorrow.

**Stopping outcome: `expert-stopped` — partial model with open slots.** The structural floor is met (objectives, entity types, activities, flow all present), but none of the three objectives has a complete dependency slice yet. The biggest holes are the two decision rules themselves — which is the meatiest half, as you said.

---

# 1. The model as it stands

Every value below is at the grade you actually gave it. Where I asked interval-first (low/high, then typical) I've said so.

## Objectives

| ID | The question, in your words | Depends on | "Better" |
|---|---|---|---|
| **OBJ-1 Reroute or hold** | *"whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2"* — run it twice and see which one bites me less | ET-Line, ET-Order, A-Mill-motor-failure, A-Requalification, POL-Reroute-or-hold, C-Line-qualifications, POL-Meridian-Line-2 | Ranked, not numeric — see below |
| **OBJ-2 Idle or washdown** | *"do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now"* — a call *"almost weekly and it's pure feel"* | A-Washdown-tint-to-white, A-Ramp-up-scrap, ET-Changeover-crew, POL-Idle-vs-washdown, BC-Demand-book | Ranked, not numeric |
| **OBJ-3 Run size & sequencing** | *"whether to split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one of them ships a bit early and sits in the warehouse"* — *"I've never had a way to check if I'm leaving hours on the table"* | OF-Order-to-run-mapping, C-Minimum-run-size, A-Washdown-*, A-Ramp-up-scrap, BC-Demand-book | Ranked, not numeric |

Noted but **not** an objective you own: overtime approval — *"that's the ops director's call, though I do feed him the 'we'll miss X without it' argument… maybe that's a variant of the same question rather than a fourth one."*

**What "better" means** — grade: *spelled out as a ranking, numeric weights absent.*
1. Did anything ship late, **and to whom** — *"a late order to Meridian is worse than three late orders to a small distributor, so it's not just a count, it matters who."*
2. Changeover hours lost.
3. Scrap.
- Stated trade: *"a late Meridian order and… a scrap spike — I'll take the scrap spike every time, no contest. Scrap costs money, a late Meridian order costs a relationship and a fine."*
- Exchange rate in currency: **open**, deposit = *"sit down with commercial."*

**Horizon** (grade: spelled out): rolling week built fresh Monday against that week's demand book, re-runnable at shift grain when something breaks at 6am. *"A quarter's too far out."*

**Boundary** (grade: spelled out): starts when an order lands in the demand book from ERP; ends when the batch **clears QC hold and is released to the warehouse**. Trucks/warehouse slotting excluded (*"logistics' sheet, not mine"*). QC hold is explicitly **in** scope — *"I've had orders filled on time and still gone late because the lab backed up on a Friday."* Feedstock excluded except that resin slips must be representable — *"otherwise you're modelling a plant that never has a bad Tuesday."*

## Validation criteria

| ID | Criterion | Grade |
|---|---|---|
| VC-1 | The unwritten rules hold: Meridian white lands on Line 2; specialty never on Line 2; Line 3 never gets the two unqualified tint SKUs. *"If it violates any of that, I'll dismiss it in about ten seconds."* | spelled out |
| VC-2 | Changeover asymmetry the right way round: **tint→white is the long one, white→tint is quick.** *"If it shows tint-to-white as quick… someone got the plant backwards."* | spelled out |
| VC-3 | Replay last week's book; predicted late orders roughly match actual — Meridian squeaked through by a few hours, a distributor order slid four days with a phone call and nobody blinked, and the Line 1 tank issue bit us. You can reconstruct two or three such weeks. | spelled out |

## Entity types

| ID | Type | Distinctions that matter | State it carries | How many |
|---|---|---|---|---|
| ET-1 | **Order** (a line in the demand book) | SKU; quantity (drums, or bulk litres for big Meridian); due date; customer — Meridian-tier vs small distributor | family (white / tint / specialty); due date hardness | ~380–420 run-hours of demand per week *(range)* |
| ET-2 | **Run** (a block on the sheet) | the unit you actually schedule; one order's worth, or several small same-SKU orders lumped to clear minimum run size; a big order can be split into two runs | line assignment; family; scheduled window | derived from ET-1 by your weekly mapping |
| ET-3 | **Line** | see below | current/last family (sets changeover); qualification set; up/down | 3 |
| ET-4 | **Changeover crew** | one crew, two techs, day shift, all three lines | busy/free | 1 crew *(contended)* |
| ET-5 | **QC lab** | one lab, two people, all three lines | queue depth | 1 lab, 2 people *(contended; parallelism unknown)* |
| ET-6 | **Stage within a line** | mix → mill → tint/letdown → fill, with small holding tanks between | tank level (see D-1) | 4 stages per line |

**The three lines** (grade: spelled out qualitatively; rates only partly numeric)

- **Line 1** — *"the old workhorse… slower overall, but the most flexible: qualified for everything."* The one you send something to when nowhere else can take it. Weak point: small mill-to-fill tank — if fill lags, mill backs up and stalls. Home of the mill motor. Two shifts.
- **Line 2** — *"the fast line. Built for volume."* Roughly 2× Line 1 on whites; **that gap "seems to shrink for tints" and you explicitly asked me not to take 2× as gospel outside whites.** Not piped for clear specialty resins — *"specialty simply cannot run there, full stop, that's physical not a preference."* Jam-prone filler. Two shifts.
- **Line 3** — *"newest, quick, but still being qualified SKU by SKU."* Two tint SKUs not signed off. Day shift only unless overtime approved.

**Families** (grade: spelled out, with a flagged sub-distinction): whites / tints / specialty — *"it's really about what a washdown has to deal with, not the product itself."* Caveat you gave: *"I wouldn't swear every tint-to-tint pair is really equal"* — light-to-light may be gentler than light-to-dark. Never separated on the sheet.

## Boundary conditions

| ID | What | Value | Grade |
|---|---|---|---|
| BC-1 | Demand book | Built fresh Monday from ERP; ~380–420 run-hours/week; rush orders land mid-week | range for volume; **arrival shape for rush orders open** |
| BC-2 | Line calendar | L1 & L2 two shifts = 16h/day nominal ≈ 112h/wk, *"though we don't always run weekends flat out — more like five and a half, six days realistically"*; L3 day shift ≈ 56h unless OT. Total realistic **270–300 run-hours** | range |
| BC-3 | Changeover crew calendar | Day shift only. Night behaviour: **unknown** — *"Might be we call someone in. Might be it waits till morning."* | open, deposit = crew lead |
| BC-4 | QC lab calendar | Day shift, *"maybe with someone covering into evening,"* believed no night presence — *"impression, not fact"* | open, deposit = the lab |
| BC-5 | Resin supply | *"mostly it's just there"*; slips **~once a month**, stalls the run | rate: range; stall duration: open |
| BC-6 | Structural over-commitment | Book (380–420) always exceeds capacity (270–300). *"I am always over capacity on paper, which is exactly why changeover hours and scrap matter so much."* | spelled out |

## Activities

| ID | Activity | Duration | Rate | Mode-change loss | Grade / notes |
|---|---|---|---|---|---|
| A-1 | **Run — Line 2, white, Meridian-sized** (start of line to last drum filled, incl. ramp-up, excl. washdown and QC) | shortest realistically **9h**; typical **10–11h**; bad-but-not-freak **14–16h**; freak ~**24h** (jam + material stall), *"once-a-year tail, not the normal worst case"* | n/a (step) | — | **spread-equivalent**, interval-first protocol. Deciles not explicitly stated. **Varies by line/product: not yet asked (P07 open)** |
| A-2 | **Washdown, tint→white** | **3 hours** | n/a | — | **number**, not spread. You mention *"the washdown that overruns"* as a tail source — overrun spread **open** |
| A-3 | **Changeover, white→tint** | *"a bit of white residue in a tinted batch, who cares"* — quick | n/a | — | **named only, no number** |
| A-4 | **Changeover, tint→tint** | **20–30 min** | n/a | — | range. Light/dark sub-split suspected, never measured |
| A-5 | **Changeover involving specialty** | — | — | — | **entirely open** |
| A-6 | **Ramp-up after washdown** | — | — | scrap; *"that was the week I rushed the ramp after a washdown"* → scrap spike | **named as a real loss, magnitude open (P02)** |
| A-7 | **QC hold** | typical **~4h**; specialty *"can be a full day"*; with backlog, a day-plus (last week: Wed evening → Thursday midday) | — | — | typical + qualitative tail |
| A-8 | **Filler jam** | short kind **0.5–1h** (*"four out of five"*); long kind **multi-hour**, e.g. the 4-hour kind | **1–2 per week plant-wide**; long kind **once a month to every 6 weeks**; *"Line 2's filler mostly"* | — | rate: range; duration: range. Your caveat: *"day-to-day impression, not a logged rate"* |
| A-9 | **Line 1 mill motor failure, multi-day** | *"the four-day disaster"* — days | **1–2 per year** (*"three, four times in the years I've been doing this job"*) | — | rate: range; duration: single anecdote |
| A-10 | **Line 1 mill motor hiccup, hours** | *"a few hours"* | **open** | — | the recent one that triggered OBJ-1 |
| A-11 | **Resin stall** | open | ~once a month | — | see BC-5 |
| A-12 | **Requalification** (moving specialty to a line) | **open** | n/a | *"eat the requalification headache"* | **load-bearing for OBJ-1, entirely unsized** |
| A-13 | **Release to warehouse** | end of scope | — | — | terminal |

## Ordering / flow

- **OF-1 (spelled out):** Order lands in demand book → scheduler maps orders to runs → run placed on a line in a week slot → *if incoming family ≠ line's current family, changeover first* → run executes (mix → mill → tint/letdown → fill, flowing, with holding tanks between; next batch's front end can start while this batch's back end fills) → QC hold → release to warehouse.
- **OF-2 order↔run mapping (spelled out qualitatively):** lump several small same-SKU orders to clear the minimum run size; split a big order into two runs to interleave a rush job. Split cost = an extra changeover + extra ramp-up scrap. Minimum run size: **unquantified**.
- **OF-3 line-choice branch (partly spelled out):** decided by qualification constraints C-1/C-2 plus POL-1; the residual discretion is exactly OBJ-1 and is **open**.
- **OF-4 blocking (spelled out, unquantified):** on Line 1, if fill is slow and the mill-to-fill tank is small, *"mill has to stop and wait, and that's dead time my sheet never sees."*
- **Known model/reality gap you volunteered:** the sheet records "Line 2 busy 06:00–18:00" and *"doesn't capture that at all"* — whether the line is genuinely occupied the whole window *"I genuinely couldn't tell you without going and watching it."*

## Policies

| ID | Policy | As practiced | Overrides |
|---|---|---|---|
| POL-1 | **Meridian white runs on Line 2** | Habit calcified into a rule after Meridian audited Line 2's fill area for supplier qualification. *"I have never once put a Meridian order on Line 1, even under real pressure"* — when Line 2 was down most of a day you **held the order and let it run late-ish**. Physically Line 1 could do it. | *"Treat it as effectively hard."* Breakable only as an explicit what-if experiment, *"not something I'd sanction as a live scheduling option."* |
| POL-2 | **Long washdown scheduled overnight** | *"tint before white means I'm looking at the long washdown, and I wanted that overnight rather than eating into the day"* | not asked |
| POL-3 | **Washdowns scheduled to when the crew is on** | *"we try to schedule washdowns for when the crew's on"* | night case unknown (BC-3) |
| POL-4 | **Avoid stacking family switches** | signalled by *"the changeover crew looking wrecked by Thursday because I stacked too many family switches back to back"* | not asked |
| POL-5 | **Reroute vs hold** | **OPEN — the core of OBJ-1** | |
| POL-6 | **Idle vs washdown** | **OPEN — the core of OBJ-2** | |
| POL-7 | **Changeover crew contention** — who wins when two lines want a washdown | **OPEN.** Observed symptom only: *"Line 3 sitting clean but idle waiting on the crew — it happens more than I'd like"* | |
| POL-8 | **QC lab queue discipline** | **OPEN** | |
| POL-9 | **Overtime / weekend running** | Ops director's call; you feed the *"we'll miss X without it"* argument. *"A live lever, not a nice-to-have."* | |

## Constraints

| ID | Limit | Consequence when hit |
|---|---|---|
| C-1 | Specialty cannot run on Line 2 — not piped for clear specialty resins | infeasible; must go Line 1 or Line 3 |
| C-2 | Two tint SKUs not qualified on Line 3 (QA/engineering decision, reason not known to you) | cannot be scheduled there |
| C-3 | Line 1 qualified for everything | fallback line of last resort |
| C-4 | Minimum run size | small orders must be lumped — **threshold unquantified** |
| C-5 | One changeover crew → **one washdown at a time across all three lines** | the other line waits |
| C-6 | One QC lab, two people | queue forms; **parallelism unknown** |
| C-7 | Demand 380–420 vs capacity 270–300 run-hours | *"every hour lost to a washdown or a jam is an hour I don't have to spare"* |
| C-8 | Meridian due date | *"due Friday close of business, which for Meridian really means Friday, no wiggle"* |

## Dynamics

| ID | Quantity | Direction & rate | Threshold |
|---|---|---|---|
| D-1 | **Line 1 mill-to-fill tank level** | rises when mill outpaces fill — **rate open** | at full, **mill stops and waits**; drains as fill proceeds; reset by fill catching up |

## Data bindings

| ID | Variable | Feed |
|---|---|---|
| DB-1 | order arrivals, quantities, due dates | ERP demand book |
| DB-2 | run durations in run-hours | your weekly sheet (already converted from rates) |
| DB-3 | per-stage cycle times by product and line | the historian — *"if someone actually pulled cycle times apart by product and stage, which — as I said — nobody's done"* |

---

# 2. Assumption ledger

Nothing below came from you. Each is mine, provisional, and needs your yes/no.

| # | Assumption | Why I'd need it | How to check |
|---|---|---|---|
| A1 | Changeover crew serves waiting lines **first-come-first-served** | C-5 makes the crew a contended resource; without a rule the model can't pick | Ask you (POL-7) — you may have a real priority rule |
| A2 | QC lab works **FIFO** on arriving batches | Same reason for C-6 | Ask the lab; also ask you whether you ever expedite a batch |
| A3 | A washdown falling outside day shift **waits until morning** | BC-3 is unknown and the model must do *something* | Crew lead — you flagged this yourself |
| A4 | QC lab has **no night presence** | Your stated impression, not fact | The lab |
| A5 | Line 2's ~2× speed advantage over Line 1 applies to **whites only**; I will not extend it to tints or specialty without evidence | You explicitly said don't take it as gospel outside whites | Process engineering, or historian cycle times (DB-3) |
| A6 | Ramp-up scrap occurs after a **washdown**, not after every run | Inferred from *"the week I rushed the ramp after a washdown"* — you never said it happens after short changeovers | Ask you; ask quality |
| A7 | The 24-hour Meridian run is modelled as a **rare tail, ~annual**, not part of the normal bad day | Your words *"once-a-year tail"* — but "once a year" as a rate is my reading of an anecdote | You, next session |
| A8 | Filler jams are **plant-wide 1–2/week concentrated on Line 2** rather than 1–2 per line | *"It's Line 2's filler mostly"* is directional, not a split | You, next session |

---

# 3. What's deliberately left out, and what's simply unknown

**Deliberately out of scope** (your boundary, and I think it's right for these three questions):
- Order generation upstream of the demand book.
- Trucking, warehouse slotting, shipping — logistics' sheet.
- Feedstock planning generally, except as the resin-slip disruption.
- Quarter-scale planning — you don't do it and ERP doesn't support it.

**Deliberately simplified, with what's lost:**
- **Stage-level detail inside a run.** You schedule in whole-run blocks; the model will too, *except* on Line 1 where you told me the mill-to-fill tank causes real dead time. Lost: any pipelining benefit from overlapping the next batch's mix with this batch's fill. Justified for now because your sheet doesn't see it either — but flagged, because you said the sheet *flatters* reality, and OBJ-3 (are you leaving hours on the table?) is exactly the question where flattery misleads.
- **Tint-to-tint sub-families.** Collapsed to one 20–30 min changeover. Lost: any light→dark penalty. Justified because you've never separated it; revisit if the model over-favours tint batching.

**Unknown and load-bearing — these are what stop the model running honestly today:**

1. **POL-5 and POL-6** — the two rules the whole exercise exists to test. Without your practiced rule I have no baseline to compare a candidate policy against.
2. **A-12 requalification cost** — OBJ-1 is a trade between requalification and a slipped white. One side of the trade is unsized.
3. **POL-7 changeover-crew priority** — C-5 is a hard bottleneck and you named its symptom (Line 3 idle). Currently on assumption A1.
4. **A-3, A-5, A-6** — the quick changeover, all specialty changeovers, and ramp-up scrap magnitude. OBJ-2 is *literally* "idle hour vs three-hour washdown plus ramp loss," and the ramp loss has no number.
5. **P07 across the board** — I have one duration spread, for one product on one line. I do not know how run duration varies by line, family, or size.
6. **BC-1 rush orders** — you say they land and force re-juggling; I have no arrival pattern, and OBJ-3 is about splitting runs to accommodate them.
7. **Numeric trade weights** — the Meridian-vs-distributor-vs-scrap exchange rate. Deposit: commercial.

---

# 4. Agenda for tomorrow

In the order I'd spend the time, biggest gap first:

1. The **reroute-or-hold** rule and the **idle-or-washdown** rule, each via the last time you actually faced it and what you looked at.
2. **Requalification** — what it actually involves and how long it takes.
3. **Changeover crew priority** when two lines want them at once, plus a recent borderline case.
4. **Ramp-up scrap** magnitude, and whether it follows every changeover or only washdowns.
5. **Rates for the other lines and families** — enough to stop me extrapolating from one Meridian white run.
6. **Rush order arrivals**, and who counts as Meridian-tier.
7. Whichever of the three deposits (crew lead / lab / process engineering) you can chase.

One correction I'd like at the top of tomorrow: **have I got any of the above wrong or in the wrong words?** Particularly the objectives table and the "better" ranking — those drive what I ask everything else about.

---

**Expert (Marta)**:

This is a lot to take in on a screen before a huddle, but let me flag what jumps out at me now rather than wait.

Mostly this reads right. A couple of things I want to correct or sharpen before you build on them:

**The "better" ranking** — close but not quite. You've got scrap and changeover hours as roughly equal-weight, third and fourth. I don't think that's right. Re-reading what I actually said: I'd take a scrap spike over a late Meridian order, sure, but I never compared scrap to changeover hours directly. My gut says changeover hours lost matter *more* than scrap, because lost hours cascade into more lateness, whereas scrap is just money — annoying, contained, doesn't ripple. So the order should probably be: late-and-who > changeover hours lost > scrap. But flag that as me thinking out loud just now, not something I'd already settled — ask me again tomorrow once I've slept on it, I might change my mind.

**A-7, the QC hold table** — you've written "with backlog, a day-plus (last week: Wed evening → Thursday midday)." That's about 18 hours, which is bad-Friday territory but it was actually a Wednesday-into-Thursday case, not the classic Friday backlog. I gave you that example as the "how it can still go wrong on a decent week" case, not as my definition of the tail. Don't let that example become your number for "the Friday case" — Friday's usually worse than that, I just don't have a clean anecdote for it yet.

**One thing missing entirely: BC-1, rush orders.** You've noted it as open, correctly, but I want to flag it's not a small gap — it might be as big as the two decision rules. Rush orders are *why* the reroute-or-hold and idle-or-washdown calls happen in the first place half the time. If you only ask me about the steady-state rules tomorrow and not about how rush orders actually arrive, you'll have modelled the calm week and missed the reason I lose sleep.

**Small correction on A-9/A-10**: you've split the mill motor into "hiccup" and "multi-day disaster" as two separate activities, which is fair, but don't assume everything between those two is smoothly distributed — in my experience it's bimodal, either a nuisance under half a day or a genuine disaster, rarely something in the middle. Worth being careful the model doesn't invent a smooth continuum where the real thing is two lumps.

Otherwise — yes, that's my plant. See you tomorrow, same time. Lead with the two rules.

---

**Interviewer**:

Recorded — all four as corrections that **supersede** what I'd written, not additions beside it.

1. **"Better" ranking** — now reads: *late orders and to whom* > *changeover hours lost* > *scrap*. Your reason on the record: *"lost hours cascade into more lateness, whereas scrap is just money — annoying, contained, doesn't ripple."* Marked **provisional — thought aloud, not settled**; I'll re-ask tomorrow before anything depends on it, and I won't build the metric on it in the meantime. The one firm ordering stays as you first gave it: scrap spike beats a late Meridian order, no contest.

2. **A-7** — the Wed evening → Thursday midday case is now labelled as your *"how it can still go wrong on a decent week"* example. It is **not** the Friday tail and I've deleted it from that slot. The Friday tail is now explicitly open: *"Friday's usually worse than that, I just don't have a clean anecdote for it yet."*

3. **BC-1 rush orders** — promoted out of the general open list into the top tier, alongside POL-5 and POL-6, with your framing attached: *"rush orders are why the reroute-or-hold and idle-or-washdown calls happen in the first place half the time… you'll have modelled the calm week and missed the reason I lose sleep."*

4. **A-9/A-10** — flagged as **bimodal, not a continuum**: nuisance under half a day, or genuine disaster, *"rarely something in the middle."* Noted as a modelling instruction, so nobody fits a single smooth distribution across the gap.

Tomorrow, in this order: the reroute-or-hold rule, the idle-or-washdown rule, then rush orders — each via the last time it actually happened. Requalification and crew priority after that.

Enjoy the huddle.

---

**Expert (Marta)**:

Thanks — that all lands right. See you tomorrow.

---

**Interviewer**:

See you tomorrow.

For the record, so nothing depends on memory overnight:

**Stopping outcome: `expert-stopped` — partial model with open slots.** The structural floor holds; none of the three objectives has a complete dependency slice. The model as read back stands, with the four corrections you just gave superseding what they replace:

- **Better** = late-and-to-whom > changeover hours lost > scrap — *provisional, thought aloud, to be re-confirmed before any metric is built on it*. The settled part remains: scrap spike over a late Meridian order, no contest.
- **A-7** — Wed→Thu ~18h is your *decent-week* example, not the Friday tail. Friday tail: open, no anecdote yet.
- **BC-1 rush orders** — top-tier gap, level with the two decision rules.
- **A-9/A-10** — bimodal by instruction: nuisance under half a day, or disaster. No smooth continuum across the middle.

Three deposits still sitting with other people when you get a chance: the crew lead (what happens to a washdown forced onto nights), the lab (parallel testing and evening cover), and process engineering (whether Line 2's 2× holds outside whites).

Tomorrow: the two rules first, then rush orders — each via the last time it actually happened.

---

**Expert (Marta)**:

Sounds right. Talk tomorrow.

---

**Interviewer**:

Talk tomorrow. The record's in the read-back above — nothing further from me until we pick up the two rules.

---

**Expert (Marta)**:

Good — I'll be ready to walk through the reroute and idle calls when we start. Nothing more from me either until then.

---

**Interviewer**:

Understood. Standing by — we resume with the reroute-or-hold call, the idle-or-washdown call, then rush orders, each from the last time it happened.

---

**Expert (Marta)**:

Sounds good — I'll have the specific instances in mind. Talk then.

---

**Interviewer**:

Perfect — a specific instance for each is exactly what I need. Talk then.

---

**Expert (Marta)**:

Confirmed — same plan, same order. Talk then.

---

**Interviewer**:

Confirmed. Ending here.

---

**Expert (Marta)**:

Alright — ending here. Talk soon.

---

**Interviewer**:

Talk soon. The model, assumption ledger, and loss account are in the read-back above, with your four corrections applied; we resume at the two rules.

---

**Expert (Marta)**:

Understood — that's the record. Whenever you're ready to pick up the reroute-or-hold rule, I'll walk you through the actual case.

---

**Interviewer**:

Then let's pick it up now — no reason to wait.

**Take that Line 1 mill motor morning.** Not the general rule yet, just what happened. You're at the huddle, the motor's down for a few hours, you've got the specialty batch and the Meridian white both needing to move.

1. **Walk me through the minutes.** What did you look at first, what did you look at next, and what did you say out loud when you made the call? I want the sequence of your attention, not the justification.

2. **What would have had to be different for you to call it the other way** — held the specialty on Line 1 and let the white slip? Give me the version of that morning where you make the opposite call.

---

**Expert (Marta)**:

Okay, let me actually put myself back there.

**1. The sequence.**

First thing I looked at wasn't the specialty or the white at all — it was the motor. I wanted to know from maintenance, right then, "is this the twenty-minute reset kind or do I need to be worried," because that answer changes everything downstream. They said a few hours, looked routine, not the scary failure — that's the first fact I need before I can even think about rerouting anything.

Second thing: I looked at the specialty batch's due date. It wasn't screaming — a few days out — so my first instinct was actually "can it just wait for Line 1 to come back," not "move it." That's my default, moving specialty is a pain, I don't want to do it.

Third: I looked at what Line 2 was doing and what it was about to do. Line 2 had capacity coming up because the tint run ahead of the Meridian order was tracking fine — so the Meridian white had a clear path if Line 1's problem didn't spill into it. That's when the real tension showed up: if I *don't* move the specialty, it sits and waits for Line 1, fine, no drama — but the thing that actually made me move was that Line 1's queue that day wasn't just the specialty, it also had a knock-on tint job stacked behind it, and if the specialty sat there blocking the queue, that tint job gets delayed too, and *that* tint job was the one that fed into the Meridian white's changeover on Line 2 later in the week. So it wasn't "specialty vs white" directly — it was "if I don't clear Line 1's queue now, it back up onto something that touches the white two days later."

So what I actually said out loud at the huddle was something like "Line 1's down a few hours, let's shift the specialty to Three and keep the queue moving, I don't want this backing into Thursday." The white wasn't really the thing I was staring at — it was collateral reasoning, the domino two steps down.

**2. The opposite call.**

I'd have held the specialty on Line 1 if: the motor fix had been quick — say under an hour, not "a few" — because then it's not worth the requalification hassle for such a short wait. Or if Line 3 had been tied up with something of its own that day, because then rerouting isn't even a real option, it's theoretical. Or — and this is probably the biggest one — if that tint job hadn't been sitting behind the specialty in Line 1's queue. If Line 1's queue that day was *just* the specialty and nothing behind it, I'd have shrugged and let it wait for the motor, because a few hours' hold on a not-urgent specialty order is cheap and a requalification isn't.

So the honest rule buried in there isn't really "reroute vs hold based on the white" — it's more like: **I hold by default, and I only reroute if leaving it in place would jam something else behind it that I care about more.** The Meridian white in this story was three steps removed, not the thing I was directly weighing.

---

**Interviewer**:

That's a different rule than the one I was about to write down, and much more useful — thank you. Let me check I've got it.

**So you're saying: your default is hold. You only reroute when leaving the job in place would block something behind it in that line's queue that you care about more than the requalification cost — and the thing you care about may be several steps removed, like a tint job that later feeds a changeover on another line.** Is that right, and would you word it differently?

Two things I need to make that runnable:

1. **How far down the queue do you actually look?** In that story you saw a tint job behind the specialty, and then saw that the tint job touched the white two days later — that's two hops. Is two hops typical, or did you go further that morning than you usually do? And is there a point where you stop tracing?

2. **What makes a downstream job one you "care about more"?** In that case the chain ended at Meridian. Would a chain ending at a small distributor's order have moved you, or would you have shrugged and held?

---

**Expert (Marta)**:

Good questions, and honestly they make me realise I don't do this as cleanly as the story makes it sound.

**On the wording** — yes, that's right, that's a better statement of it than I'd have managed myself. "Hold by default, reroute only if staying put jams something you care about more" — that's the shape of it. I'd maybe add: it's not just that requalification is costly, it's that requalification is a *known, bounded* cost and blocking the queue is an *unknown, possibly-cascading* one. So there's an asymmetry — I'll pay a known cost to avoid an unknown one, especially when I'm short on time to think it through properly, which at a 07:30 huddle I always am.

**1. How far I look:** Honestly, two hops is probably close to my ceiling, and that morning I only got there because the tint job was the very next thing in queue and I happened to remember what it fed. I don't systematically trace the whole week's dependency chain every time something breaks — I don't have time, and frankly I don't think I *could* hold that whole picture in my head reliably. Normally it's one hop: "what's sitting right behind this in the queue, does it matter." The second hop only happens when the first hop is itself something time-pressured — if the tint job behind the specialty had had a slack due date, I probably wouldn't have bothered chasing where it went next. So: **one hop routinely, two hops only when hop one is already urgent-looking.** Past that I'm guessing, not tracing.

**2. What makes it "care about more":** Yeah — if that chain had ended at a small distributor instead of Meridian, I don't think I'd have moved the specialty. I'd have shrugged, let Line 1's queue sit, and told the distributor's order it might run a day later, which is exactly the kind of slip that "nobody notices." The whole reason I bothered chasing the second hop that morning is that Meridian was at the end of it — if I hadn't recognized where the tint job fed, I wouldn't have rerouted at all. So the customer tier at the *end* of the chain is doing real work here, not just the immediate next job. Put bluntly: I trace further and act more readily when I suspect Meridian's at the other end of it than when I don't.

---

**Interviewer**:

Two more on this rule, then I'll size the cost side of it.

1. **What overrides it?** I'm looking for the case that breaks the pattern — a time you rerouted even though nothing was stacked behind, or a time something urgent *was* blocked and you still held. If one comes to mind, tell me what was different about it.

2. **Requalification** — you've called it a headache and a known bounded cost, but I have no size for it. When you moved that specialty to Line 3, **what actually had to happen before it could run?** Who did what, and how long did it hold the batch up?

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Stopping now. Nothing new opened; the last two questions I asked are recorded as unanswered.

---

# Coatings Plant Scheduling Model

**Stopping outcome: `expert-stopped` — partial model with open slots.**

The structural floor holds (3 objectives, 6 entity-types, 13 activities, 4 ordering/flow nodes). **No objective's dependency slice is complete.** OBJ-1 is now substantially supported on its policy side and unsupported on its cost side; OBJ-2 and OBJ-3 remain unsupported at their cores. Details in §4.

Every value below is at the grade you actually gave it, in your words where I have them. I have not promoted anything.

---

## 1. Objectives

| ID | The question, in your words | Depends on | Slice status |
|---|---|---|---|
| **OBJ-1** **Reroute or hold** | *"whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2"* — *"I'd love to run twice and see which one bites me less"* | POL-5, A-12, ET-3, ET-1, C-1, C-2, C-3, POL-1, A-9, A-10, OF-3 | **Partial** — rule captured, requalification cost absent |
| **OBJ-2** **Idle or washdown** | *"do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now"* — a call *"almost weekly and it's pure feel"* | POL-6, A-2, A-3, A-4, A-6, ET-4, C-5, BC-1 | **Unsupported** — the deciding rule is absent |
| **OBJ-3** **Run size & sequencing** | *"whether to split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one of them ships a bit early and sits in the warehouse"* — *"I've never had a way to check if I'm leaving hours on the table"* | OF-2, C-4, A-6, A-2/3/4, BC-1, ET-2 | **Unsupported** — rush-order arrivals and minimum run size absent |

Noted, **not** an objective you own — overtime approval: *"that's the ops director's call, though I do feed him the 'we'll miss X without it' argument… maybe that's a variant of the same question rather than a fourth one."*

**What "better" means** — grade: *spelled out as a ranking; numeric weights absent.*

- **Settled:** ordering is by lateness **and to whom** — *"a late order to Meridian is worse than three late orders to a small distributor, so it's not just a count, it matters who."*
- **Settled trade:** *"a late Meridian order and… a scrap spike — I'll take the scrap spike every time, no contest. Scrap costs money, a late Meridian order costs a relationship and a fine."*
- **Provisional, thought aloud, explicitly not settled:** late-and-to-whom > changeover hours lost > scrap, because *"lost hours cascade into more lateness, whereas scrap is just money — annoying, contained, doesn't ripple."* You asked to be re-asked after sleeping on it. **No metric should be built on this ordering until you confirm it.**
- Currency exchange rate between the three: **open.** Deposit: *"sit down with commercial."*

**Horizon** (spelled out): rolling week, built fresh Monday against that week's demand book, re-runnable at shift grain when something breaks at 06:00. *"A quarter's too far out — I don't plan that far, ERP just doesn't give me visibility past a few weeks anyway."*

**Boundary** (spelled out): begins when an order lands in the demand book from ERP; ends when the batch **clears QC hold and is released to the warehouse.** Trucks and warehouse slotting excluded — *"logistics' sheet, not mine."* QC hold explicitly in scope — *"I've had orders filled on time and still gone late because the lab backed up on a Friday."* Feedstock excluded except that resin slips must be representable — *"otherwise you're modelling a plant that never has a bad Tuesday."*

---

## 2. Validation criteria

| ID | Criterion | Grade |
|---|---|---|
| **VC-1** | The unwritten rules hold: Meridian white lands on Line 2; specialty never on Line 2; Line 3 never gets the two unqualified tint SKUs. *"If it violates any of that, I'll dismiss it in about ten seconds, doesn't matter how clever the maths is."* | spelled out |
| **VC-2** | Changeover asymmetry the right way round: **tint→white is the long washdown, white→tint is the quick one.** *"If it shows tint-to-white as quick and white-to-tint as the long one, I'll know someone got the plant backwards."* | spelled out |
| **VC-3** | Replay last week's book; the late orders it predicts are roughly the ones that actually went late — Meridian squeaked through by a few hours; a distributor order slid four days *"with a phone call and nobody blinked"*; the Line 1 tank issue bit us. You can reconstruct two or three such weeks from memory and the sheet. | spelled out |

---

## 3. The model

### 3.1 Entity types

| ID | Type | Distinctions the process treats apart | State it carries | Population |
|---|---|---|---|---|
| **ET-1** | **Order** — a line in the demand book | SKU; quantity (drums, sometimes bulk litres for big Meridian); due date; **customer tier — Meridian vs small distributor** | family (white / tint / specialty); due-date hardness; customer tier | ~**380–420 run-hours** of demand per week *(range)* |
| **ET-2** | **Run** — a block on the sheet | *"orders are what demand gives me, runs are what I actually schedule, and I'm the one deciding the mapping between them week to week."* One order's worth, or several small same-SKU orders lumped to clear minimum run size; a big order can split into two runs to interleave a rush job | line assignment; family; scheduled window | derived from ET-1 by OF-2 |
| **ET-3** | **Line** | see 3.2 | current/last family (sets the changeover); qualification set; up / down | **3** |
| **ET-4** | **Changeover crew** *(contended)* | one crew, **two techs**, **day shift**, covers all three lines | busy / free | **1** |
| **ET-5** | **QC lab** *(contended)* | one lab, **two people**, serves all three lines | queue depth | **1** |
| **ET-6** | **Stage within a line** | **mix → mill → tint/letdown → fill**, at different points on the line with small holding tanks between | tank level (see D-1) | 4 per line |

### 3.2 The three lines (spelled out qualitatively; rates only partly numeric)

- **Line 1** — *"the old workhorse. Slower overall, but the most flexible: it's qualified for everything, whites, tints, specialty, all of it. It's the one you send something to when nowhere else can take it."* Weak point: the mill-to-fill tank is small — *"if fill is slow and the tank's small, mill has to stop and wait, and that's dead time my sheet never sees."* Home of the mill motor. Two shifts.
- **Line 2** — *"the fast line. Built for volume."* Roughly **2× Line 1 on whites**; *"that gap seems to shrink for tints, I don't actually know why… don't take 'twice as fast' as gospel outside whites."* **Not piped for the clear specialty resins** — *"specialty simply cannot run there, full stop, that's physical not a preference."* Jam-prone filler. Two shifts.
- **Line 3** — *"newest, quick, but still being qualified SKU by SKU."* Two tint SKUs not signed off — *"a QA/engineering decision from before my time on this role, I just know not to put them there."* Day shift only unless overtime approved.

### 3.3 Families (spelled out, with one flagged sub-distinction)

**Whites / tints / specialty** — *"it's really about what a washdown has to deal with, not the product itself."* White-after-white and tint-after-tint are within-family. Flagged caveat, never separated on the sheet: *"I wouldn't swear every tint-to-tint pair is really equal"* — light-to-light may be gentler than light-to-dark.

### 3.4 Boundary conditions

| ID | What | Value | Grade |
|---|---|---|---|
| **BC-1** | **Demand book** | Built fresh Monday from ERP; **380–420 run-hours/week**. Rush orders land mid-week and force re-juggling — *"rush orders are why the reroute-or-hold and idle-or-washdown calls happen in the first place half the time"* | volume: **range**. **Arrival pattern: OPEN — top-tier gap** |
| **BC-2** | **Line calendar** | L1 & L2 two shifts, 16 h/day ≈ 112 h/wk nominal, *"though we don't always run weekends flat out — more like five and a half, six days realistically."* L3 day shift ≈ 56 h unless OT. Realistic total **270–300 run-hours** | **range** |
| **BC-3** | **Changeover-crew calendar** | Day shift only. Night behaviour **unknown** — *"Might be we call someone in. Might be it waits till morning. I'd have to check with the crew lead."* | **open — deposit: crew lead** |
| **BC-4** | **QC lab calendar** | Day shift, *"maybe with someone covering into evening, but I don't think there's a night presence… impression, not fact"* | **open — deposit: the lab** |
| **BC-5** | **Resin supply** | *"mostly it's just there"*; slips **~once a month**, and when it does *"it stalls the run and I have to shuffle around it"* | rate: **range**. Stall duration: **open** |
| **BC-6** | **Structural over-commitment** | Book (380–420) always exceeds capacity (270–300). *"I am always over capacity on paper, which is exactly why changeover hours and scrap matter so much — every hour lost to a washdown or a jam is an hour I don't have to spare."* Weekend/OT running *"is a live lever, not a nice-to-have"* | **spelled out** |

### 3.5 Activities

| ID | Activity | Duration | Occurrence rate | Mode-change loss | Grade / notes |
|---|---|---|---|---|---|
| **A-1** | **Run — Line 2, white, Meridian-sized** (line start to last drum filled; incl. ramp-up; excl. washdown before and QC after) | shortest realistically **9 h**; typical **10–11 h** (*"that's the number that's actually on the sheet"*); bad-but-not-freak **14–16 h**; freak **~24 h** (jam + material stall), *"a genuine outlier… more 'the terrible day'"* | n/a (step) | — | **spread-equivalent**, interval-first protocol (low/high then typical). Deciles not stated. **P07 unasked: variation by line/family/size OPEN** |
| **A-2** | **Washdown, tint→white** | **3 hours** | n/a | — | **number, not spread.** You name *"the washdown that overruns"* as a tail source; overrun spread **open** |
| **A-3** | **Changeover, white→tint** | *"a bit of white residue in a tinted batch, who cares, it's getting colour anyway"* — quick | n/a | — | **named only, no number** |
| **A-4** | **Changeover, tint→tint** | **20–30 min** | n/a | — | **range**; light/dark sub-split suspected, never measured |
| **A-5** | **Changeovers involving specialty** | — | — | — | **entirely open** |
| **A-6** | **Ramp-up after washdown** | — | — | **scrap** — *"that was the week I rushed the ramp after a washdown"* → scrap spike | **named as a real loss; magnitude open.** Load-bearing for OBJ-2 |
| **A-7** | **QC hold** | typical **~4 h**; specialty *"can be a full day"*. Decent-week bad case: Wed evening → Thu midday (~18 h) because of a mid-week backlog. **Friday tail: open** — *"Friday's usually worse than that, I just don't have a clean anecdote for it yet"* | — | — | typical: **number**; tails: partly qualitative |
| **A-8** | **Filler jam** | short kind **0.5–1 h** — *"four out of five"*; long kind multi-hour (the *"four-hour kind"*) | **1–2 per week plant-wide**; long kind **once a month to every six weeks**; *"It's Line 2's filler mostly"* | — | rate: **range**; duration: **range**. Your caveat: *"day-to-day impression, not a logged rate… roughly-right rather than exact"* |
| **A-9** | **Line 1 mill motor — multi-day failure** | *"the four-day disaster"* | **1–2 per year** — *"maybe three, four times in the years I've been doing this job"* | — | rate: **range**; duration: single anecdote |
| **A-10** | **Line 1 mill motor — hiccup** | *"a few hours"* | **open** | — | the case that triggered OBJ-1 |
| **A-9/A-10 joint instruction** | **Bimodal, not a continuum** | *"either a nuisance under half a day or a genuine disaster, rarely something in the middle"* | | | **Do not fit one smooth distribution across the gap** |
| **A-11** | **Resin stall** | **open** | ~once a month (BC-5) | — | |
| **A-12** | **Requalification** (running specialty on a line it hasn't recently run on) | **OPEN** | n/a | *"eat the requalification headache"*; characterised as a **known, bounded** cost | **Load-bearing for OBJ-1 and entirely unsized.** I asked what actually had to happen and how long it held the batch up; unanswered |
| **A-13** | **Release to warehouse** | terminal event | — | — | end of scope |

### 3.6 Ordering / flow

- **OF-1 — the spine (spelled out).** Order lands in demand book → scheduler maps orders to runs (OF-2) → run placed on a line in a week slot (OF-3) → *if incoming family ≠ line's current family, changeover first (A-2/3/4/5)* → run executes: **mix → mill → tint/letdown → fill**, as a flow with small holding tanks between, so *"while the back end of a batch is filling, the front end of the next batch could already be mixing, if there's product to feed it"* → **QC hold (A-7)** → **release to warehouse (A-13)**.
- **OF-2 — order↔run mapping (spelled out qualitatively).** Lump several small same-SKU orders to clear the minimum run size; split a big order into two runs to interleave a rush job. **Split cost** = an extra changeover plus extra ramp-up scrap. **Minimum run size: unquantified (C-4).**
- **OF-3 — line choice (branch).** Filtered by C-1/C-2/C-3 and POL-1; the residual discretion is POL-5.
- **OF-4 — blocking on Line 1 (spelled out, unquantified).** Small mill-to-fill tank: if fill lags, mill stops and waits. *"Dead time my sheet never sees."*
- **Known model/reality gap you volunteered.** The sheet says *"Line 2 busy 06:00–18:00"* and *"doesn't capture that at all."* Whether the line is genuinely occupied that whole window — *"I genuinely couldn't tell you without going and watching it, which is part of why I said the sheet flatters reality."*

### 3.7 Policies

| ID | Policy | As practiced | Overrides | Source-regime |
|---|---|---|---|---|
| **POL-1** | **Meridian white runs on Line 2** | Habit calcified into a rule after Meridian's people audited Line 2's fill area for supplier qualification. *"I have never once put a Meridian order on Line 1, even under real pressure"* — when Line 2 was down most of a day you **held the order and let it run late-ish** rather than move it, *"because breaking that rule felt riskier than a few hours' delay."* | *"Treat it as effectively hard."* Breakable **only** as an explicit what-if experiment — *"not something I'd sanction as a live scheduling option."* | **prescribed:** nothing written, not a formal qualification. **practiced:** absolute. Both recorded. |
| **POL-5** | **Reroute or hold** — the OBJ-1 rule | **Your settled wording:** *"Hold by default, reroute only if staying put jams something you care about more."* With the asymmetry you gave: *"requalification is a known, bounded cost and blocking the queue is an unknown, possibly-cascading one. So… I'll pay a known cost to avoid an unknown one, especially when I'm short on time to think it through properly, which at a 07:30 huddle I always am."* **Attention sequence, from the actual case:** (1) ask maintenance *"is this the twenty-minute reset kind or do I need to be worried"* — *"that answer changes everything downstream"*; (2) check the blocked job's own due date — if not screaming, default is wait; (3) look at what the other line is doing and, critically, **what is stacked behind the blocked job in its own line's queue**. *"It wasn't 'specialty vs white' directly — it was 'if I don't clear Line 1's queue now, it backs up onto something that touches the white two days later.'"* **Lookahead depth:** *"one hop routinely, two hops only when hop one is already urgent-looking. Past that I'm guessing, not tracing."* **Tier-sensitivity of the trace:** *"I trace further and act more readily when I suspect Meridian's at the other end of it than when I don't."* If the chain had ended at a small distributor — *"I'd have shrugged, let Line 1's queue sit, and told the distributor's order it might run a day later, which is exactly the kind of slip that 'nobody notices.'"* **Conditions that flip it to hold:** fix under an hour; the alternate line already tied up (*"then rerouting isn't even a real option, it's theoretical"*); nothing stacked behind. | **OPEN** — I asked for the case that breaks the pattern; unanswered. | practiced only |
| **POL-6** | **Idle or washdown** — the OBJ-2 rule | **OPEN — the core of OBJ-2.** Situation known, rule absent. | open | — |
| **POL-2** | **Long washdown pushed overnight** | *"tint before white means I'm looking at the long washdown, and I wanted that overnight rather than eating into the day."* | not asked | practiced |
| **POL-3** | **Washdowns scheduled to when the crew is on** | *"we try to schedule washdowns for when the crew's on."* | night case unknown (BC-3) | practiced |
| **POL-4** | **Avoid stacking family switches** | Signalled by its failure mode: *"the changeover crew looking wrecked by Thursday because I stacked too many family switches back to back."* | not asked | practiced |
| **POL-7** | **Changeover-crew contention** — who wins when two lines want the crew | **OPEN.** Symptom only: *"Line 3 sitting clean but idle waiting on the crew — it happens more than I'd like."* | open | — |
| **POL-8** | **QC lab queue discipline** | **OPEN** | open | — |
| **POL-9** | **Overtime / weekend running** | Ops director's call; you supply the *"we'll miss X without it"* argument. | — | practiced |

### 3.8 Constraints

| ID | Limit | Consequence when hit |
|---|---|---|
| **C-1** | Specialty cannot run on Line 2 — not piped for clear specialty resins | Infeasible. Must go Line 1 or Line 3 |
| **C-2** | Two tint SKUs not qualified on Line 3 | Cannot be scheduled there |
| **C-3** | Line 1 qualified for everything | Fallback of last resort |
| **C-4** | **Minimum run size** | Small orders must be lumped to clear it. **Threshold unquantified** |
| **C-5** | One changeover crew → **one washdown at a time across all three lines** | The other line waits, clean and idle |
| **C-6** | One QC lab, two people | Queue forms; holds stretch. **Parallelism unknown** |
| **C-7** | Demand 380–420 vs capacity 270–300 run-hours per week | Something slips every week; OT/weekend is the release valve |
| **C-8** | Meridian due date | *"due Friday close of business, which for Meridian really means Friday, no wiggle"* |

### 3.9 Dynamics

| ID | Quantity | Direction & rate | Noise | Threshold |
|---|---|---|---|---|
| **D-1** | **Line 1 mill-to-fill tank level** | Rises when mill outpaces fill; falls as fill proceeds. **Rate: open** | not asked | **At full: mill stops and waits.** Reset when fill catches up. This is the *"dead time my sheet never sees"* and the thing behind *"I keep grumbling about Line 1's mill-to-fill tank"* |

### 3.10 Data bindings

| ID | Variable | Feed | Note |
|---|---|---|---|
| **DB-1** | Order arrivals, quantities, due dates, customer | ERP demand book | The natural model input |
| **DB-2** | Run durations in run-hours | Your weekly sheet | Already converted from rates — *"I keep the sheet in run-hours already converted"* |
| **DB-3** | Per-stage cycle times by product and line | The historian | *"if someone actually pulled cycle times apart by product and stage, which — as I said — nobody's done"* |

---

## 4. Assumption ledger

Nothing here came from you. Each is mine, provisional, and needs a yes/no before it carries weight.

| # | Assumption | Why it exists | How to check |
|---|---|---|---|
| **A1** | Changeover crew serves waiting lines **first-come-first-served** | C-5 is a hard bottleneck; the model must pick someone | Ask you (POL-7). You may well have a real priority rule — the Line 3 symptom suggests you do |
| **A2** | QC lab works **FIFO** | C-6 needs a discipline | The lab; also ask whether you ever expedite a batch |
| **A3** | A washdown falling outside day shift **waits until morning** | BC-3 unknown; the model must do something | Crew lead — you flagged this yourself |
| **A4** | QC lab has **no night presence** | Your stated impression, not fact | The lab |
| **A5** | Line 2's ~2× advantage over Line 1 applies to **whites only**; not extended to tints or specialty | You explicitly warned against extending it | Process engineering, or historian cycle times (DB-3) |
| **A6** | Ramp-up scrap follows a **washdown**, not every changeover | Inferred from *"the week I rushed the ramp after a washdown"*; you never said it follows short changeovers | Ask you; ask quality |
| **A7** | The ~24 h Meridian run is a **rare, roughly annual** tail, not part of the normal bad day | Your words were *"once-a-year tail"*, but treating one anecdote as a rate is my move | You |
| **A8** | Filler jams are **1–2 per week plant-wide, concentrated on Line 2**, not 1–2 per line | *"It's Line 2's filler mostly"* is directional, not a split | You |
| **A9** | POL-5's queue lookahead is evaluated **at the moment of disruption**, not continuously | Your account is of a 07:30 huddle decision; nothing says you re-trace during the day | You |
| **A10** | "Care about more" in POL-5 is driven by **customer tier and due-date pressure** of the downstream job | You gave exactly these two factors (Meridian vs distributor; *"screaming"* vs slack due date) and no others; whether anything else counts is untested | You |

---

## 5. What the model leaves out, and why

### Deliberately out of scope — your boundary

- Order generation upstream of the demand book — *"sales does whatever it does."*
- Trucking, warehouse slotting, shipping — logistics' sheet.
- Feedstock planning, except as the resin-slip disruption (BC-5).
- Quarter-scale planning — you don't do it and ERP can't see that far.
- **Overtime approval as a decision** — modelled as a lever (BC-2/POL-9), not as a choice the model optimises, because it isn't yours.

### Deliberately simplified — and what is lost

1. **Stage-level detail inside a run.** You schedule whole-run blocks and the model follows you — *except* on Line 1, where D-1/OF-4 keeps the mill-to-fill blocking because you named it as real dead time. **Lost:** any pipelining gain from overlapping the next batch's mix with this batch's fill, which you said physically exists. **Risk:** you told me the sheet *flatters* reality here, and OBJ-3 is precisely "am I leaving hours on the table?" This simplification is the one most likely to bite that objective. Flagged rather than resolved.
2. **Tint-to-tint sub-families collapsed** to a single 20–30 min changeover. **Lost:** any light→dark penalty. Justified because you've never separated it on the sheet; revisit if the model starts over-favouring tint batching.
3. **Queues are not modelled as named objects** — waits at the crew, the lab, and behind a blocked line emerge from the activities on either side. Nothing is lost operationally; it means you won't see a node called "queue" in the final net.

### Open slots that stop the model running honestly

**Top tier — an objective's core is missing:**

1. **POL-6, idle-vs-washdown.** OBJ-2 has no rule at all. The situation is captured; the decision is not.
2. **BC-1 rush-order arrivals.** Your own escalation: *"if you only ask me about the steady-state rules… you'll have modelled the calm week and missed the reason I lose sleep."* OBJ-3 depends on it directly and OBJ-1/OBJ-2 depend on it as the trigger.
3. **A-12 requalification cost.** OBJ-1 is a trade with one side unpriced. POL-5 now tells me *when* you pay it; nothing tells me *what* you pay. I asked and we stopped before the answer.

**Second tier — hard bottlenecks running on my assumptions:**

4. **POL-7 crew priority** (on A1) and **POL-8 lab discipline** (on A2). C-5 and C-6 are the two contended resources in the plant; both currently arbitrate by my guess.
5. **A-6 ramp-up scrap magnitude.** OBJ-2 is literally *idle hour vs three-hour washdown plus ramp loss* — and the ramp loss has no number.
6. **A-3, A-5** — the quick changeover has no duration; specialty changeovers are entirely absent.

**Third tier — breadth:**

7. **P07 unasked across the board.** I have one duration spread, for one product, on one line. Run duration by line, family, and size is unknown; A5 stops me extrapolating, which means Lines 1 and 3 currently have no durations at all.
8. **Numeric trade weights** (deposit: commercial) and the **provisional "better" ranking** awaiting your confirmation.
9. **A-10 hiccup rate**, **A-11 resin stall duration**, **D-1 tank fill/drain rate**, **A-2 overrun spread**, **A-7 Friday tail**, **C-4 minimum run size** — each a single missing figure.
10. **POL-5's override case** — I asked for the exception that breaks the pattern and we stopped. A rule without its exception is where simulation and reality diverge.

### Three deposits sitting with other people

| Deposit | Question | Who |
|---|---|---|
| BC-3 | What happens to a washdown forced onto night shift | Crew lead |
| BC-4, C-6 | Does the lab test in parallel, and how far into the evening is it covered | The lab |
| A5 | Does Line 2's 2× speed advantage hold outside whites | Process engineering (or historian, DB-3) |

### What I am not claiming

I have elicited a model, not built a net. The Petri-net scaffold, the code obligations, and the formal loss report are produced by your tooling's projection from this model — I have not written them, and nothing here should be described as loadable, compiled, or simulated. Two things I'd expect that projection to report as uncarryable: the **ranked, non-numeric objective weights** (§1), and **POL-5's tier-sensitive lookahead depth** — *"one hop routinely, two hops only when hop one is already urgent-looking"* is a rule about how much of the future you attend to, and that is not a guard on a transition. It will need to be written as code or approximated, and either way it should be visible to you as a choice, not buried.

### When you resume

In order: **POL-6** (idle-vs-washdown, via the last time you faced it) → **BC-1** (rush orders — how they arrive, how often, how much notice) → **A-12** (requalification: what actually has to happen, who does it, how long it holds the batch) → **POL-5's override case** → **POL-7** crew priority with a recent borderline call → the **"better" ranking** you wanted to sleep on.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Stopping here. Nothing new asked. This is the final deliverable, self-contained.

---

# Coatings Plant Scheduling Model — final

**Stopping outcome: `expert-stopped` — partial model with open slots.**
Structural floor met (3 objectives, 6 entity-types, 13 activities, 4 ordering/flow nodes). No objective's dependency slice is complete: OBJ-1 has its rule but not its cost; OBJ-2 and OBJ-3 are missing their cores. Every value is at the grade you gave it; nothing has been promoted or invented.

---

## 1. Objectives

| ID | The question, in your words | Depends on | Slice |
|---|---|---|---|
| **OBJ-1 Reroute or hold** | *"whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2"* — *"I'd love to run twice and see which one bites me less"* | POL-5, A-12, ET-1, ET-3, C-1/2/3, POL-1, A-9, A-10, OF-3 | **Partial** — rule captured, requalification cost absent |
| **OBJ-2 Idle or washdown** | *"do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now"* — *"almost weekly and it's pure feel"* | POL-6, A-2, A-3, A-4, A-6, ET-4, C-5, BC-1 | **Unsupported** — the deciding rule is absent |
| **OBJ-3 Run size & sequencing** | *"whether to split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one of them ships a bit early and sits in the warehouse"* — *"I've never had a way to check if I'm leaving hours on the table"* | OF-2, C-4, A-6, A-2/3/4, BC-1, ET-2 | **Unsupported** — rush arrivals and minimum run size absent |

Noted, not yours to test — overtime approval: *"that's the ops director's call, though I do feed him the 'we'll miss X without it' argument… maybe that's a variant of the same question rather than a fourth one."*

**"Better"** — grade: ranking spelled out, numeric weights absent.
- Settled: lateness **and to whom** — *"a late order to Meridian is worse than three late orders to a small distributor, so it's not just a count, it matters who."*
- Settled trade: *"I'll take the scrap spike every time, no contest. Scrap costs money, a late Meridian order costs a relationship and a fine."*
- **Provisional, thought aloud, not settled:** late-and-to-whom > changeover hours lost > scrap, because *"lost hours cascade into more lateness, whereas scrap is just money — annoying, contained, doesn't ripple."* You asked to be re-asked. **No metric should be built on this ordering until you confirm it.**
- Currency exchange rate: **open**. Deposit: *"sit down with commercial."*

**Horizon:** rolling week built fresh Monday against that week's book, re-runnable at shift grain when something breaks at 06:00. *"A quarter's too far out."*

**Boundary:** starts when an order lands in the demand book from ERP; ends when the batch **clears QC hold and is released to the warehouse**. Trucks and warehouse slotting out — *"logistics' sheet, not mine."* QC hold explicitly in — *"I've had orders filled on time and still gone late because the lab backed up on a Friday."* Feedstock out except resin slips — *"otherwise you're modelling a plant that never has a bad Tuesday."*

---

## 2. Validation criteria

- **VC-1** Unwritten rules hold: Meridian white on Line 2; specialty never on Line 2; the two unqualified tint SKUs never on Line 3. *"If it violates any of that, I'll dismiss it in about ten seconds."*
- **VC-2** Changeover asymmetry the right way round: **tint→white long, white→tint quick.** *"If it shows tint-to-white as quick… someone got the plant backwards."*
- **VC-3** Replay last week's book; predicted lates roughly match actual — Meridian squeaked by a few hours, a distributor slid four days *"with a phone call and nobody blinked"*, the Line 1 tank issue bit. Two or three such weeks reconstructable.

---

## 3. Model

### Entity types

| ID | Type | Distinctions | Carried state | Population |
|---|---|---|---|---|
| ET-1 | **Order** (line in the demand book) | SKU; quantity (drums, sometimes bulk litres for big Meridian); due date; **customer tier — Meridian vs small distributor** | family; due-date hardness; tier | ~**380–420 run-hours**/week *(range)* |
| ET-2 | **Run** (block on the sheet) | *"orders are what demand gives me, runs are what I actually schedule, and I'm the one deciding the mapping"*; one order, or small same-SKU orders lumped; a big order splittable in two | line, family, window | derived via OF-2 |
| ET-3 | **Line** | see below | current/last family; qualifications; up/down | **3** |
| ET-4 | **Changeover crew** *(contended)* | one crew, **two techs**, **day shift**, all three lines | busy/free | **1** |
| ET-5 | **QC lab** *(contended)* | one lab, **two people**, all three lines | queue depth | **1** |
| ET-6 | **Stage** | **mix → mill → tint/letdown → fill**, small holding tanks between | tank level (D-1) | 4 per line |

**Lines.** *Line 1* — *"the old workhorse. Slower overall, but the most flexible: qualified for everything… the one you send something to when nowhere else can take it."* Small mill-to-fill tank: *"if fill is slow and the tank's small, mill has to stop and wait, and that's dead time my sheet never sees."* Home of the mill motor. Two shifts. — *Line 2* — *"the fast line. Built for volume."* ~**2× Line 1 on whites**; *"that gap seems to shrink for tints, I don't actually know why"*, explicitly not gospel outside whites. **Not piped for clear specialty resins** — *"full stop, that's physical not a preference."* Jam-prone filler. Two shifts. — *Line 3* — *"newest, quick, but still being qualified SKU by SKU."* Two tint SKUs unsigned — *"a QA/engineering decision from before my time."* Day shift only unless OT.

**Families.** Whites / tints / specialty — *"it's really about what a washdown has to deal with, not the product itself."* Flagged: *"I wouldn't swear every tint-to-tint pair is really equal"* (light→light vs light→dark), never separated on the sheet.

### Boundary conditions

| ID | What | Value | Grade |
|---|---|---|---|
| BC-1 | Demand book | Monday-fresh from ERP; **380–420 run-hours/wk**. Rush orders land mid-week — *"rush orders are why the reroute-or-hold and idle-or-washdown calls happen in the first place half the time"* | volume: range. **Arrival pattern OPEN — top tier** |
| BC-2 | Line calendar | L1, L2 two shifts ≈112 h/wk nominal, *"we don't always run weekends flat out — more like five and a half, six days realistically"*; L3 ≈56 h unless OT. Realistic total **270–300 h** | range |
| BC-3 | Crew calendar | Day shift. Nights **unknown** — *"Might be we call someone in. Might be it waits till morning."* | open — crew lead |
| BC-4 | Lab calendar | Day shift, *"maybe with someone covering into evening… impression, not fact"* | open — the lab |
| BC-5 | Resin supply | *"mostly it's just there"*; slips **~monthly**, *"it stalls the run and I have to shuffle around it"* | rate: range; stall duration open |
| BC-6 | Over-commitment | Book always exceeds capacity. *"Every hour lost to a washdown or a jam is an hour I don't have to spare."* Weekend/OT *"a live lever, not a nice-to-have"* | spelled out |

### Activities

| ID | Activity | Duration | Rate | Loss | Grade |
|---|---|---|---|---|---|
| A-1 | Run — Line 2, white, Meridian-sized (line start → last drum; incl. ramp-up, excl. washdown/QC) | **9 h** shortest realistic; **10–11 h** typical (*"the number that's actually on the sheet"*); **14–16 h** bad-not-freak; **~24 h** freak (jam + material stall), *"more 'the terrible day'"* | n/a | — | spread-equivalent, interval-first. **P07 unasked** |
| A-2 | Washdown **tint→white** | **3 h** | n/a | — | number; *"the washdown that overruns"* — overrun spread open |
| A-3 | Changeover **white→tint** | *"a bit of white residue in a tinted batch, who cares, it's getting colour anyway"* — quick | n/a | — | **named, no number** |
| A-4 | Changeover **tint→tint** | **20–30 min** | n/a | — | range; light/dark split suspected, unmeasured |
| A-5 | Changeovers involving **specialty** | — | — | — | **entirely open** |
| A-6 | **Ramp-up after washdown** | — | — | scrap — *"that was the week I rushed the ramp after a washdown"* | **named, magnitude open**; load-bearing for OBJ-2 |
| A-7 | **QC hold** | typical **~4 h**; specialty *"can be a full day"*; decent-week bad case Wed eve→Thu midday (~18 h). **Friday tail open** — *"Friday's usually worse than that, I just don't have a clean anecdote for it yet"* | — | — | typical: number; tails partly qualitative |
| A-8 | **Filler jam** | short **0.5–1 h** (*"four out of five"*); long multi-hour (*"the four-hour kind"*) | **1–2/week plant-wide**; long kind **monthly to every 6 weeks**; *"It's Line 2's filler mostly"* | — | ranges; *"day-to-day impression, not a logged rate"* |
| A-9 | **Mill motor — multi-day** | *"the four-day disaster"* | **1–2/year** (*"three, four times in the years I've been doing this job"*) | — | rate range; duration one anecdote |
| A-10 | **Mill motor — hiccup** | *"a few hours"* | **open** | — | trigger case for OBJ-1 |
| — | **A-9/A-10 instruction** | **Bimodal:** *"either a nuisance under half a day or a genuine disaster, rarely something in the middle."* **Do not fit one smooth distribution across the gap.** | | | |
| A-11 | **Resin stall** | open | ~monthly | — | |
| A-12 | **Requalification** | **OPEN** | n/a | *"eat the requalification headache"*; a **known, bounded** cost | **Load-bearing for OBJ-1, unsized** |
| A-13 | Release to warehouse | terminal | — | — | end of scope |

### Ordering / flow

- **OF-1 spine:** order → orders mapped to runs → run placed on a line → *if family differs, changeover first* → run executes **mix → mill → tint/letdown → fill** as a flow with tanks between, so *"while the back end of a batch is filling, the front end of the next batch could already be mixing, if there's product to feed it"* → **QC hold** → **release to warehouse**.
- **OF-2 order↔run mapping:** lump small same-SKU orders to clear minimum run size; split a big order to interleave a rush job. Split cost = extra changeover + extra ramp-up scrap. **Minimum run size unquantified.**
- **OF-3 line choice:** filtered by C-1/2/3 and POL-1; residual discretion is POL-5.
- **OF-4 blocking (Line 1):** small mill-to-fill tank; fill lags → mill stalls. *"Dead time my sheet never sees."*
- **Volunteered model/reality gap:** the sheet says *"Line 2 busy 06:00–18:00"* and *"doesn't capture that at all"* — *"I genuinely couldn't tell you without going and watching it… the sheet flatters reality."*

### Policies

| ID | Policy | As practiced | Overrides |
|---|---|---|---|
| **POL-1** | Meridian white on Line 2 | Habit calcified into a rule after Meridian audited Line 2's fill area. *"I have never once put a Meridian order on Line 1, even under real pressure"* — with Line 2 down most of a day you held the order and let it run late-ish, *"because breaking that rule felt riskier than a few hours' delay."* Prescribed: nothing written. Practiced: absolute. | *"Treat it as effectively hard."* Breakable only as a what-if — *"not something I'd sanction as a live scheduling option."* |
| **POL-5** | **Reroute or hold** (OBJ-1) | **Your wording:** *"Hold by default, reroute only if staying put jams something you care about more."* Asymmetry: *"requalification is a known, bounded cost and blocking the queue is an unknown, possibly-cascading one… I'll pay a known cost to avoid an unknown one, especially when I'm short on time to think it through properly, which at a 07:30 huddle I always am."* **Attention order:** (1) maintenance — *"is this the twenty-minute reset kind or do I need to be worried"*, *"that answer changes everything downstream"*; (2) the blocked job's own due date — if not screaming, default is wait; (3) **what is stacked behind it in its own line's queue** — *"it wasn't 'specialty vs white' directly — it was 'if I don't clear Line 1's queue now, it backs up onto something that touches the white two days later.'"* **Depth:** *"one hop routinely, two hops only when hop one is already urgent-looking. Past that I'm guessing, not tracing."* **Tier-sensitivity:** *"I trace further and act more readily when I suspect Meridian's at the other end of it than when I don't"*; chain ending at a distributor — *"I'd have shrugged… told the distributor's order it might run a day later, which is exactly the kind of slip that 'nobody notices.'"* **Flips to hold if:** fix under an hour; alternate line already tied up (*"then rerouting isn't even a real option, it's theoretical"*); nothing stacked behind. | **OPEN** — the exception case was asked and not reached |
| **POL-6** | **Idle or washdown** (OBJ-2) | **OPEN — core of OBJ-2.** Situation known, rule absent | open |
| POL-2 | Long washdown pushed overnight | *"tint before white means I'm looking at the long washdown, and I wanted that overnight rather than eating into the day"* | not asked |
| POL-3 | Washdowns to when the crew is on | *"we try to schedule washdowns for when the crew's on"* | night case unknown |
| POL-4 | Avoid stacking family switches | Known by its failure: *"the changeover crew looking wrecked by Thursday because I stacked too many family switches back to back"* | not asked |
| POL-7 | Crew contention | **OPEN.** Symptom only: *"Line 3 sitting clean but idle waiting on the crew — it happens more than I'd like"* | open |
| POL-8 | Lab queue discipline | **OPEN** | open |
| POL-9 | Overtime / weekend | Ops director's call; you supply *"we'll miss X without it"* | — |

### Constraints

C-1 Specialty cannot run on Line 2 (not piped) → must go L1 or L3. C-2 Two tint SKUs not qualified on Line 3 → cannot be scheduled there. C-3 Line 1 qualified for everything → fallback of last resort. C-4 **Minimum run size** → small orders lumped; **threshold unquantified**. C-5 One crew → **one washdown at a time across all three lines**; the other line waits clean and idle. C-6 One lab, two people → queue forms; **parallelism unknown**. C-7 380–420 demanded vs 270–300 available → something slips weekly; OT/weekend is the release valve. C-8 *"due Friday close of business, which for Meridian really means Friday, no wiggle."*

### Dynamics

**D-1 Line 1 mill-to-fill tank level.** Rises when mill outpaces fill, falls as fill proceeds; **rate open**, noise not asked. **Threshold: at full, mill stops and waits**; resets when fill catches up. This is *"the dead time my sheet never sees"* and the reason *"I keep grumbling about Line 1's mill-to-fill tank."*

### Data bindings

DB-1 order arrivals/quantities/due dates/customer ← ERP demand book. DB-2 run durations in run-hours ← your weekly sheet, *"already converted"*. DB-3 per-stage cycle times by product and line ← the historian, *"which — as I said — nobody's done."*

---

## 4. Assumption ledger — mine, not yours

| # | Assumption | Why | Check with |
|---|---|---|---|
| A1 | Crew serves waiting lines **FCFS** | C-5 must arbitrate | You (POL-7) — the Line 3 symptom suggests a real rule exists |
| A2 | Lab works **FIFO** | C-6 must arbitrate | The lab; also whether you expedite |
| A3 | Washdown outside day shift **waits until morning** | BC-3 unknown | Crew lead |
| A4 | Lab has **no night presence** | Your impression, not fact | The lab |
| A5 | Line 2's 2× applies to **whites only** | You warned against extending it | Process engineering, or DB-3 |
| A6 | Ramp-up scrap follows **washdowns**, not every changeover | Inferred from one phrase | You; quality |
| A7 | The ~24 h run is a **roughly annual** tail | Treating one anecdote as a rate is my move | You |
| A8 | Jams are **1–2/wk plant-wide, concentrated on Line 2** | *"mostly"* is directional, not a split | You |
| A9 | POL-5's lookahead is evaluated **at the moment of disruption**, not continuously | Your account is of a 07:30 call | You |
| A10 | "Care about more" = **downstream tier + due-date pressure**, nothing else | Those are the only two factors you named | You |

---

## 5. Losses

**Deliberately out of scope:** upstream order generation; trucking/warehouse/shipping; feedstock planning except resin slips; quarter-scale planning; overtime as a *decision* (modelled as a lever, not a choice, because it isn't yours).

**Deliberately simplified, and what it costs:**
1. **Stage detail inside a run** collapsed to whole-run blocks, *except* Line 1's mill-to-fill blocking (D-1/OF-4). Lost: pipelining gain from overlapping next-batch mix with this-batch fill, which you said physically exists. **This is the simplification most likely to mislead OBJ-3**, since you told me the sheet flatters reality and OBJ-3 asks whether you're leaving hours on the table.
2. **Tint-to-tint collapsed** to one 20–30 min changeover. Lost: any light→dark penalty. Revisit if the model over-favours tint batching.
3. **Queues are not nodes** — waits at crew, lab, and behind a blocked line emerge from the activities either side. No operational loss; you just won't see a box labelled "queue."

**Open and load-bearing — top tier:** POL-6 (OBJ-2 has no rule); BC-1 rush arrivals (*"you'll have modelled the calm week and missed the reason I lose sleep"*); A-12 requalification cost (OBJ-1's trade has one side unpriced — POL-5 says *when* you pay, nothing says *what*).
**Second tier:** POL-7 and POL-8 — both contended resources currently arbitrated by my assumptions; A-6 ramp-up scrap magnitude (OBJ-2 is literally idle hour vs 3 h washdown *plus ramp loss*); A-3 and A-5 durations.
**Third tier:** P07 unasked — one spread, one product, one line, so Lines 1 and 3 have no durations at all; numeric trade weights (commercial); the provisional "better" ranking awaiting your confirmation; A-10 hiccup rate, A-11 stall duration, D-1 tank rate, A-2 overrun spread, A-7 Friday tail, C-4 minimum run size; **POL-5's override case** — a rule without its exception is where simulation and reality diverge.

**Deposits with other people:** crew lead (washdown forced onto nights); the lab (parallel testing, evening cover); process engineering or the historian (does 2× hold outside whites).

**What I do not claim.** This is an elicited model, not a net. The Petri-net scaffold, code obligations, and formal loss report come from your tooling's projection of it — I have not written them, and nothing here is loadable, compiled, or simulated. Two things I'd expect that projection to flag as uncarryable: the **ranked, non-numeric objective weights**, and **POL-5's tier-sensitive lookahead** — *"one hop routinely, two hops only when hop one is already urgent-looking"* is a rule about how far ahead you attend, not a guard on a transition. It will have to be written as code or approximated, and that should be a visible choice, not buried.

**Resumption order, when you have time:** POL-6 → BC-1 rush orders → A-12 requalification → POL-5's override case → POL-7 crew priority → confirm the "better" ranking.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Delivered. This is the handover copy — complete, self-contained, nothing new asked.

---

# Coatings Plant Scheduling Model

**Stopping outcome: `expert-stopped` — partial model with open slots.** Floor met (3 objectives, 6 entity-types, 13 activities, 4 flow nodes). No objective's dependency slice is complete. All values at the grade you gave them.

## Objectives

- **OBJ-1 Reroute or hold** — *"whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2"*; *"run it twice and see which one bites me less."* Depends on POL-5, A-12, ET-1/3, C-1/2/3, POL-1, A-9/10, OF-3. **Partial** — rule present, requalification cost absent.
- **OBJ-2 Idle or washdown** — *"do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now"*; *"almost weekly and it's pure feel."* Depends on POL-6, A-2/3/4/6, ET-4, C-5, BC-1. **Unsupported** — the rule is absent.
- **OBJ-3 Run size & sequencing** — *"whether to split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one of them ships a bit early."* Depends on OF-2, C-4, A-6, A-2/3/4, BC-1, ET-2. **Unsupported** — rush arrivals and minimum run size absent.
- Not yours to test: overtime approval — *"the ops director's call."*

**"Better"** (ranking spelled out, numbers absent). Settled: lateness **and to whom** — *"a late order to Meridian is worse than three late orders to a small distributor."* Settled trade: *"I'll take the scrap spike every time, no contest."* **Provisional, thought aloud:** late-and-who > changeover hours > scrap, *"lost hours cascade into more lateness, whereas scrap is just money."* **Do not build a metric on this until confirmed.** Currency weights open — deposit: commercial.

**Horizon:** rolling week, Monday-fresh, re-runnable at shift grain. **Boundary:** demand book → **release to warehouse after QC hold**. Trucks and warehouse out; QC hold in (*"filled on time and still gone late because the lab backed up on a Friday"*); feedstock out except resin slips (*"otherwise you're modelling a plant that never has a bad Tuesday"*).

## Validation criteria

**VC-1** unwritten rules hold (Meridian white→L2; specialty never L2; two tint SKUs never L3) — *"I'll dismiss it in about ten seconds."* **VC-2** tint→white long, white→tint quick. **VC-3** replay last week: Meridian squeaks by hours, a distributor slides four days *"and nobody blinked"*, the L1 tank issue bites.

## Entity types

**ET-1 Order** — SKU, quantity (drums/bulk litres), due date, **tier (Meridian vs small distributor)**; carries family, due-date hardness, tier; ~**380–420 run-hours/week**. **ET-2 Run** — *"orders are what demand gives me, runs are what I actually schedule"*; one order, or small same-SKU orders lumped; big orders splittable. **ET-3 Line** ×3. **ET-4 Changeover crew** — one crew, two techs, day shift, all lines *(contended)*. **ET-5 QC lab** — one lab, two people, all lines *(contended)*. **ET-6 Stage** — mix → mill → tint/letdown → fill, small tanks between.

**Line 1** *"old workhorse… slower, most flexible, qualified for everything… the one you send something to when nowhere else can take it"*; small mill-to-fill tank; mill motor; two shifts. **Line 2** *"the fast line"*, ~**2× L1 on whites**, gap *"seems to shrink for tints"* — not gospel outside whites; **specialty physically impossible**; jam-prone filler; two shifts. **Line 3** newest, quick, **two tint SKUs unqualified**; day shift unless OT.

**Families** whites / tints / specialty — *"about what a washdown has to deal with."* Caveat: *"I wouldn't swear every tint-to-tint pair is really equal."*

## Boundary conditions

**BC-1** book 380–420 h/wk, Monday-fresh; **rush arrivals OPEN — top-tier gap** (*"why the reroute and idle calls happen in the first place half the time"*). **BC-2** L1/L2 ≈112 h nominal but *"five and a half, six days realistically"*; L3 ≈56 h; realistic total **270–300 h**. **BC-3** crew day shift; nights unknown (*"Might be we call someone in. Might be it waits till morning"*). **BC-4** lab day shift, evening cover uncertain, *"impression, not fact."* **BC-5** resin slips **~monthly**, stall duration open. **BC-6** demand always exceeds capacity — *"every hour lost to a washdown or a jam is an hour I don't have to spare."*

## Activities

| ID | Duration | Rate | Notes |
|---|---|---|---|
| **A-1** Run, L2 white, Meridian-sized | **9 h** low, **10–11 h** typical, **14–16 h** bad, **~24 h** freak (*"the terrible day"*) | — | spread-equivalent, interval-first. **P07 unasked** |
| **A-2** Washdown tint→white | **3 h** | — | number only; overruns mentioned, unquantified |
| **A-3** Changeover white→tint | quick — *"who cares, it's getting colour anyway"* | — | **no number** |
| **A-4** Changeover tint→tint | **20–30 min** | — | light/dark split unmeasured |
| **A-5** Specialty changeovers | — | — | **entirely open** |
| **A-6** Ramp-up after washdown | — | — | scrap loss named, **magnitude open**; load-bearing for OBJ-2 |
| **A-7** QC hold | ~**4 h** typical; specialty *"a full day"*; mid-week bad case ~18 h; **Friday tail open** | — | *"Friday's usually worse than that"* |
| **A-8** Filler jam | short **0.5–1 h** (four in five); long multi-hour | **1–2/wk plant-wide**; long **monthly–6-weekly**; *"Line 2's filler mostly"* | *"impression, not a logged rate"* |
| **A-9** Mill motor, multi-day | *"the four-day disaster"* | **1–2/yr** | |
| **A-10** Mill motor, hiccup | *"a few hours"* | **open** | |
| — | **Bimodal instruction:** *"either a nuisance under half a day or a genuine disaster, rarely something in the middle."* No smooth continuum. | | |
| **A-11** Resin stall | open | ~monthly | |
| **A-12** Requalification | **OPEN** | — | *"a known, bounded cost"*; **OBJ-1's unpriced side** |
| **A-13** Release to warehouse | terminal | | |

## Flow

**OF-1** order → mapped to runs → placed on a line → changeover if family differs → mix/mill/letdown/fill as a flow (*"while the back end of a batch is filling, the front end of the next batch could already be mixing"*) → QC hold → release. **OF-2** lump small same-SKU orders; split big orders for rush jobs; split cost = extra changeover + extra ramp scrap; **minimum run size unquantified**. **OF-3** line choice = C-1/2/3 + POL-1, residual discretion = POL-5. **OF-4** L1 tank blocking — *"dead time my sheet never sees."* Volunteered gap: the sheet *"flatters reality"*; whether L2 is truly busy 06:00–18:00, *"I couldn't tell you without going and watching it."*

## Policies

- **POL-1 Meridian white on Line 2** — audit-born habit; *"I have never once put a Meridian order on Line 1, even under real pressure"*; you held an order late-ish rather than move it. **Effectively hard**; breakable only as a what-if. (Prescribed: unwritten. Practiced: absolute.)
- **POL-5 Reroute or hold** — *"Hold by default, reroute only if staying put jams something you care about more."* Asymmetry: *"requalification is a known, bounded cost and blocking the queue is an unknown, possibly-cascading one… especially when I'm short on time to think it through properly, which at a 07:30 huddle I always am."* Attention: (1) maintenance — *"is this the twenty-minute reset kind or do I need to be worried"*; (2) blocked job's own due date; (3) what's stacked behind it — *"it wasn't 'specialty vs white' directly."* Depth: *"one hop routinely, two hops only when hop one is already urgent-looking. Past that I'm guessing."* Tier: *"I trace further and act more readily when I suspect Meridian's at the other end."* Flips to hold if fix <1 h, alternate line tied up, or nothing behind. **Override case OPEN.**
- **POL-6 Idle or washdown — OPEN, core of OBJ-2.**
- **POL-2** long washdown overnight. **POL-3** washdowns to when the crew is on. **POL-4** avoid stacking family switches (*"the crew looking wrecked by Thursday"*). **POL-7 crew contention OPEN** (symptom: *"Line 3 sitting clean but idle"*). **POL-8 lab discipline OPEN.** **POL-9** OT is the ops director's call.

## Constraints

C-1 no specialty on L2 (physical). C-2 two tint SKUs not on L3. C-3 L1 qualified for all — last resort. C-4 minimum run size, **unquantified**. C-5 **one washdown at a time plant-wide**; others wait clean and idle. C-6 one lab, two people; **parallelism unknown**. C-7 380–420 vs 270–300 → something slips weekly. C-8 *"Friday close of business, which for Meridian really means Friday, no wiggle."*

## Dynamics

**D-1 L1 mill-to-fill tank** — rises when mill outpaces fill, **rate open**; **threshold: at full, mill stops and waits**; resets when fill catches up.

## Data bindings

DB-1 orders ← ERP book. DB-2 run-hours ← your sheet (already converted). DB-3 per-stage cycle times ← historian, *"nobody's done"* it.

---

## Assumption ledger (mine, not yours)

1. Crew serves FCFS — check with you; the L3 symptom suggests a real rule. 2. Lab FIFO — check with lab. 3. Night washdown waits till morning — crew lead. 4. No lab night presence — the lab. 5. L2's 2× is whites-only, not extended — process engineering/historian. 6. Ramp scrap follows washdowns, not all changeovers — you/quality. 7. The ~24 h run is roughly annual (one anecdote read as a rate) — you. 8. Jams 1–2/wk plant-wide concentrated on L2, not per line — you. 9. POL-5 lookahead evaluated at the moment of disruption, not continuously — you. 10. "Care about more" = downstream tier + due-date pressure only — you.

## Losses

**Out of scope:** upstream order generation; logistics; feedstock planning bar resin slips; quarter horizon; OT as a decision.

**Simplified, with cost:** (1) stage detail collapsed to run blocks except L1 tank blocking — loses pipelining gain; **most likely to mislead OBJ-3**, since the sheet flatters and OBJ-3 asks whether hours are being left on the table. (2) tint→tint collapsed to one changeover — loses any light→dark penalty. (3) queues are not nodes — they emerge from the activities either side.

**Open, top tier:** POL-6; BC-1 rush arrivals (*"you'll have modelled the calm week and missed the reason I lose sleep"*); A-12 requalification. **Second:** POL-7, POL-8 (both bottlenecks on my assumptions); A-6 scrap magnitude; A-3, A-5. **Third:** P07 across lines/families — Lines 1 and 3 have no durations at all; numeric trade weights; the provisional ranking; A-10 rate, A-11 duration, D-1 rate, A-2 overrun, A-7 Friday tail, C-4 threshold; POL-5's override case.

**Deposits with others:** crew lead (night washdown), lab (parallelism, evening cover), process engineering/historian (2× outside whites).

**Not claimed:** this is an elicited model, not a net. Your tooling's projection produces the Petri-net scaffold, code obligations, and formal loss report — nothing here is loadable, compiled, or simulated. Expect two items to project badly: the ranked non-numeric weights, and POL-5's tier-sensitive lookahead (*"one hop routinely, two hops only when hop one is already urgent-looking"* is not a guard on a transition). Both will need code or approximation — make that a visible choice.

**When you resume:** POL-6 → rush orders → requalification → POL-5's exception → crew priority → confirm the ranking.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

Here it is — final, complete, and the last thing I'll send.

---

# Coatings Plant Scheduling Model — handover

**Stopping outcome: `expert-stopped` — partial model with open slots.** Floor met (3 objectives, 6 entity-types, 13 activities, 4 flow nodes). No objective's slice is complete. Every value is at the grade you gave it; nothing promoted, nothing invented.

## Objectives

**OBJ-1 Reroute or hold** — *"whether to shift the specialty over to Line 3 and eat the requalification headache, or hold it and let the white slip behind on Line 2"*; *"run it twice and see which one bites me less."* → POL-5, A-12, ET-1/3, C-1/2/3, POL-1, A-9/10, OF-3. **Partial: rule present, cost absent.**

**OBJ-2 Idle or washdown** — *"do I sit Line 2 empty for an hour waiting on a same-family order, or just pay the three-hour washdown now"*; *"almost weekly and it's pure feel."* → POL-6, A-2/3/4/6, ET-4, C-5, BC-1. **Unsupported: no rule.**

**OBJ-3 Run size & sequencing** — *"split a big order into two runs to slot in a rush job, or batch several small orders of the same family together even if it means one ships a bit early."* → OF-2, C-4, A-6, A-2/3/4, BC-1, ET-2. **Unsupported: no rush arrivals, no minimum run size.**

Not yours: overtime approval — *"the ops director's call."*

**"Better"**: ranking spelled out, numbers absent. Settled — lateness **and to whom** (*"a late order to Meridian is worse than three late orders to a small distributor"*); *"I'll take the scrap spike every time, no contest."* Provisional, thought aloud, **do not build a metric on it yet** — late-and-who > changeover hours > scrap, *"lost hours cascade into more lateness, whereas scrap is just money."* Currency weights open; deposit: commercial.

**Horizon** rolling week, Monday-fresh, re-runnable at shift grain. **Boundary** demand book → release to warehouse after QC hold; trucks/warehouse out; QC hold in (*"filled on time and still gone late because the lab backed up on a Friday"*); feedstock out except resin slips (*"otherwise you're modelling a plant that never has a bad Tuesday"*).

## Validation

**VC-1** unwritten rules hold — Meridian white→L2, specialty never L2, two tint SKUs never L3 (*"I'll dismiss it in about ten seconds"*). **VC-2** tint→white long, white→tint quick. **VC-3** replay last week — Meridian squeaks by hours, distributor slides four days *"and nobody blinked"*, L1 tank issue bites.

## Entity types

**ET-1 Order** — SKU, quantity (drums/bulk litres), due date, **tier**; carries family, due-date hardness, tier; **380–420 run-hours/wk**. **ET-2 Run** — *"orders are what demand gives me, runs are what I actually schedule"*; lumped or split. **ET-3 Line** ×3. **ET-4 Changeover crew** — one crew, two techs, day shift, all lines *(contended)*. **ET-5 QC lab** — one lab, two people *(contended)*. **ET-6 Stage** — mix → mill → letdown → fill, small tanks between.

**L1** *"old workhorse… slowest, most flexible, qualified for everything"*; small mill-to-fill tank; mill motor; two shifts. **L2** *"the fast line"*, ~2× L1 **on whites only** (gap *"seems to shrink for tints"*); specialty physically impossible; jam-prone filler; two shifts. **L3** newest, quick, two tint SKUs unqualified; day shift unless OT.

**Families** whites/tints/specialty — *"about what a washdown has to deal with."* Caveat: *"I wouldn't swear every tint-to-tint pair is really equal."*

## Boundary conditions

**BC-1** 380–420 h/wk; **rush arrivals OPEN, top-tier**. **BC-2** L1/L2 ≈112 h nominal but *"five and a half, six days realistically"*; L3 ≈56 h; realistic **270–300 h**. **BC-3** crew day shift, nights unknown. **BC-4** lab day shift, evening cover *"impression, not fact."* **BC-5** resin slips ~monthly, stall duration open. **BC-6** demand always exceeds capacity.

## Activities

**A-1** L2 white run: **9 h** low / **10–11 h** typical / **14–16 h** bad / **~24 h** freak; P07 unasked. **A-2** washdown tint→white **3 h** (overruns unquantified). **A-3** white→tint quick, **no number**. **A-4** tint→tint **20–30 min**. **A-5** specialty changeovers **open**. **A-6** ramp-up scrap named, **magnitude open**. **A-7** QC hold ~**4 h** typical, specialty *"a full day"*, mid-week bad ~18 h, **Friday tail open**. **A-8** filler jam 0.5–1 h (four in five) / multi-hour; **1–2/wk plant-wide**, long kind monthly–6-weekly, *"Line 2's filler mostly"*. **A-9** mill motor multi-day, **1–2/yr**. **A-10** hiccup *"a few hours"*, rate open. **Bimodal instruction:** *"either a nuisance under half a day or a genuine disaster, rarely something in the middle."* **A-11** resin stall. **A-12 requalification — OPEN**, OBJ-1's unpriced side. **A-13** release.

## Flow

**OF-1** order → runs → line → changeover if family differs → mix/mill/letdown/fill as a flow → QC hold → release. **OF-2** lump small same-SKU orders; split big ones for rush jobs; split cost = extra changeover + ramp scrap; minimum size unquantified. **OF-3** line choice = constraints + POL-1, residual = POL-5. **OF-4** L1 tank blocking, *"dead time my sheet never sees."* Volunteered: the sheet *"flatters reality."*

## Policies

**POL-1** Meridian white on L2 — audit-born habit, *"never once… even under real pressure"*; effectively hard, breakable only as a what-if. **POL-5** *"Hold by default, reroute only if staying put jams something you care about more"*; known-bounded cost preferred over unknown-cascading; attention order motor → own due date → what's stacked behind; depth *"one hop routinely, two hops only when hop one is already urgent-looking"*; traces further when Meridian is at the end; flips to hold if fix <1 h, alternate line busy, or nothing behind. **Override case OPEN.** **POL-6 OPEN** (OBJ-2's core). **POL-2** long washdown overnight. **POL-3** washdowns when crew is on. **POL-4** avoid stacking family switches. **POL-7 crew contention OPEN**. **POL-8 lab discipline OPEN**. **POL-9** OT not yours.

## Constraints

C-1 no specialty on L2. C-2 two tint SKUs off L3. C-3 L1 does everything. C-4 minimum run size, unquantified. C-5 one washdown at a time plant-wide. C-6 one lab, parallelism unknown. C-7 380–420 vs 270–300. C-8 *"Friday really means Friday, no wiggle."*

## Dynamics

**D-1** L1 mill-to-fill tank — rises when mill outpaces fill (**rate open**); at full, **mill stops and waits**; resets when fill catches up.

## Data bindings

DB-1 orders ← ERP. DB-2 run-hours ← your sheet. DB-3 per-stage cycle times ← historian, *"nobody's done"* it.

---

## Assumption ledger (mine)

1 crew FCFS · 2 lab FIFO · 3 night washdown waits till morning · 4 no lab nights · 5 2× is whites-only · 6 ramp scrap after washdowns only · 7 24 h run ≈ annual · 8 jams plant-wide, L2-concentrated · 9 POL-5 evaluated at disruption · 10 "care about more" = tier + due-date pressure only. Checks: you, the lab, the crew lead, process engineering.

## Losses

**Out:** upstream sales, logistics, feedstock planning, quarter horizon, OT as a decision.
**Simplified:** stage detail collapsed except L1 blocking — **most likely to mislead OBJ-3**; tint→tint collapsed; queues emerge rather than being nodes.
**Open, top tier:** POL-6; rush arrivals (*"you'll have modelled the calm week and missed the reason I lose sleep"*); A-12. **Second:** POL-7/8, A-6 magnitude, A-3, A-5. **Third:** P07 — Lines 1 and 3 have no durations at all; trade weights; the provisional ranking; A-10, A-11, D-1, A-2, A-7, C-4; POL-5's exception.
**Deposits:** crew lead, lab, process engineering.
**Not claimed:** this is an elicited model, not a net. Your tooling projects the scaffold; nothing here is loadable or simulated. Expect the non-numeric ranking and POL-5's tier-sensitive lookahead to need code or approximation — make that visible, not buried.

**Resume at:** POL-6 → rush orders → requalification → POL-5's exception → crew priority → confirm the ranking.

That's everything. Thanks for the time you gave it.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.
