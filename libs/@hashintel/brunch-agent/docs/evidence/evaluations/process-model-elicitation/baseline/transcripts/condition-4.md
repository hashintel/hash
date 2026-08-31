# Baseline control — condition 4 (rendered repertoire + plugin definition, prompt only)

- Run started: 2026-08-25T15:14:42.641Z
- Interviewer: claude-opus-5 + condition-4-prompt.md + rendered repertoire.yaml + plugin-sdcpn/plugin.yaml (see condition-4-system.md)
- Simulated expert: claude-sonnet-5 + situation-pack.md
- Interviewer turns: 22 (impatience probe at 8, forced wrap at 20)
- Stop reason: delivered-after-forced-wrap
- Tokens: 720412 in (+0 cache write, +0 cache read) / 40823 out across 64 calls

---
**Opening message**:

I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

---

**Interviewer**:

Good — that's enough for me to start. I'll ask you about your operation in your own words; the format side is my problem, not yours.

Before anything about how the plant is built, I want to know what the model has to be *for*. Two things to start:

1. When your boss says "test scheduling decisions before making them" — what's a decision you'd actually want to test? Give me a real one you've argued about recently, not a general category.

2. And when you compare two schedules today, what makes one better than the other in your eyes? I'm after the thing you'd actually point at — a number, a complaint you'd avoid, whatever it is.

---

**Expert (Marta)**:

Okay, real one: two weeks ago I had a Meridian white order finishing on Line 2 Thursday afternoon, and then a batch of tint waiting behind it. My instinct was to let Line 2 sit idle for maybe an hour because I had a heads-up another same-family white order was about to drop in from a distributor, and doing them back to back would save us a full washdown. My boss's question was basically "are you sure that's worth it, or are you just guessing?" And honestly — I was guessing. That's the kind of thing I'd love to test: hold the line versus wash it down now, which one actually costs less over the week.

As for what makes one schedule better than another — first thing I look at is whether Meridian shipped on time, full stop, that's non-negotiable. After that it's changeover hours, because every hour the crew spends washing down is an hour not filling anything. And honestly I also just glance at how ugly the sheet looks — like, are there gaps where a line's sitting idle for no good reason. That last one's not a number, it's more a gut check, but it's real.

---

**Interviewer**:

That's a good, concrete decision — hold the line for a possible same-family order versus wash down now. I'll build the model so that's testable.

Two things about "better", then I'll get you to walk me through a job:

1. Meridian on-time is non-negotiable — what does "on time" actually mean in practice? A ship date on the order, a truck appointment, a promised week? And what happens when one *does* go late — who feels it and how?

2. Changeover hours versus a late non-Meridian order: if a schedule saved you, say, four changeover hours but made one distributor order two days late, would you take it? I'm trying to find out whether these trade against each other at all, or whether lateness for everyone else is just soft.

---

**Expert (Marta)**:

Good questions, let me take them separately.

On "on time" for Meridian — it's a ship date they give us via the order, usually with a delivery window attached, like a specific dock appointment on their end. So it's not just "shipped this week," it's "shipped in time to hit that appointment," which usually means it needs to leave our dock a day ahead for freight. If we miss it, first thing is a fine — I don't see the number, that's commercial's problem, but I hear about it. Second thing, worse honestly, is they track our on-time percentage and if it drops too far they threaten to delist SKUs. That's happened to a competitor of ours, so it's not an empty threat, and it's why the rule is absolute — we don't even try to be clever about it.

On the trade-off — honestly, yes, I'd take that trade most of the time, four hours of changeover is real money and crew time, and a distributor slipping two days is usually just an annoyed phone call from our sales rep, not a fine. But "most of the time" is doing a lot of work in that sentence — if it's the same distributor slipping late for the third week running, that's different, they'll start asking for a discount. So it's soft, but it's not infinitely soft. I couldn't put a number on it though — that's genuinely a "sit down with commercial" conversation, nobody's ever made me quantify it.

---

**Interviewer**:

That's clear, and I'll record the trade-off as deliberately unquantified rather than invent a weight — I'll flag it as needing commercial, since you've told me exactly where the number would come from.

Now let's get the structure. Take that Meridian white order from two weeks ago and walk me through it as a sequence — from the moment it lands on your desk to the moment it's off the dock. Keep it to the main steps, five or six; I'll dig into each one after.

---

**Expert (Marta)**:

Sure, let me walk it through.

1. **It lands in the demand book** — comes over from ERP on the weekly pull, SKU, quantity, due date, flagged Meridian so it jumps to the top of my attention.
2. **I allocate it to Line 2** — that's not really a decision, Meridian whites always go to Line 2, that's just how it's done here.
3. **It sits in the queue behind whatever's running** — depending what's ahead of it, sometimes I'll reorder things a bit so it doesn't get stuck behind a big changeover.
4. **Changeover if needed, then it runs** — mix, mill, tint or straight through if it's a plain white, then fill and pack. For a white that's usually the more straightforward path.
5. **It goes into QA hold** — every batch does, typically a few hours before it's released.
6. **Once released, it's staged for shipping** — and that's when the truck appointment matters, because if QA's backed up on a Friday afternoon, that's where it actually goes sideways, not on the line.

That's the whole arc, really — desk to dock. The QA step is the one people don't think about when they're mad at scheduling; half the time a "late" order was actually sitting done in QA hold waiting for the lab to get to it.

---

**Interviewer**:

That QA point is exactly the kind of thing that gets left out of a first account — I'll come back to it properly.

First let me pin down what you're actually scheduling. You said "Meridian white order", "a batch of tint", "same-family white". Three things:

1. Is the thing you schedule the *order*, or does an order get broken into batches that could run at different times? What's the relationship?

2. What are the families? You used "same-family white" as if it's a defined grouping — is that a formal thing on the SKU, or your judgment?

3. And how many lines are there, besides Line 2?

---

**Expert (Marta)**:

1. Mostly the order *is* the batch, if it fits a reasonable run size — a lot of our orders are big enough that we just run the whole thing as one batch. But sometimes I'll split one: if a distributor orders more than makes sense in a single run, or if I need to interleave it with something more urgent, I'll chop it into two batches and run them at different times. So it's order-to-batch most of the time, but not a strict one-to-one — I have the freedom to split if I need to.

2. The families are real, they're on the SKU — every product's either a base white, a tinted colour, or a specialty clear. That's not my judgment, that's how the SKU's classified in the system, it drives what changeover you need going in and out. "Same-family" just means two SKUs both being whites, or both being tints, so the changeover between them is the cheap quick-rinse kind instead of the expensive family-switch kind.

3. Three lines total. Line 1's the old workhorse — slower but it's qualified for everything, including specialty. Line 2's the fast one, that's your big-volume runner. Line 3's the newest and quickest, but it's still being qualified product by product, so it can't run everything yet.

---

**Interviewer**:

Changeover is at the heart of the decision you want to test, so let's do it properly.

You've named two kinds: the quick rinse between same-family SKUs, and the full washdown on a family switch. For the **quick rinse between two whites on Line 2** — the exact case from two weeks ago:

1. Typically, how long does it take, start to finish, before the next batch is filling?
2. One time in ten it goes worse than — what?
3. And one time in ten it's better than — what?

Give me the crew time too if it differs from line downtime.

---

**Expert (Marta)**:

For a straight white-to-white rinse on Line 2:

1. Typically? Call it 25 minutes, start to finish, before the fill head's actually running clean product again.
2. Worse case — one time in ten it drags to maybe 45 minutes, usually because the tech's tied up finishing something on another line first and there's a wait before they even start on Line 2.
3. Better case — one time in ten, if the tech's standing right there and it's a genuinely easy one, 15 minutes and you're rolling again.

Crew time and line downtime are basically the same thing here — it's quick enough that the tech's on it start to finish, no gap between "crew starts" and "line stops." That's different from the big washdowns, where the line's down way longer than the crew's actually hands-on, because there's soak time and QA checks in between.

---

**Interviewer**:

That distinction — line down longer than crew hands-on — matters, so let's get the washdown with both.

For a **family switch on Line 2**, say white to tint: typically how long is the line down, one time in ten worse than, one time in ten better than? And roughly how much of that is the tech actually hands-on?

Also: does it depend on direction — is tint-to-white the same as white-to-tint?

---

**Expert (Marta)**:

It absolutely depends on direction — that's the thing people forget.

**White to tint**, the easier direction: line's down typically about 45 minutes. Worse case, maybe an hour and a bit if the tech gets pulled away partway through. Better case, if everything's staged, maybe half an hour. Of that, the tech's hands-on for most of it — this one doesn't have much soak-and-wait, it's mostly just doing the work.

**Tint to white** is the ugly one, because any pigment left behind ruins a white batch, so it's a full washdown. Typically about 3 hours, line down the whole time. Worse case — if it doesn't pass the visual check first time and they have to redo part of it — could stretch to 4, maybe a bit more. Better case, a clean fast one, maybe 2 hours if the crew's good and nothing complicates it. Hands-on time for the crew is actually less than the 3 hours suggests — there's real soak and rinse-cycle time where the tech's not standing there, they might duck off to start something on another line. I'd guess they're actually working maybe half of that, the rest is the line just being down waiting on the process.

So no, it is absolutely not symmetric, and it trips people up if they assume it is.

---

**Interviewer**:

Good — asymmetric, and I've got both directions.

Two things to close out changeover:

1. Specialty clear is the third family — what does going into and out of clear cost, on Line 1 since that's the one qualified for it? Same shape of answer: typical, one-in-ten worse, one-in-ten better, either direction if they differ.

2. Do the white/tint numbers you just gave me hold on Line 1 and Line 3, or are they line-specific?

---

**Expert (Marta)**:

1. Specialty is roughly the same both directions, unlike white/tint — call it 2 hours typical, either going in or coming out. Worse case, maybe 3 hours if it's coming out of clear and they're being extra careful about residue, since clear can be sneaky — you don't always see it the way you'd see pigment. Better case, maybe an hour and a half if it's a quick swap and the line was already fairly clean. Hands-on for the crew is most of that — specialty doesn't have the long soak cycles the tint-to-white washdown has, it's more just physically thorough cleaning because the product's thick and clingy.

2. Honestly, I've mostly been quoting you Line 2 numbers because that's where the argument happened. I *think* the same rough shape holds on Line 1 — quick rinse cheap, tint-to-white expensive and slow, white-to-tint quicker — but I couldn't swear the minutes are identical. Line 1's older, the crew sometimes says it's fussier to get properly clean. Line 3 I genuinely don't have a good feel for, because it hasn't run enough different products yet to have built up war stories — it's still mostly running whatever it's been qualified for, which so far is mostly one or two SKUs. So if you need Line 3 numbers, that might be one where you're stuck assuming it's like Line 1 or Line 2 until we've got more history.

---

**Interviewer**:

That's the right answer — I'd rather have "I don't know" than invented minutes. Here's what I'd assume unless you tell me otherwise, and I'll mark it as mine, not yours:

- **Line 1**: same shape as Line 2, with all changeover durations scaled up — say 20% longer — on the strength of the crew's "fussier to get properly clean".
- **Line 3**: same as Line 2 until history exists.

Both would be checked against the changeover logs, if the techs record start and finish. Does 20% sound like the right order of magnitude for Line 1, or is it more like double?

Separately — you just said something important in passing. The tech "gets pulled away partway through", "might duck off to start something on another line". How many changeover techs are there across the three lines?

---

**Expert (Marta)**:

20% sounds about right, not double — it's more "takes a bit longer to satisfy the visual check" than "fundamentally slower." Double would be if we were talking about the mill motor issue or something structurally different. So yeah, 20% longer on Line 1 feels like the right order of magnitude, not a multiplier like 2x.

On the crew — there's two techs on day shift covering all three lines between them. That's it. No dedicated tech per line. So if Line 1 and Line 3 both want a washdown at the same time, one of them waits, and that's the bit that actually causes grief at the huddle — it's not that the changeover itself is unpredictable, it's that the crew's a shared resource and sometimes there's a queue for them before the clock even starts on the line.

(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)

---

**Interviewer**:

Ten minutes is enough for one thing, so let me tell you where we are and then ask the one that matters most.

**What I have:** the two objectives, the six-step arc, three lines, three families, all the changeover numbers for Line 2 with spreads, the asymmetry, the two techs as a shared resource.

**What's still missing** — roughly six or seven things, and two of them are load-bearing for the exact decision you want to test:

- how long a batch actually *runs* (I have changeovers but no run times at all)
- how the "heads-up another order was about to drop" actually reaches you — that's the trigger your whole hold-the-line decision hangs on
- QA hold as a spread, and whether the lab is a shared resource like the techs
- the order arrival pattern off the ERP weekly pull
- run sizes and what splitting a batch costs
- which SKUs Line 3 is actually qualified for
- what breaks, and how often

None of that needs to happen now. My question for the remaining minutes, because it's the one I can't guess and it's the one that made you say "grief at the huddle":

**When both lines want a washdown at once and one tech has to pick — what actually decides it?** Not the rule as posted. Think of the last time it happened: which line got the tech, and what was the reason?

---

**Expert (Marta)**:

Honestly, there's no posted rule at all — it's whoever's louder at the huddle, or whoever's about to actually run dry.

Last time it happened, off the top of my head — Line 1 and Line 3 both wanted a washdown same morning. Line 3 got the tech first, not because it was more important, but because Line 3's changeover was the quick one and Line 1's was going to be the long tint-to-white slog anyway, so the thinking was "knock out the fast one, get that line moving, then commit the tech to the long one." Line 1 sat clean-but-waiting for almost 40 minutes past when it could've started.

If you push me on the actual logic — it's mostly gut triage: whichever line has the more time-sensitive order behind it wins, and if that's a tie, whichever changeover is faster wins so you get a line moving sooner. Nobody writes this down, it's literally whoever's standing at the huddle table making the case loudest. I've been overruled by the ops director once when he wanted his pet SKU out the door.

I do need to run — but this was useful, come back to the QA and run-time stuff next time, those are real gaps.

---

**Interviewer**:

You've stopped, so I'm not opening anything new. Here's the model as it stands, read back item by item, with the gaps named honestly. The two things you flagged — QA and run times — are the first things on the list when you're back.

---

# 1. The model

Vocabulary is yours throughout. Each slot shows the value **and** the precision actually obtained. `⚠` marks a slot the model demands and does not yet have.

## Objectives

**O1 — "Hold the line versus wash it down now, which one actually costs less over the week"**
- *The question, in your words:* whether letting Line 2 sit idle for ~1 hour waiting on an anticipated same-family white order is cheaper over a week than washing down to the tint batch now. — **spelled out**
- *Depends on:* E1 Order, E2 Batch, E3 Line, E4 Changeover tech, B1 ERP weekly pull, B2 mid-week order drop-in, A4/A5/A6 changeovers, A8 run batch, A9 QA hold, F1 main arc, P1, P3, P5, C2, C4.
- *What "better" means:* changeover hours consumed over the week, subject to O2 holding absolutely. — **named, not quantified against O4** ⚠

**O2 — "Meridian shipped on time, full stop, that's non-negotiable"**
- *The question:* does every Meridian order leave the dock in time for its dock appointment. — **spelled out**
- *"On time" =* ship date + delivery window given on the order, resolving to a specific dock appointment their end; must leave our dock **one day ahead** for freight. — **spelled out**
- *Consequence of a miss:* a fine (amount not visible to you — commercial's) and a hit to the tracked on-time percentage; if that drops far enough, threatened SKU delisting — a competitor has been delisted, so it's treated as real. — **spelled out, unquantified** ⚠
- *Depends on:* A9 QA hold, A10 stage & ship, C4, P1, P2, B3.

**O3 — Changeover hours**
- *The question:* how many crew-hours go into washdowns rather than filling. "Every hour the crew spends washing down is an hour not filling anything." — **spelled out**
- *Depends on:* A4, A5, A6, A7, E4, C2, P3.

**O4 — "How ugly the sheet looks" — idle gaps with no good reason**
- *The question:* are lines sitting idle for no good reason. — **spelled out**
- *"Better" =* explicitly a gut check, not a number, "but it's real". — **your words: not quantified** ⚠ (IR-only; see §3)

**Trade-off between O2, O3 and lateness for non-Meridian:** you would take 4 changeover hours saved against one distributor order two days late "most of the time" — a distributor slip is "an annoyed phone call from our sales rep, not a fine" — but the same distributor slipping three weeks running turns into a discount demand. So: soft, not infinitely soft, **and deliberately unquantified**. Deposit: you named the source — "sit down with commercial". Nobody has ever made you quantify it. ⚠

## Entity types

**E1 — Order (from the demand book)**
- *Distinctions the process treats apart:* Meridian vs. non-Meridian (Meridian "jumps to the top of my attention", on-time absolute); family classification on the SKU. — **spelled out**
- *State riding along:* SKU, quantity, due date + delivery window, Meridian flag, family (base white / tinted colour / specialty clear — a real field in the system, not your judgment). — **spelled out**
- *How many / population shape:* ⚠ not obtained — arrival volume per weekly pull unknown.

**E2 — Batch**
- *Distinctions:* same three families as the order it came from. — **spelled out**
- *Relationship to order:* "mostly the order *is* the batch, if it fits a reasonable run size"; you may split into two batches run at different times when a distributor orders more than makes sense in one run, or to interleave something more urgent. Not a strict one-to-one; the split is your discretion. — **spelled out**
- *Population shape:* ⚠ run sizes not obtained; cost of a split not obtained.

**E3 — Line** — a contended resource
- *Distinctions:* **Line 1** — "the old workhorse", slower, qualified for everything including specialty, crew say it's "fussier to get properly clean". **Line 2** — the fast one, big-volume runner. **Line 3** — newest and quickest, still being qualified product by product, "can't run everything yet", so far mostly one or two SKUs. — **spelled out**
- *State riding along:* which family the line is currently dirty with (this is what selects the changeover); qualification set. — **spelled out**
- *How many:* 3. — **number**

**E4 — Changeover tech** — a contended resource
- *Distinctions:* none stated between the two techs. — **named**
- *State riding along:* which line they're currently committed to; can be "pulled away partway through". — **spelled out**
- *How many:* 2 on day shift, covering all three lines, no dedicated tech per line. — **number**

**E5 — QA lab**
- *Distinctions / state / population:* ⚠ nothing obtained beyond its existence and that it can be "backed up on a Friday afternoon". Whether it's a shared resource like the techs is an open question you and I both flagged.

## Boundary conditions

**B1 — ERP weekly pull into the demand book**
- *Starting state:* orders arrive over from ERP on the weekly pull, carrying SKU, quantity, due date, Meridian flag. — **spelled out**
- *Arrival pattern:* ⚠ **not obtained** — no volume, no spread, no within-week shape. Demanded as a spread.

**B2 — Mid-week order drop-in ("another same-family white order was about to drop in from a distributor")**
- *Starting state / pattern:* ⚠ **not obtained.** This is the trigger the whole of O1 hangs on and I have only the one anecdote: you had "a heads-up". How that heads-up reaches you, from whom, how far ahead, and how often it turns out to be right are all unknown. Demanded as a spread; currently zero.

**B3 — Meridian dock appointment**
- *Pattern:* ship date with a delivery window on the order, resolving to a specific dock appointment their end. — **spelled out**
- *Distribution of lead time:* ⚠ not obtained.

**B4 — Tech availability calendar**
- ⚠ only "two techs on day shift" obtained. Whether there is any night/weekend changeover coverage was never asked.

**B5 — Line 3 qualification set at start of run**
- ⚠ "mostly one or two SKUs" — **not spelled out**; which SKUs is unknown.

## Activities

**A1 — Lands in the demand book** — *needs:* the weekly ERP pull. *Produces:* an Order in the book, Meridian-flagged or not. *Performed by:* ERP / not attended. *Duration:* n/a (instantaneous receipt). **spelled out**

**A2 — Allocate to a line** — *needs:* an order in the book. *Produces:* order assigned to a line. *Performed by:* you. *Duration:* not a scheduling constraint; "not really a decision" for Meridian whites. **spelled out** (rule in P1)

**A3 — Reorder the queue** — *needs:* an order sitting behind others. *Produces:* changed run sequence. *Performed by:* you. *Rule:* P4. — **spelled out**

**A4 — Quick rinse (same family, e.g. white → white) on Line 2**
- *Needs:* line free, previous batch off, a tech available, next SKU same family. *Produces:* line clean for next batch, fill head running clean product.
- *Performed by:* 1 changeover tech. — **named**
- *Duration (line down):* typical **25 min**; one-in-ten worse **45 min** (tech tied up finishing on another line, so a wait before they even start); one-in-ten better **15 min** (tech standing right there, genuinely easy one). — **spread**
- *Crew hands-on:* same as line down — "no gap between crew starts and line stops". — **spelled out**
- *Varies by type?* Family pair, yes (that's what selects A4 vs A5/A6/A7). By line: ⚠ see ledger #1, #2.

**A5 — Changeover white → tint on Line 2** ("the easier direction")
- *Duration (line down):* typical **45 min**; worse **"an hour and a bit"**; better **~30 min** if everything's staged. — **spread** (see ledger #3 for my numeric reading of "an hour and a bit")
- *Crew hands-on:* "most of it — doesn't have much soak-and-wait, it's mostly just doing the work". — **spelled out qualitatively**, ledger #4 for the fraction
- *Cause of the worse tail:* tech gets pulled away partway through. — **spelled out**

**A6 — Changeover tint → white on Line 2 — the full washdown** ("the ugly one")
- *Needs:* as A4, plus a passing visual check before release to production.
- *Duration (line down):* typical **~3 h**; worse **4 h, "maybe a bit more"** — when it doesn't pass the visual check first time and they redo part of it; better **~2 h** with a good crew and nothing complicating. — **spread**
- *Crew hands-on:* "maybe half of that" — real soak and rinse-cycle time where the tech isn't standing there and "might duck off to start something on another line". — **spelled out qualitatively**, ledger #4
- *Rationale:* "any pigment left behind ruins a white batch". — **spelled out**
- **Asymmetry is load-bearing:** white→tint ≠ tint→white, "it trips people up if they assume it is". — **spelled out**

**A7 — Changeover into / out of specialty clear, on Line 1**
- *Duration (line down):* typical **2 h**, roughly the same both directions "unlike white/tint"; worse **3 h**, especially coming out of clear, "clear can be sneaky — you don't always see it the way you'd see pigment"; better **1.5 h** on a quick swap with the line already fairly clean. — **spread**
- *Crew hands-on:* "most of that" — no long soak cycles; it's physically thorough cleaning because the product's thick and clingy. — **spelled out qualitatively**, ledger #4

**A8 — Run the batch** — mix, mill, tint (or straight through if it's a plain white), fill, pack. "For a white that's usually the more straightforward path."
- *Needs:* clean line, batch released to run. *Produces:* filled and packed batch. — **spelled out**
- *Performed by:* ⚠ line operators not elicited.
- *Duration:* ⚠ **nothing obtained.** Demanded as a spread, per family and per line. This is the largest single hole in the model — O1 is a question about a *week*, and without run times there is no week.

**A9 — QA hold and release** — every batch goes through it.
- *Needs:* packed batch. *Produces:* released batch, or (presumably) something else on failure — ⚠ failure path never asked.
- *Performed by:* the lab. *Duration:* **"typically a few hours"** — an honest figure at the wrong precision; demanded as a spread. ⚠
- *Known failure mode:* "if QA's backed up on a Friday afternoon, that's where it actually goes sideways, not on the line"; "half the time a 'late' order was actually sitting done in QA hold waiting for the lab to get to it." — **spelled out qualitatively**; the rate and the queueing mechanism are ⚠.

**A10 — Stage for shipping / ship** — *needs:* QA release. *Produces:* order off the dock. *Timing constraint:* C4. — **spelled out**; duration ⚠.

**A11 — Tech pulled away mid-changeover** (event, not step) — named by you as the cause of the worse tail on A4 and A5. *Rate:* ⚠ not obtained separately — currently only implicit in the one-in-ten tails.

**A12 — Washdown fails the visual check, part redone** (event, not step) — named as the cause of the 4 h tail on A6. *Rate:* ⚠ not obtained separately.

## Ordering / flow

**F1 — The main arc, desk to dock** — **spelled out**, your six steps:
demand book → allocate to line → queue behind what's running (reorderable) → changeover if needed → run (mix, mill, tint-or-straight-through, fill, pack) → QA hold → release → stage → ship.

**F2 — Order-to-batch split** — an order may become two batches run at different times. *Decided by:* you, on run size or urgency-interleaving. — **spelled out as a rule**; the *cost* of a split (extra changeovers, extra loss) ⚠ never asked.

**F3 — Which changeover applies** — selected by (family currently on the line, family of the next batch, line). Same family → A4. White→tint → A5. Tint→white → A6. Into/out of specialty → A7. — **spelled out**

## Policies

**P1 — "Meridian whites always go to Line 2, that's just how it's done here"** — *practiced.* Overrides: ⚠ none asked. — **spelled out**

**P2 — Meridian on-time is absolute** — "we don't even try to be clever about it". *Rationale:* fine, plus tracked on-time % and a delisting threat that has been carried out on a competitor. *Overrides:* none — that's the point. — **spelled out**

**P3 — Who gets the tech when two lines want one** — *practiced, and there is no prescribed form:* "there's no posted rule at all."
- The rule as practiced: whichever line has the **more time-sensitive order behind it** wins; if that's a tie, **whichever changeover is faster** wins, "so you get a line moving sooner". In the room it resolves as "whoever's louder at the huddle, or whoever's about to actually run dry".
- *Borderline case on record:* Line 1 and Line 3 both wanted a washdown the same morning. Line 3 got the tech first because Line 3's was the quick one and Line 1's was the long tint→white slog anyway — knock out the fast one, get that line moving, then commit the tech to the long one. Line 1 sat clean-but-waiting ~40 minutes past when it could have started.
- *What overrides it:* the ops director, who has overruled you once, wanting "his pet SKU out the door". — **spelled out**
- *Rationale:* two techs, three lines, so "the crew's a shared resource and sometimes there's a queue for them before the clock even starts on the line" — that's the grief at the huddle, not changeover variability.

**P4 — Reorder the queue so a job doesn't get stuck behind a big changeover** — *practiced, yours.* — **spelled out**; overrides ⚠ not asked.

**P5 — Hold the line for an anticipated same-family order** — the decision under test. As practiced two weeks ago: on a heads-up that a same-family white was about to drop, let Line 2 sit idle ~1 h rather than wash down to the waiting tint, to save a full washdown. Your own account: "I was guessing." — **spelled out as an instance**; the trigger condition (B2) and the decision threshold are ⚠.

**P6 — Batch split discretion** — "I have the freedom to split if I need to." — **spelled out**

## Constraints

**C1 — Line qualification** — Line 1 qualified for everything including specialty; Line 3 qualified product-by-product, "can't run everything yet"; Line 2 ⚠ never stated. *Consequence when hit:* the batch can't go on that line. — **partially spelled out** ⚠

**C2 — Two techs, three lines** — *consequence when hit:* one line waits, clean-but-idle (40 min in the case on record). — **spelled out**

**C3 — Tint → white requires a full washdown with a passing visual check** — *consequence:* pigment left behind ruins a white batch. — **spelled out**

**C4 — Meridian must leave our dock a day ahead of the dock appointment** — *consequence:* fine + on-time % + delisting exposure. — **spelled out**

**C5 — Every batch goes through QA hold before release** — *consequence:* no batch ships unreleased. — **spelled out**

## Dynamics

**None.** Nothing you described evolves continuously while nothing discrete happens. Soak time inside A6 is dead time within an activity, not a state variable that crosses a threshold. I am deliberately not inventing one.

## Data bindings *(named only — these project to nothing today)*

Changeover logs (tech start/finish per changeover — the check on ledger #1 and #2); ERP demand book (B1 arrival pattern); QA release timestamps (A9); Meridian on-time percentage (O2). — **named**

## Validation criteria

⚠ **None obtained.** I never asked how you'd know the model was right. It belongs at the top of the next session, next to run times.

---

# 2. Assumption ledger

Everything here is mine, not yours.

| # | Assumption | Why | How to check |
|---|---|---|---|
| 1 | Line 1 changeover durations = Line 2 × 1.2, all types | You said Line 1 is "fussier to get properly clean" and, when I proposed 20%, that it "sounds about right, not double" — but you explicitly could not swear the minutes. The 1.2 factor is mine. | Changeover logs, if techs record start and finish; compare Line 1 vs Line 2 for the same family pair. |
| 2 | Line 3 changeover durations = Line 2 | You said Line 3 has no war stories and "you're stuck assuming it's like Line 1 or Line 2 until we've got more history". Choosing Line 2 rather than Line 1 is mine. | As #1, once Line 3 has run enough different products. |
| 3 | "An hour and a bit" (A5 worse) = 70 min; "4, maybe a bit more" (A6 worse) = 4.5 h | Numeric reading of your words so the spread is usable. | Ask you to confirm or correct the two figures. |
| 4 | Crew hands-on fractions: A4 = 1.0 (yours, stated); A5 = 0.8; A6 = 0.5; A7 = 0.8 | You said "most of it", "maybe half of that", "most of that". A6's 0.5 is close to your words; the two 0.8s are mine. | Changeover logs vs. tech time records; or ask the techs directly. |
| 5 | No changeover happens outside day shift | You said "two techs on day shift covering all three lines". Whether there's any other coverage was never asked. | One question to you. |
| 6 | Every batch's changeover requires exactly one tech (not two) | You always spoke of "the tech" singular. | One question to you. |
| 7 | A6's redo-after-failed-visual-check is inside the 4 h tail rather than a separate event with its own rate | Simplification so the spread stands alone; you described it as the *cause* of the tail. | Ask how often the visual check fails first time. |

---

# 3. What this model leaves out, and what's still unknown

**Deliberately left out.**
- **Queues and waiting states** are not modelled as things in their own right — the wait behind a running batch, the wait for a tech, the wait in QA hold. They fall out of the activities either side of them. The 40-minute clean-but-waiting on Line 1 is a *result* the model should produce, not an input.
- **The commercial layer** — the fine, the on-time percentage, the delisting mechanism. C4 and O2 encode the hard deadline; the money behind it is out of scope because it's out of your sight.
- **Who ran which changeover** — the two techs are interchangeable, since you drew no distinction between them.

**Things the model cannot carry, that I'm keeping in words so they aren't lost.**
- **O4, "how ugly the sheet looks."** A real criterion you use, explicitly not a number. It can be approximated as line idle hours, but that approximation is mine, not yours, and I haven't made it.
- **The O2/O3/lateness trade-off weight.** Genuinely unquantified, with the source named: commercial. Without it, the model can report changeover hours and lateness separately but cannot rank two schedules that trade one for the other.
- **The huddle.** "Whoever's louder at the huddle" and the ops director's pet-SKU override are the real P3 in the room. The triage logic you gave me — time-sensitivity first, faster-changeover as tiebreak — is compilable; loudness and the override are not, and any run of this model will be *quieter and more rational* than your plant. That gap is worth remembering when the results look tidy.
- **Ledger #1–#4** are load-bearing for any result involving Line 1 or Line 3. Right now O1 is only genuinely answerable for Line 2.

**Open slots, in the order I'd close them.**
1. **A8 run duration** — nothing at all, per family and per line, as a spread. O1 asks about a week; run time is most of a week.
2. **B2, the drop-in and the heads-up** — how the warning reaches you, how far ahead, and how often it's right. P5 is the decision under test and its trigger is currently an anecdote.
3. **A9 QA hold** — "a few hours" is a figure at the wrong precision. And whether the lab is a shared resource with a queue, like the techs — because by your own account that's where lateness actually comes from.
4. **B1** — orders per weekly pull, and the within-week shape.
5. **E2 / F2** — typical run sizes, and what a split actually costs in extra changeovers.
6. **B5 / C1** — which SKUs Line 3 is qualified for, and whether Line 2 has restrictions.
7. **Breakage and interruptions** — you mentioned "the mill motor issue" in passing as an example of something structurally different. I never asked what breaks, how often, or for how long.
8. **Validation** — how you'd know the model is right.

**One caution on the format.** I've built the model; the Petri-net scaffold and the code obligations are derived from it by the tooling, not written by me. I'm not claiming this loads or runs as-is — the run-duration hole alone would stop it.

---

**Expert (Marta)**:

*(No dialogue — Marta has left for the huddle. This turn is a silent acknowledgment beat only if the interviewer expects a reply; otherwise nothing further is added.)*

---

**Interviewer**:

Nothing further from me — you've stopped, and the read-back above is the deliverable as it stands.

For when you're back, the first three questions in one place, so you can answer them in five minutes if that's all you have:

1. **How long does a batch run?** Typical, one-in-ten worse, one-in-ten better — for a plain white on Line 2 first; I'll ask about the other families and lines after.
2. **The heads-up.** Two weeks ago, who told you that white order was about to drop, how far ahead, and how often does that kind of warning turn out to be right?
3. **QA hold.** "A few hours" — typical, one-in-ten worse, one-in-ten better. And is there a queue for the lab like there is for the techs?

Enjoy the huddle.

---

**Expert (Marta)**:

*(Marta has stepped away to the huddle — no further reply expected this turn. The three questions are noted for the next session.)*

---

**Interviewer**:

Noted — session closed. The model, the seven-item assumption ledger, and the eight open slots stand as delivered above; the three questions are queued for next time.

---

**Expert (Marta)**:

Understood — nothing further needed from me here. Session closed, deliverables stand as written, and I'll pick up run times, the heads-up mechanism, and QA hold as the first order of business next time we talk.

---

**Interviewer**:

Acknowledged. Session closed on your terms.

For the record, so nothing depends on memory next time:

- **Delivered:** the model (4 objectives, 5 entity types, 5 boundary conditions, 12 activities, 3 ordering/flow rules, 6 policies, 5 constraints, no dynamics, 4 named data bindings), the 7-entry assumption ledger, and the loss account.
- **Queued, in order:** A8 run duration → B2 the heads-up mechanism → A9 QA hold and whether the lab queues.
- **Standing caveat:** O1 — hold versus wash down — is currently answerable only for Line 2, and only once run times exist. Ledger #1–#4 are the assumptions to attack first if a result involving Line 1 or Line 3 ever looks decisive.

Thanks for the time, Marta — the changeover asymmetry and the tech-contention story were the two things I'd never have got from a document.

---

**Expert (Marta)**:

Anytime. Glad the changeover asymmetry landed — that one catches everybody, including people who've been on the floor a lot longer than me. Come find me at the huddle when you're ready to go through run times, I'll have my head in the sheet anyway.

---

**Interviewer**:

Will do — I'll come to the huddle rather than pull you out of it. If your head's in the sheet anyway, that's the best possible place to ask about run times: I'd rather hear "that one took nine hours and it was a bad one" off the actual sheet than a remembered average.

One small ask for whenever it's convenient, no work required now: if the changeover logs do have tech start and finish times on them, that's the single thing that would let me retire ledger entries #1 and #4 — the Line 1 scaling factor and the crew hands-on fractions — and swap my guesses for your history.

See you at the huddle.

---

**Expert (Marta)**:

Sounds good — I'll flag it to the two techs to make sure they're actually filling in start/finish consistently, because I'll be honest, I've never audited that field myself, I mostly just glance at duration. If it's patchy for Line 1 and Line 3 specifically, that itself would be useful for you to know, not just an inconvenience. See you at the huddle.

---

**Interviewer**:

That's a genuinely useful thing to have said, and I'm recording it rather than just noting it — it changes the status of a data binding I'd been leaning on.

**Amendment to the delivered model:**

- **Data binding "changeover logs (tech start/finish)"** — provenance qualified: the start/finish field has never been audited; you read duration only. Coverage is unknown and may be patchy, and you've flagged Line 1 and Line 3 as the places to look. Your words: "I've never audited that field myself, I mostly just glance at duration."
- **Consequence for the ledger:** entries #1 (Line 1 × 1.2) and #4 (crew hands-on fractions) each carry a second-order dependency — their check depends on a feed of unverified coverage. If the field turns out patchy exactly where the assumptions bite, those two stay assumptions and the honest move is to widen them rather than to fill them in.
- **Recorded as a finding in its own right:** patchy logging on Line 1 and Line 3 is itself evidence about the plant, not just an obstacle to the model.

Nothing else changes. See you at the huddle.

---

**Expert (Marta)**:

Fair enough — that's a better way to put it than I would have. Talk soon.

---

**Interviewer**:

Talk soon, Marta.

---

**Expert (Marta)**:

See you at the huddle.

---

**Interviewer**:

See you there.

---

**Expert (Marta)**:

*(end of session — nothing further to add.)*

---

**Interviewer**:

Session ended. Deliverables stand as written above.

---

**Expert (Marta)**:

Confirmed — nothing further from this end. Session closed.

---

**Interviewer**:

Closed. Nothing further.

---

**Expert (Marta)**:

Closed.

---

**Interviewer**:

Closed.

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

# Coatings Plant Scheduling Model
**Elicited from:** Marta, master scheduler
**Job:** construct (no prior model)
**Status at close:** floor satisfied; O1's dependency slice **incomplete** — see §3.
**Vocabulary:** the expert's throughout. `⚠` = a slot the method demands and the interview did not obtain.

---

## 1. The model

### 1.1 Objectives

**O1 — "Hold the line versus wash it down now, which one actually costs less over the week"**
- **The question, in her words** *(spelled out)*: whether letting Line 2 sit idle for about an hour, on a heads-up that another same-family white order is about to drop in from a distributor, is cheaper over a week than washing down now to run the tint batch waiting behind it. Origin: a real Thursday-afternoon decision two weeks before the interview. Her own verdict on how she made it: *"I was guessing."*
- **Depends on** *(≥1 satisfied)*: E1, E2, E3, E4, B1, B2, A4, A5, A6, A8, A9, F1, F2, P3, P4, P5, C1, C2, C3.
- **What "better" means** *(named; not quantified)*: changeover hours consumed over the week, subject to O2 holding absolutely. ⚠ no trade-off weight against lateness — see the trade-off note below.
- **Source-regime**: practiced.

**O2 — "Whether Meridian shipped on time, full stop, that's non-negotiable"**
- **The question** *(spelled out)*: does every Meridian order leave the dock in time for its dock appointment.
- **"On time" defined** *(spelled out)*: a ship date given on the order, usually with a delivery window attached — a specific dock appointment at Meridian's end. In practice the batch must leave our dock **one day ahead** to allow for freight. Not "shipped this week."
- **Consequence of a miss** *(spelled out, unquantified)*: a fine — *"I don't see the number, that's commercial's problem, but I hear about it"* — and, worse, Meridian tracks our on-time percentage and threatens to delist SKUs if it drops too far. A competitor has been delisted, *"so it's not an empty threat, and it's why the rule is absolute — we don't even try to be clever about it."* ⚠ fine amount and delisting threshold both outside her sight.
- **Depends on**: A8, A9, A10, B3, C4, C5, P1, P2.
- **Source-regime**: prescribed and practiced coincide — she reports no divergence, which is itself the finding.

**O3 — Changeover hours**
- **The question** *(spelled out)*: how many crew-hours go into washing down rather than filling. *"Every hour the crew spends washing down is an hour not filling anything."*
- **Depends on**: A4, A5, A6, A7, E4, C2, P3.
- **What "better" means** *(named)*: fewer changeover hours. Directionally clear, no target value. ⚠

**O4 — "How ugly the sheet looks"**
- **The question** *(spelled out)*: *"are there gaps where a line's sitting idle for no good reason."*
- **What "better" means** *(her words; explicitly not a number)*: *"that last one's not a number, it's more a gut check, but it's real."*
- **Depends on**: E3, C2, P3, P4, A4–A7.
- **Status**: recorded, IR-only. Approximating it as line idle hours would be my move, not hers; I have not made it. See §3.

**The trade-off between O2, O3 and non-Meridian lateness** *(spelled out as a rule; deliberately unquantified)*
Four changeover hours saved against one distributor order two days late: *"honestly, yes, I'd take that trade most of the time"* — a distributor slip is *"usually just an annoyed phone call from our sales rep, not a fine."* But *"'most of the time' is doing a lot of work in that sentence"*: the same distributor slipping three weeks running starts asking for a discount. So lateness for non-Meridian is soft but not infinitely soft, and the softness decays with repetition on the same customer.
**Deposit for the missing number**: *"that's genuinely a 'sit down with commercial' conversation, nobody's ever made me quantify it."* Source named; not obtainable from the scheduler. ⚠

---

### 1.2 Entity types

**E1 — Order (in the demand book)**
- **Distinctions the process treats apart** *(spelled out)*: Meridian vs. non-Meridian — a Meridian flag arrives on the order and it *"jumps to the top of my attention"*; family classification (see below), which drives allocation and changeover.
- **State riding along** *(spelled out)*: SKU; quantity; due date with delivery window; Meridian flag; family — **base white / tinted colour / specialty clear**. The family is a real field: *"that's not my judgment, that's how the SKU's classified in the system, it drives what changeover you need going in and out."*
- **How many / population shape**: ⚠ not obtained. Orders per weekly pull and within-week shape unknown.

**E2 — Batch**
- **Distinctions** *(spelled out)*: inherits the family of the order it came from.
- **Relationship to E1** *(spelled out)*: *"mostly the order is the batch, if it fits a reasonable run size."* Split into two batches run at different times when a distributor orders more than makes sense in a single run, or to interleave something more urgent. *"Order-to-batch most of the time, but not a strict one-to-one — I have the freedom to split if I need to."*
- **How many / population shape**: ⚠ not obtained. Run sizes, "reasonable run size" threshold, and the cost of a split all unelicited.

**E3 — Line** *(a contended resource: capacity in C1, contention in P1/P3, availability in B4)*
- **Distinctions** *(spelled out)*:
 - **Line 1** — *"the old workhorse — slower but it's qualified for everything, including specialty."* Crew report it is *"fussier to get properly clean."*
 - **Line 2** — *"the fast one, that's your big-volume runner."* Meridian whites always go here (P1).
 - **Line 3** — *"the newest and quickest, but it's still being qualified product by product, so it can't run everything yet"*; so far *"mostly one or two SKUs."*
- **State riding along** *(spelled out)*: the family the line is currently dirty with — this selects which changeover applies (F3); the line's qualification set.
- **How many** *(number)*: 3.

**E4 — Changeover tech** *(a contended resource)*
- **Distinctions** *(named)*: none drawn between the two techs; treated as interchangeable.
- **State riding along** *(spelled out)*: which line they are currently committed to. Can be *"pulled away partway through"* a changeover, and during long soaks *"might duck off to start something on another line."*
- **How many** *(number)*: 2 on day shift, covering all three lines. *"That's it. No dedicated tech per line."*

**E5 — QA lab**
- ⚠ **Nothing obtained** beyond its existence, that every batch passes through it, and that it *"gets backed up on a Friday afternoon."* Whether it is a contended resource with a queue — as she suspects and I flagged — is open.
- Recorded because her own diagnosis makes it load-bearing for O2: *"half the time a 'late' order was actually sitting done in QA hold waiting for the lab to get to it."*

---

### 1.3 Boundary conditions

**B1 — ERP weekly pull into the demand book**
- **Starting state** *(spelled out)*: orders come over from ERP on the weekly pull carrying SKU, quantity, due date, Meridian flag.
- **Arrival pattern**: ⚠ **not obtained** (demanded as a spread). No volume, no variability, no within-week shape.

**B2 — Mid-week drop-in order, and the heads-up that precedes it**
- ⚠ **Not obtained** (demanded as a spread). All that exists is the single anecdote: *"I had a heads-up another same-family white order was about to drop in from a distributor."*
- **Why this matters more than its size suggests**: this is the trigger on which O1's entire decision hangs. Who gives the heads-up, how far ahead, and how often it proves right are all unknown. Without it, P5 can be simulated as a *rule* but its *arrival process* has no basis.

**B3 — Meridian dock appointment**
- **Pattern** *(spelled out, qualitative)*: a ship date with a delivery window on the order, resolving to a specific dock appointment at Meridian's end.
- **Lead-time distribution**: ⚠ not obtained.

**B4 — Tech availability**
- **Spelled out, partially**: two techs on **day shift**. ⚠ Whether any changeover coverage exists outside day shift was never asked (ledger #5).

**B5 — Line 3 qualification set**
- ⚠ *"mostly one or two SKUs"* — **not spelled out**; which SKUs, unknown.

---

### 1.4 Activities

**A1 — Lands in the demand book**
- *Needs*: the weekly ERP pull. *Produces*: an order in the demand book, Meridian-flagged or not. *Performed by*: ERP — unattended. *Duration*: instantaneous receipt. *Rate*: per B1 ⚠. *Mode-change loss*: n/a. *Varies by type*: no. **spelled out**

**A2 — Allocate to a line**
- *Needs*: an order in the book. *Produces*: order assigned to a line. *Performed by*: Marta. *Duration*: not a constraint on the schedule; for Meridian whites *"that's not really a decision."* *Rule*: P1. **spelled out**

**A3 — Reorder the queue**
- *Needs*: an order sitting behind others on a line. *Produces*: a changed run sequence. *Performed by*: Marta. *Rule*: P4 — *"sometimes I'll reorder things a bit so it doesn't get stuck behind a big changeover."* **spelled out**

**A4 — Quick rinse, same family (white → white), Line 2**
- *Needs*: previous batch off; a tech available; next SKU in the same family. *Produces*: line clean, *"the fill head's actually running clean product again."*
- *Performed by* **(named)**: one changeover tech.
- *Duration, line down* **(spread)**: **typical 25 min**; **one-in-ten worse 45 min** — *"usually because the tech's tied up finishing something on another line first and there's a wait before they even start on Line 2"*; **one-in-ten better 15 min** — *"if the tech's standing right there and it's a genuinely easy one."*
- *Crew hands-on* **(spelled out)**: identical to line-down. *"It's quick enough that the tech's on it start to finish, no gap between 'crew starts' and 'line stops.'"*
- *Mode-change loss*: this activity **is** the mode change; the loss is the duration above.
- *Varies by type* **(named)**: yes by family-pair (F3 selects between A4–A7). By line: ⚠ ledger #1, #2.

**A5 — Family switch, white → tint, Line 2** — *"the easier direction"*
- *Needs / produces*: as A4, next batch in a different family.
- *Performed by* **(named)**: one changeover tech.
- *Duration, line down* **(spread)**: **typical 45 min**; **worse "an hour and a bit"** — *"if the tech gets pulled away partway through"*; **better ~30 min** — *"if everything's staged."* (Numeric reading of "an hour and a bit": ledger #3.)
- *Crew hands-on* **(spelled out, qualitative)**: *"the tech's hands-on for most of it — this one doesn't have much soak-and-wait, it's mostly just doing the work."* Fraction: ledger #4.
- *Varies by type*: direction-dependent — see A6.

**A6 — Family switch, tint → white, Line 2 — the full washdown** — *"the ugly one"*
- *Needs*: as A5, plus a **passing visual check** before the line is released back to production.
- *Produces*: a line clean enough to run white.
- *Performed by* **(named)**: one changeover tech, not continuously present.
- *Duration, line down* **(spread)**: **typical ~3 h**; **worse 4 h, "maybe a bit more"** — *"if it doesn't pass the visual check first time and they have to redo part of it"*; **better ~2 h** — *"a clean fast one, if the crew's good and nothing complicates it."* (Ledger #3 for the numeric reading of the tail.)
- *Crew hands-on* **(spelled out, qualitative)**: *"less than the 3 hours suggests — there's real soak and rinse-cycle time where the tech's not standing there, they might duck off to start something on another line. I'd guess they're actually working maybe half of that."* Note her own hedge — *"I'd guess"* — carried into ledger #4.
- *Rationale* **(spelled out)**: *"any pigment left behind ruins a white batch, so it's a full washdown."*
- **Asymmetry is load-bearing**: white→tint ≠ tint→white. *"It absolutely depends on direction — that's the thing people forget… it is absolutely not symmetric, and it trips people up if they assume it is."*

**A7 — Changeover into / out of specialty clear, Line 1**
- *Needs / produces*: as A5/A6, for the specialty family. Only Line 1 is qualified (C1).
- *Performed by* **(named)**: one changeover tech.
- *Duration, line down* **(spread)**: **typical 2 h**, *"roughly the same both directions, unlike white/tint"*; **worse 3 h**, *"if it's coming out of clear and they're being extra careful about residue, since clear can be sneaky — you don't always see it the way you'd see pigment"*; **better 1.5 h**, *"a quick swap and the line was already fairly clean."*
- *Crew hands-on* **(spelled out, qualitative)**: *"most of that — specialty doesn't have the long soak cycles the tint-to-white washdown has, it's more just physically thorough cleaning because the product's thick and clingy."* Fraction: ledger #4.

**A8 — Run the batch** — mix, mill, tint (or *"straight through if it's a plain white"*), fill, pack
- *Needs* **(spelled out)**: a clean line in the right family state; the batch released to run.
- *Produces* **(spelled out)**: a filled and packed batch.
- *Performed by*: ⚠ line operators never elicited as a resource.
- **Duration**: ⚠ **nothing obtained.** Demanded as a spread, per family and per line.
- *Varies by type*: partially — *"for a white that's usually the more straightforward path"* (skips the tint step), but no durations attach to that.
- **This is the largest hole in the model.** O1 asks a question about a week; run time is most of a week.

**A9 — QA hold and release** — *"every batch does"*
- *Needs*: a packed batch. *Produces*: a released batch.
- *Performed by* **(named)**: the lab (E5).
- **Duration**: *"typically a few hours before it's released"* — an honest **number at the wrong precision**; demanded as a **spread**. ⚠
- *Failure path*: ⚠ never asked what happens to a batch that fails QA.
- *Known pathology* **(spelled out, qualitative; rate ⚠)**: *"if QA's backed up on a Friday afternoon, that's where it actually goes sideways, not on the line."* And: *"the QA step is the one people don't think about when they're mad at scheduling; half the time a 'late' order was actually sitting done in QA hold waiting for the lab to get to it."*

**A10 — Stage for shipping, and ship**
- *Needs*: QA release. *Produces*: the order off the dock. *Timing constraint*: C4 — *"that's when the truck appointment matters."*
- *Duration*: ⚠ not obtained.

**A11 — Tech pulled away mid-changeover** *(event, not step)*
- Named by her as the mechanism behind the worse tail of A4 (*"the tech's tied up finishing something on another line"*) and A5 (*"if the tech gets pulled away partway through"*).
- *Rate*: ⚠ not obtained separately; currently only implicit inside the one-in-ten tails of A4 and A5. Per P01 this should be its own rate and duration.

**A12 — Washdown fails the visual check, part redone** *(event, not step)*
- Named as the mechanism behind A6's 4 h tail.
- *Rate*: ⚠ not obtained separately. Ledger #7 records the simplification.

**A13 — "The mill motor issue"** *(event, not step — named in passing, nothing more)*
- Mentioned only as an example of what a *structural* difference between lines would look like, in contrast to Line 1 merely being fussier. Recorded so it is not lost; **rate ⚠, duration ⚠, consequence ⚠**. This is the whole of the breakdown/interruption stratum, which was never swept.

---

### 1.5 Ordering / flow

**F1 — The main arc, desk to dock** *(spelled out — her six steps, verbatim in structure)*
1. Lands in the demand book (ERP weekly pull; SKU, quantity, due date, Meridian flag).
2. Allocated to a line (*"Meridian whites always go to Line 2"*).
3. Sits in the queue behind whatever's running — reorderable (A3/P4).
4. Changeover if needed (F3 selects which), then it runs: mix, mill, tint-or-straight-through, fill, pack.
5. QA hold.
6. Released, staged for shipping, out against the truck appointment.

**F2 — Order-to-batch split**
- *Order* **(spelled out)**: an order becomes one batch by default; it may become two batches run at different times.
- *How the branch is decided* **(spelled out)**: Marta's judgment, on either (a) a distributor ordering *"more than makes sense in a single run"*, or (b) needing to interleave something more urgent.
- *Cost of a split*: ⚠ never asked (P03 unresolved) — extra changeovers and any extra loss are unknown.

**F3 — Which changeover applies** *(spelled out)*
Selected by the triple (family currently on the line, family of the next batch, line):
- same family → **A4** quick rinse
- white → tint → **A5**
- tint → white → **A6** full washdown
- into or out of specialty clear → **A7** (Line 1 only)

---

### 1.6 Policies

**P1 — "Meridian whites always go to Line 2, that's just how it's done here"**
- *As practiced* **(spelled out)**: fixed allocation, not a decision.
- *What overrides it*: ⚠ never asked.
- *Source-regime*: practiced; no prescribed form offered.

**P2 — Meridian on-time is absolute**
- *As practiced* **(spelled out)**: *"the rule is absolute — we don't even try to be clever about it."*
- *What overrides it* **(spelled out)**: nothing. That is the content of the policy.
- *Rationale*: fine, tracked on-time percentage, delisting threat carried out on a competitor.

**P3 — Who gets the tech when two lines want one** *(the model's richest policy, and the least documented)*
- **Prescribed form: none exists.** *"There's no posted rule at all."*
- **As practiced** *(spelled out)*: in the room it resolves as *"whoever's louder at the huddle, or whoever's about to actually run dry."* Pressed for the underlying logic: *"it's mostly gut triage: whichever line has the more time-sensitive order behind it wins, and if that's a tie, whichever changeover is faster wins so you get a line moving sooner."*
- **Borderline case on record** *(the practiced rule demonstrated, per P05)*: Line 1 and Line 3 both wanted a washdown the same morning. **Line 3 got the tech first** — *"not because it was more important, but because Line 3's changeover was the quick one and Line 1's was going to be the long tint-to-white slog anyway, so the thinking was 'knock out the fast one, get that line moving, then commit the tech to the long one.'"* Line 1 sat **clean-but-waiting for almost 40 minutes** past when it could have started.
- **What overrides it** *(spelled out)*: the ops director. *"I've been overruled by the ops director once when he wanted his pet SKU out the door."*
- *Rationale* **(spelled out)**: *"the crew's a shared resource and sometimes there's a queue for them before the clock even starts on the line"* — and this, not changeover variability, is *"the bit that actually causes grief at the huddle."*

**P4 — Reorder the queue so a job isn't stuck behind a big changeover**
- *As practiced* **(spelled out)**: Marta reorders *"a bit"* to avoid a job landing behind an expensive changeover.
- *What overrides it*: ⚠ never asked.

**P5 — Hold the line for an anticipated same-family order** *(the decision under test)*
- *As practiced, one instance* **(spelled out)**: on a heads-up that a same-family white was about to drop, let Line 2 sit idle for *"maybe an hour"* rather than wash down for the tint waiting behind, *"because doing them back to back would save us a full washdown."*
- *Her own epistemic status*: *"I was guessing."* Her boss's challenge — *"are you sure that's worth it, or are you just guessing?"* — is the reason this model exists.
- *Trigger condition and decision threshold*: ⚠ how strong a heads-up, and how long she'd hold, are not generalised beyond this instance. Depends on B2.

**P6 — Batch-split discretion**
- *As practiced* **(spelled out)**: *"I have the freedom to split if I need to."* Criteria as in F2.
- *What overrides it*: ⚠ never asked.

---

### 1.7 Constraints

**C1 — Line qualification**
- *The limit* **(partially spelled out)**: Line 1 qualified for everything including specialty. Line 3 qualified product-by-product, *"can't run everything yet"*, currently *"mostly one or two SKUs"* — which ones ⚠. Line 2's qualification set ⚠ never stated.
- *What happens when it's hit* **(spelled out)**: the batch cannot go on that line.

**C2 — Two techs, three lines**
- *The limit* **(spelled out)**: 2 techs on day shift for 3 lines.
- *What happens when it's hit* **(spelled out)**: *"if Line 1 and Line 3 both want a washdown at the same time, one of them waits"* — clean-but-idle; 40 minutes in the case on record. Resolution by P3.

**C3 — Tint → white requires a full washdown passing a visual check**
- *The limit* **(spelled out)**: a white batch may not run on a line still carrying pigment.
- *What happens when it's hit* **(spelled out)**: *"any pigment left behind ruins a white batch"*; a failed visual check means part of the washdown is redone (A12).

**C4 — Meridian must leave our dock a day ahead of the appointment**
- *The limit* **(spelled out)**: shipped in time to hit the dock appointment, which *"usually means it needs to leave our dock a day ahead for freight."*
- *What happens when it's hit* **(spelled out)**: fine + on-time percentage damage + delisting exposure.

**C5 — Every batch passes QA hold before release**
- *The limit* **(spelled out)**: *"every batch does."*
- *What happens when it's hit* **(spelled out)**: nothing ships unreleased; the batch waits in hold.

**Unwritten constraints**: ⚠ the closing sweep — *"what would a newcomer get wrong in the first week?"*, *"which rule exists because something once went wrong?"* — was never run. The one item that surfaced unprompted is the changeover asymmetry: *"that one catches everybody, including people who've been on the floor a lot longer than me."*

---

### 1.8 Dynamics

**None.** Nothing described evolves continuously while nothing discrete happens. The soak and rinse-cycle time inside A6 is dead time *within* an activity, not a state variable crossing a threshold, and I have deliberately not promoted it to one.

---

### 1.9 Data bindings *(named only; these project to nothing today)*

| Feed | Would drive | Provenance |
|---|---|---|
| Changeover logs — tech start/finish per changeover | A4–A7 durations and crew hands-on fractions; retires ledger #1 and #4 | **Qualified**: *"I've never audited that field myself, I mostly just glance at duration."* Coverage unknown, possibly patchy — Marta named **Line 1 and Line 3** as where to look. She will flag it to the two techs. |
| ERP demand book | B1 arrival pattern, B2 | not discussed |
| QA release timestamps | A9 duration and lab queueing | not discussed |
| Meridian on-time percentage | O2 | tracked by Meridian, visible to commercial |

**Finding, recorded in its own right**: patchy changeover logging concentrated on Lines 1 and 3 is evidence about the plant, not merely an obstacle to the model. Her words: *"if it's patchy for Line 1 and Line 3 specifically, that itself would be useful for you to know, not just an inconvenience."*

---

### 1.10 Validation criteria

⚠ **None obtained.** How Marta would know the model is right was never asked. Queued.

---

## 2. Assumption ledger

Everything here is mine. None of it is hers.

| # | Assumption | Why it was made | How to check it |
|---|---|---|---|
| **1** | Line 1 changeover durations = Line 2 × **1.2**, all four types | She could not give Line 1 minutes: *"I couldn't swear the minutes are identical… Line 1's older, the crew sometimes says it's fussier."* I proposed 20%; she said *"20% sounds about right, not double."* **The 1.2 factor originated with me** — her assent is not authorship. | Changeover logs, Line 1 vs Line 2, same family-pair. **Blocked by the unaudited start/finish field, and Line 1 is one of the two lines she expects to be patchy.** |
| **2** | Line 3 changeover durations = Line 2, unscaled | *"Line 3 I genuinely don't have a good feel for… you're stuck assuming it's like Line 1 or Line 2 until we've got more history."* She offered the disjunction; **choosing Line 2 was mine.** | As #1, once Line 3 has run more products. Also expected patchy. |
| **3** | "An hour and a bit" (A5 worse) = **70 min**; "4, maybe a bit more" (A6 worse) = **4.5 h** | Numeric readings so the spreads are usable. | One question to Marta: confirm or correct both. |
| **4** | Crew hands-on fractions: A4 = **1.0**; A5 = **0.8**; A6 = **0.5**; A7 = **0.8** | A4's 1.0 is hers, stated. A6's 0.5 is close to *"maybe half of that"* — but note her own hedge, *"I'd guess."* **The two 0.8s from *"most of it"* / *"most of that"* are mine.** | Changeover logs vs. tech time records, or ask the two techs directly. Same blocker as #1. |
| **5** | No changeover happens outside day shift | She said *"two techs on **day shift** covering all three lines."* Whether any other coverage exists was never asked. | One question to Marta. |
| **6** | A changeover requires exactly **one** tech, not two | She spoke of *"the tech"* singular throughout, including for the 3-hour washdown. | One question to Marta or the techs. |
| **7** | A12 (failed visual check, part redone) is folded **inside** A6's 4 h tail rather than modelled as a separate event with its own rate and duration | She described it as *the cause of* the tail, not as an independent event. Keeps the spread self-contained. Contrary to P01, which would separate rate from duration. | Ask how often the visual check fails first time; if it's common, split it out. |
| **8** | The two changeover techs are **interchangeable** | She drew no distinction between them. | One question to Marta. |

**Second-order note on #1 and #4**: their stated check depends on a feed of unverified coverage, concentrated exactly where the assumptions bite. If the field proves patchy on Line 1, the honest move is to **widen** these assumptions, not to fill them in.

---

## 3. What the model leaves out, what is unknown, and why

### 3.1 Deliberately left out

- **Queues, buffers and waiting states are not nodes.** The wait behind a running batch, the wait for a tech, the wait in QA hold — none is elicited as a thing in itself; each is implied by the activities either side and emerges in projection. The 40-minute clean-but-waiting on Line 1 is an *output* the model should reproduce, not an input to it.
- **The commercial layer.** The fine, the on-time percentage mechanics, the delisting threshold. C4 and O2 encode the hard deadline; the money behind it is outside the scheduler's sight and she named commercial as the owner.
- **Individual tech identity.** Ledger #8 — she drew no distinction.
- **Scenarios.** Not elicited; they assemble from B1–B5 at simulation time.

### 3.2 What the formalism cannot carry, kept in words so it is not lost

- **O4, "how ugly the sheet looks."** A criterion she genuinely uses and explicitly refuses to number. It could be approximated as line idle hours — but that approximation would be mine, and I have not made it.
- **The O2/O3/lateness trade-off weight.** Deliberately unquantified with the source named (commercial). Consequence: the model can report changeover hours, Meridian lateness and distributor lateness **separately**, but cannot rank two schedules that trade one against another. That is a real limit on answering O1, since O1's "costs less" implicitly spans them.
- **The decay of softness.** *"The same distributor slipping late for the third week running"* turning into a discount demand is a memory effect across weeks on a customer. Stated as a rule, unquantified, and not represented.
- **The huddle.** *"Whoever's louder at the huddle"* and the ops director's pet-SKU override are the real P3 in the room. The triage logic — time-sensitivity first, faster-changeover as tiebreak — is compilable; loudness and the override are not. **Any run of this model will be quieter and more rational than the plant.** That is worth remembering when a result looks tidy.

### 3.3 Open slots, in the order I would close them

1. **A8 run duration** — nothing at all, per family and per line, as a spread. O1 is a question about a *week*; run time is most of a week. **Nothing about O1 is answerable until this exists.**
2. **B2, the drop-in and the heads-up** — who tells her, how far ahead, how often it proves right. P5 is the decision under test and its trigger is currently a single anecdote.
3. **A9 QA hold** — *"a few hours"* is honest at the wrong precision; and whether the lab queues like the techs do. By her own account this is where lateness actually comes from, so it bears directly on O2.
4. **B1** — orders per weekly pull and the within-week shape.
5. **E2 / F2** — typical run sizes, the "reasonable run size" threshold, and what a split costs in extra changeovers (P03).
6. **C1 / B5** — which SKUs Line 3 is qualified for; whether Line 2 has restrictions.
7. **Breakdowns and interruptions** — the whole stratum. A13 "the mill motor issue" is a name with no rate, duration or consequence. A11 and A12 need rate separated from duration (P01).
8. **The unwritten-constraint sweep** and **validation criteria** — neither was run.

### 3.4 Status against the completion criteria

- **Static floor: satisfied** — 4 objectives, 5 entity types, 13 activities, 3 ordering/flow nodes.
- **O2, O3: dependency slices substantially satisfied**, excepting A8 and A9 durations.
- **O1: dependency slice incomplete.** A8 has no duration at all; B2 has no arrival pattern. O1 is currently **answerable only for Line 2**, and only once run times exist. Ledger #1–#4 are the first assumptions to attack if any result involving Line 1 or Line 3 ever looks decisive.
- **O4: recorded, unsupported for quantitative use** by its own author's description.

### 3.5 What I do not claim

I have elicited a model, not built a net. The SDCPN scaffold, the code-obligation sidecar and the typed loss report are derived from this model by the tooling's projection — I have not written them and I am not claiming this loads, compiles, or runs. The A8 hole alone would stop it.

---

*Elicited from Marta, master scheduler, in a single session ended at her stop. Three questions queued for resumption: run duration for a plain white on Line 2 (typical / one-in-ten worse / one-in-ten better); the heads-up mechanism behind B2; QA hold as a spread, and whether the lab queues.*

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

# Coatings Plant Scheduling Model — final deliverable

**Elicited from:** Marta, master scheduler
**Job:** construct (no prior model existed)
**Ended:** at the expert's stop. No new topics opened after it.
**Status:** static floor satisfied; O2 and O3 near-complete; **O1's dependency slice incomplete** (see §4).
**Convention:** every value is in Marta's vocabulary, with the precision actually obtained. `⚠` marks a slot the method demands and the interview did not get. Quoted text is hers.

---

## 1. The model

### 1.1 Objectives

**O1 — "Hold the line versus wash it down now, which one actually costs less over the week"**
- *Question* **(spelled out)** — whether letting Line 2 sit idle about an hour, on a heads-up that another same-family white order is about to drop from a distributor, beats washing down now for the tint waiting behind. From a real Thursday two weeks before the interview. Her verdict on her own method: *"I was guessing."*
- *Depends on* — E1, E2, E3, E4, B1, B2, A4, A5, A6, A8, A9, F1, F2, F3, P3, P4, P5, C1, C2, C3.
- *"Better"* **(named, not quantified)** — changeover hours over the week, subject to O2 holding absolutely. ⚠ no weight against lateness.
- *Source-regime* — practiced.

**O2 — "Whether Meridian shipped on time, full stop, that's non-negotiable"**
- *Question* **(spelled out)** — does every Meridian order leave the dock in time for its appointment.
- *"On time"* **(spelled out)** — a ship date on the order with a delivery window, resolving to a specific dock appointment at Meridian's end; in practice must leave our dock **one day ahead** for freight. *"Not just 'shipped this week.'"*
- *Consequence of a miss* **(spelled out; unquantified ⚠)** — a fine, *"I don't see the number, that's commercial's problem, but I hear about it"*; and worse, a tracked on-time percentage with a delisting threat — *"that's happened to a competitor of ours, so it's not an empty threat, and it's why the rule is absolute."*
- *Depends on* — A8, A9, A10, B3, C4, C5, P1, P2.

**O3 — Changeover hours**
- *Question* **(spelled out)** — crew-hours spent washing down instead of filling: *"every hour the crew spends washing down is an hour not filling anything."*
- *Depends on* — A4, A5, A6, A7, E4, C2, P3.
- *"Better"* **(named)** — fewer. Direction only; no target. ⚠

**O4 — "How ugly the sheet looks"**
- *Question* **(spelled out)** — *"are there gaps where a line's sitting idle for no good reason."*
- *"Better"* **(her words; explicitly not a number)** — *"that last one's not a number, it's more a gut check, but it's real."*
- *Depends on* — E3, C2, P3, P4, A4–A7. IR-only; see §3.

**Trade-off among O2 / O3 / non-Meridian lateness** **(spelled out as a rule; deliberately unquantified ⚠)** — four changeover hours against one distributor order two days late: *"honestly, yes, I'd take that trade most of the time"*, a slip being *"an annoyed phone call from our sales rep, not a fine."* But *"'most of the time' is doing a lot of work in that sentence"* — the same distributor slipping three weeks running *"start[s] asking for a discount."* Soft, not infinitely soft, decaying with repetition on one customer. **Deposit:** *"that's genuinely a 'sit down with commercial' conversation, nobody's ever made me quantify it."*

---

### 1.2 Entity types

**E1 — Order (in the demand book)**
- *Distinctions* **(spelled out)** — Meridian vs non-Meridian (flagged on the order; it *"jumps to the top of my attention"*); family, which drives allocation and changeover.
- *State riding along* **(spelled out)** — SKU, quantity, due date + delivery window, Meridian flag, family: **base white / tinted colour / specialty clear**. *"That's not my judgment, that's how the SKU's classified in the system, it drives what changeover you need going in and out."*
- *Population* — ⚠ not obtained.

**E2 — Batch**
- *Distinctions* **(spelled out)** — inherits its order's family.
- *Relation to E1* **(spelled out)** — *"mostly the order is the batch, if it fits a reasonable run size"*; split into two batches at different times when a distributor orders *"more than makes sense in a single run"* or to interleave something urgent. *"Not a strict one-to-one — I have the freedom to split if I need to."*
- *Population* — ⚠ run sizes, split cost not obtained.

**E3 — Line** *(contended resource)*
- *Distinctions* **(spelled out)** — **Line 1**: *"the old workhorse — slower but it's qualified for everything, including specialty"*; crew say it's *"fussier to get properly clean."* **Line 2**: *"the fast one, that's your big-volume runner."* **Line 3**: *"the newest and quickest, but it's still being qualified product by product, so it can't run everything yet"* — so far *"mostly one or two SKUs."*
- *State riding along* **(spelled out)** — the family the line is currently dirty with (selects the changeover, F3); its qualification set.
- *How many* **(number)** — 3.

**E4 — Changeover tech** *(contended resource)*
- *Distinctions* **(named)** — none drawn; treated as interchangeable (ledger #8).
- *State riding along* **(spelled out)** — which line they're committed to; can be *"pulled away partway through"*, and on long soaks *"might duck off to start something on another line."*
- *How many* **(number)** — 2 on day shift for all three lines. *"That's it. No dedicated tech per line."*

**E5 — QA lab**
- ⚠ nothing obtained but its existence, that every batch passes through, and that it *"gets backed up on a Friday afternoon."* Whether it queues like the techs is open — and load-bearing for O2 by her own diagnosis: *"half the time a 'late' order was actually sitting done in QA hold waiting for the lab to get to it."*

---

### 1.3 Boundary conditions

**B1 — ERP weekly pull** — *starting state* **(spelled out)**: orders come from ERP on the weekly pull with SKU, quantity, due date, Meridian flag. *Arrival pattern* — ⚠ **not obtained** (demanded: spread).

**B2 — Mid-week drop-in order and the heads-up before it** — ⚠ **not obtained** (demanded: spread). Only the anecdote: *"I had a heads-up another same-family white order was about to drop in from a distributor."* Who, how far ahead, how often right: all unknown. **This is the trigger O1 hangs on.**

**B3 — Meridian dock appointment** — *pattern* **(spelled out, qualitative)**: ship date + delivery window on the order, resolving to a specific appointment their end. Lead-time distribution ⚠.

**B4 — Tech availability** — **partially spelled out**: two techs, **day shift**. Coverage outside day shift ⚠ (ledger #5).

**B5 — Line 3 qualification set** — ⚠ *"mostly one or two SKUs"*; which ones, unknown.

---

### 1.4 Activities

**A1 — Lands in the demand book.** Needs the weekly pull; produces an order in the book, flagged or not; unattended (ERP); instantaneous. **spelled out**

**A2 — Allocate to a line.** Needs an order; produces an assignment; performed by Marta; not a schedule constraint — for Meridian whites *"that's not really a decision."* Rule: P1. **spelled out**

**A3 — Reorder the queue.** Needs an order behind others; produces a changed sequence; performed by Marta. *"Sometimes I'll reorder things a bit so it doesn't get stuck behind a big changeover."* Rule: P4. **spelled out**

**A4 — Quick rinse, same family (white→white), Line 2**
- *Needs* — previous batch off, a tech free, next SKU same family. *Produces* — *"the fill head's actually running clean product again."*
- *Performed by* **(named)** — one tech.
- *Duration, line down* **(spread)** — **typical 25 min**; **worse 45 min**, *"usually because the tech's tied up finishing something on another line first and there's a wait before they even start on Line 2"*; **better 15 min**, *"if the tech's standing right there and it's a genuinely easy one."*
- *Crew hands-on* **(spelled out)** — equals line-down: *"the tech's on it start to finish, no gap between 'crew starts' and 'line stops.'"*
- *Mode-change loss* — this activity **is** the loss.
- *Varies by type* **(named)** — yes, by family-pair (F3). By line: ⚠ ledger #1, #2.

**A5 — White → tint, Line 2** — *"the easier direction"*
- *Performed by* **(named)** — one tech.
- *Duration, line down* **(spread)** — **typical 45 min**; **worse "an hour and a bit"** (ledger #3), *"if the tech gets pulled away partway through"*; **better ~30 min**, *"if everything's staged."*
- *Crew hands-on* **(spelled out, qualitative)** — *"hands-on for most of it — this one doesn't have much soak-and-wait, it's mostly just doing the work."* Fraction: ledger #4.

**A6 — Tint → white, Line 2, full washdown** — *"the ugly one"*
- *Needs* — as A5 plus a **passing visual check** before release to production.
- *Duration, line down* **(spread)** — **typical ~3 h**; **worse 4 h "maybe a bit more"** (ledger #3), *"if it doesn't pass the visual check first time and they have to redo part of it"*; **better ~2 h**, *"a clean fast one… if the crew's good and nothing complicates it."*
- *Crew hands-on* **(spelled out, qualitative; her own hedge preserved)** — *"less than the 3 hours suggests — there's real soak and rinse-cycle time where the tech's not standing there… I'd guess they're actually working maybe half of that."* Fraction: ledger #4.
- *Rationale* **(spelled out)** — *"any pigment left behind ruins a white batch, so it's a full washdown."*
- **Asymmetry is load-bearing** — *"It absolutely depends on direction — that's the thing people forget… it is absolutely not symmetric, and it trips people up if they assume it is."*

**A7 — Into / out of specialty clear, Line 1**
- *Duration, line down* **(spread)** — **typical 2 h**, *"roughly the same both directions, unlike white/tint"*; **worse 3 h**, *"if it's coming out of clear and they're being extra careful about residue, since clear can be sneaky — you don't always see it the way you'd see pigment"*; **better 1.5 h**, *"a quick swap and the line was already fairly clean."*
- *Crew hands-on* **(spelled out, qualitative)** — *"most of that — specialty doesn't have the long soak cycles… it's more just physically thorough cleaning because the product's thick and clingy."* Fraction: ledger #4.

**A8 — Run the batch** — mix, mill, tint (or *"straight through if it's a plain white"*), fill, pack.
- *Needs* **(spelled out)** — clean line in the right family state; batch released to run. *Produces* **(spelled out)** — filled and packed batch.
- *Performed by* — ⚠ line operators never elicited as a resource.
- *Duration* — ⚠ **nothing obtained** (demanded: spread, per family and per line).
- *Varies by type* — partially: *"for a white that's usually the more straightforward path"*, but no durations attach.
- **The largest hole in the model.** O1 is a question about a week; run time is most of a week.

**A9 — QA hold and release** — *"every batch does."*
- *Performed by* **(named)** — the lab (E5).
- *Duration* — *"typically a few hours before it's released"*: an honest **number at the wrong precision**; demanded as a **spread**. ⚠
- *Failure path* — ⚠ never asked.
- *Pathology* **(spelled out qualitatively; rate ⚠)** — *"if QA's backed up on a Friday afternoon, that's where it actually goes sideways, not on the line"*; *"the QA step is the one people don't think about when they're mad at scheduling."*

**A10 — Stage for shipping and ship.** Needs QA release; produces the order off the dock; *"that's when the truck appointment matters."* Constraint C4. Duration ⚠.

**A11 — Tech pulled away mid-changeover** *(event, not step)* — named as the mechanism behind A4's and A5's worse tails. *Rate* ⚠ not obtained separately; currently only implicit in those tails (P01 unsatisfied).

**A12 — Washdown fails the visual check, part redone** *(event, not step)* — named as the mechanism behind A6's 4 h tail. *Rate* ⚠ (ledger #7).

**A13 — "The mill motor issue"** *(event, named in passing only)* — offered as an example of what a *structural* line difference would look like, in contrast to Line 1 merely being fussier. Rate ⚠, duration ⚠, consequence ⚠. This is the entirety of the breakdown stratum, which was never swept.

---

### 1.5 Ordering / flow

**F1 — The main arc, desk to dock** **(spelled out — her six steps)**
1. Lands in the demand book (ERP weekly pull).
2. Allocated to a line (*"Meridian whites always go to Line 2"*).
3. Sits in the queue behind whatever's running — reorderable (A3/P4).
4. Changeover if needed (F3), then runs: mix, mill, tint-or-straight-through, fill, pack.
5. QA hold.
6. Released, staged, out against the truck appointment.

**F2 — Order-to-batch split** — *order* **(spelled out)**: one batch by default, possibly two run at different times. *Branch decided by* **(spelled out)**: Marta, on run size or urgency-interleaving. *Cost of a split* ⚠ (P03 unresolved).

**F3 — Which changeover applies** **(spelled out)** — by (family on the line, family of next batch, line): same family → **A4**; white→tint → **A5**; tint→white → **A6**; into/out of specialty → **A7** (Line 1 only).

---

### 1.6 Policies

**P1 — "Meridian whites always go to Line 2, that's just how it's done here."** *Practiced* **(spelled out)**; a fixed allocation, not a decision. Overrides ⚠ never asked.

**P2 — Meridian on-time is absolute.** *Practiced* **(spelled out)** — *"we don't even try to be clever about it."* Overrides **(spelled out)**: none — that is the policy's content. Rationale: fine, on-time percentage, delisting precedent.

**P3 — Who gets the tech when two lines want one**
- *Prescribed form:* **none exists** — *"there's no posted rule at all."*
- *As practiced* **(spelled out)** — in the room: *"whoever's louder at the huddle, or whoever's about to actually run dry."* The underlying logic: *"it's mostly gut triage: whichever line has the more time-sensitive order behind it wins, and if that's a tie, whichever changeover is faster wins so you get a line moving sooner."*
- *Borderline case on record* — Line 1 and Line 3 both wanted a washdown one morning. **Line 3 got the tech**, *"not because it was more important, but because Line 3's changeover was the quick one and Line 1's was going to be the long tint-to-white slog anyway, so the thinking was 'knock out the fast one, get that line moving, then commit the tech to the long one.'"* Line 1 sat **clean-but-waiting almost 40 minutes**.
- *What overrides it* **(spelled out)** — the ops director: *"I've been overruled by the ops director once when he wanted his pet SKU out the door."*
- *Rationale* **(spelled out)** — *"the crew's a shared resource and sometimes there's a queue for them before the clock even starts on the line"* — *"the bit that actually causes grief at the huddle."*

**P4 — Reorder so a job isn't stuck behind a big changeover.** *Practiced* **(spelled out)**. Overrides ⚠.

**P5 — Hold the line for an anticipated same-family order** *(the decision under test)*. *Practiced, one instance* **(spelled out)** — hold Line 2 idle *"maybe an hour"* rather than wash down for the waiting tint, *"because doing them back to back would save us a full washdown."* Trigger strength and holding threshold ⚠ (depends on B2).

**P6 — Batch-split discretion.** *Practiced* **(spelled out)** — *"I have the freedom to split if I need to."* Overrides ⚠.

---

### 1.7 Constraints

**C1 — Line qualification.** *Limit* **(partially spelled out)** — Line 1 everything incl. specialty; Line 3 product-by-product, *"can't run everything yet"* (which SKUs ⚠); Line 2's set ⚠. *When hit* **(spelled out)** — the batch cannot go on that line.

**C2 — Two techs, three lines.** *Limit* **(spelled out)**. *When hit* **(spelled out)** — *"if Line 1 and Line 3 both want a washdown at the same time, one of them waits"* — clean-but-idle, 40 min in the recorded case; resolved by P3.

**C3 — Tint→white needs a full washdown passing a visual check.** *When hit* **(spelled out)** — *"any pigment left behind ruins a white batch"*; a failed check means part is redone (A12).

**C4 — Meridian must leave our dock a day ahead of the appointment.** *When hit* **(spelled out)** — fine, on-time percentage damage, delisting exposure.

**C5 — Every batch passes QA hold before release.** *When hit* **(spelled out)** — nothing ships unreleased; it waits in hold.

**Unwritten constraints** — ⚠ the closing sweep was never run. The one that surfaced unprompted is the changeover asymmetry: *"that one catches everybody, including people who've been on the floor a lot longer than me."*

---

### 1.8 Dynamics

**None.** Nothing described evolves continuously while nothing discrete happens. The soak and rinse-cycle time inside A6 is dead time *within* an activity, not a state variable crossing a threshold; I have deliberately not promoted it to one.

---

### 1.9 Data bindings *(named only — project to nothing today)*

| Feed | Would drive | Provenance |
|---|---|---|
| Changeover logs (tech start/finish) | A4–A7 durations, crew hands-on fractions; retires ledger #1, #4 | **Qualified:** *"I've never audited that field myself, I mostly just glance at duration."* Coverage unknown, possibly patchy; **Line 1 and Line 3** named as where to look. Marta will flag it to the two techs. |
| ERP demand book | B1, B2 | not discussed |
| QA release timestamps | A9 duration, lab queueing | not discussed |
| Meridian on-time percentage | O2 | tracked by Meridian; visible to commercial |

**Finding in its own right:** patchy changeover logging concentrated on Lines 1 and 3 is evidence about the plant, not merely an obstacle — *"that itself would be useful for you to know, not just an inconvenience."*

---

### 1.10 Validation criteria

⚠ **None obtained.** How Marta would know the model is right was never asked.

---

## 2. Assumption ledger

Everything here is mine. None of it is hers.

| # | Assumption | Why | How to check |
|---|---|---|---|
| **1** | Line 1 changeover durations = Line 2 × **1.2**, all types | She could not give Line 1 minutes — *"I couldn't swear the minutes are identical… the crew sometimes says it's fussier."* I proposed 20%; she replied *"20% sounds about right, not double."* **The factor originated with me**; her assent is not authorship. | Changeover logs, Line 1 vs Line 2, same family-pair. **Blocked by the unaudited start/finish field — and Line 1 is one of the two lines she expects to be patchy.** |
| **2** | Line 3 changeover durations = Line 2, unscaled | *"Line 3 I genuinely don't have a good feel for… you're stuck assuming it's like Line 1 or Line 2."* She offered the disjunction; **picking Line 2 was mine.** | As #1, once Line 3 has run more products. Also expected patchy. |
| **3** | "An hour and a bit" (A5 worse) = **70 min**; "4, maybe a bit more" (A6 worse) = **4.5 h** | Numeric readings so the spreads are usable. | One question to Marta: confirm or correct. |
| **4** | Crew hands-on: A4 = **1.0**, A5 = **0.8**, A6 = **0.5**, A7 = **0.8** | A4's 1.0 is hers, stated. A6's 0.5 tracks *"maybe half of that"* — but note her hedge, *"I'd guess."* **The two 0.8s, from "most of it" / "most of that", are mine.** | Changeover logs vs tech time records, or ask the techs. Same blocker as #1. |
| **5** | No changeover outside day shift | She said *"two techs on **day shift**"*; other coverage never asked. | One question to Marta. |
| **6** | A changeover needs exactly **one** tech | She said *"the tech"*, singular, throughout — including the 3-hour washdown. | One question to Marta or the techs. |
| **7** | A12 folded **inside** A6's 4 h tail rather than a separate event with its own rate | She described it as *the cause of* the tail. Keeps the spread self-contained; contrary to P01, which would separate rate from duration. | Ask how often the visual check fails first time; split it out if common. |
| **8** | The two techs are **interchangeable** | She drew no distinction. | One question to Marta. |

**Second-order note on #1 and #4:** their check depends on a feed of unverified coverage, concentrated exactly where the assumptions bite. If the field proves patchy on Line 1, the honest move is to **widen** them, not fill them in.

---

## 3. What the model leaves out, and why

**Deliberately excluded**
- **Queues, buffers, waiting states** are not nodes — the wait behind a running batch, the wait for a tech, the wait in QA hold. Each is implied by the activities either side and emerges in projection. Line 1's 40 minutes clean-but-waiting is an **output** the model should reproduce, not an input.
- **The commercial layer** — fine amount, on-time percentage mechanics, delisting threshold. C4 and O2 carry the hard deadline; the money is outside the scheduler's sight and commercial owns it.
- **Individual tech identity** (ledger #8). **Scenarios** — assembled from B1–B5 at simulation time, not elicited.

**Real, and the formalism cannot carry it — kept in words**
- **O4, "how ugly the sheet looks."** A criterion she genuinely uses and explicitly refuses to number. Approximating it as line idle hours would be my move; I have not made it.
- **The O2 / O3 / lateness trade-off weight.** Unquantified with the source named. The model can report changeover hours, Meridian lateness and distributor lateness **separately**, but cannot rank two schedules that trade one against another — a real limit on O1, whose "costs less" implicitly spans them.
- **The decay of softness** — the same distributor slipping *"the third week running"* turning into a discount demand: a memory effect across weeks on one customer, stated as a rule, unquantified, unrepresented.
- **The huddle.** *"Whoever's louder"* and the ops director's pet-SKU override are the real P3 in the room. The triage logic is compilable; loudness and the override are not. **Any run of this model will be quieter and more rational than the plant.** Remember that when a result looks tidy.

---

## 4. What remains unknown, in the order I would close it

1. **A8 run duration** — nothing at all, per family and per line, as a spread. **Nothing about O1 is answerable until this exists.**
2. **B2, the drop-in and the heads-up** — who, how far ahead, how often right. P5 is the decision under test and its trigger is one anecdote.
3. **A9 QA hold** — *"a few hours"* is honest at the wrong precision; and whether the lab queues like the techs. By her own account this is where lateness actually comes from, so it bears directly on O2.
4. **B1** — orders per weekly pull and within-week shape.
5. **E2 / F2** — run sizes, the "reasonable run size" threshold, and what a split costs in extra changeovers.
6. **C1 / B5** — which SKUs Line 3 is qualified for; whether Line 2 has restrictions.
7. **Breakdowns and interruptions** — the whole stratum. A13 is a name with no rate, duration or consequence; A11 and A12 need rate separated from duration.
8. **Unwritten-constraint sweep** and **validation criteria** — neither was run.

**Status against the completion criteria**
- **Static floor: satisfied** — 4 objectives, 5 entity types, 13 activities, 3 ordering/flow nodes.
- **O2, O3:** slices substantially satisfied except A8 and A9 durations.
- **O1: slice incomplete.** A8 has no duration; B2 has no arrival pattern. O1 is currently **answerable only for Line 2**, and only once run times exist. Ledger #1–#4 are the first assumptions to attack if any Line 1 or Line 3 result ever looks decisive.
- **O4:** recorded; unsupported for quantitative use, by its author's own description.

**What I do not claim.** I have elicited a model, not built a net. The SDCPN scaffold, the code-obligation sidecar and the typed loss report are derived from this model by the tooling's projection — I have not written them, and I am not claiming this loads, compiles, or runs. The A8 hole alone would stop it.

---

*Session closed at the expert's stop. Three questions queued for resumption: run duration for a plain white on Line 2 (typical / one-in-ten worse / one-in-ten better); the heads-up mechanism behind B2; QA hold as a spread, and whether the lab queues.*
