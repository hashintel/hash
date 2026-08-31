# Baseline control — condition 1 (bare)

- Run started: 2026-08-13T10:22:15.639Z
- Interviewer: claude-opus-5 (no system prompt)
- Simulated expert: claude-sonnet-5 + situation-pack.md
- Interviewer turns: 21 (impatience probe at 8, forced wrap at 20)
- Stop reason: delivered-after-forced-wrap
- Tokens: 929821 in / 63724 out across 70 calls

---

**Opening message**:

I'm the master scheduler at a coatings plant. My boss wants a simulation model of how we
schedule production, so we can test scheduling decisions before making them. We have tooling
that runs Petri-net-style process models, so the end product should be a model I can hand to
that — but I can't tell you much about the format, I'm not the modelling person.

Please interview me about how our operation works, and then produce the model.

---

**Interviewer**:

Happy to do this. Before the questions, two framing notes:

**What I need most.** The single biggest driver of how I build this is _which decisions you want to test_. "Should I run whites before blacks all week?" needs a very different model from "should I buy a fourth filling line?" So question 1 below matters more than all the rest.

**On the format.** I can't guess your tooling's dialect, so I'll deliver two things: a plain-language spec (places, transitions, arcs, timings, decision rules) that any Petri-net person can implement in an afternoon, plus a PNML file, which is the closest thing to a standard interchange format. If you can get one answer out of your modelling person, make it this: _does the tool support timed transitions and coloured/typed tokens, or is it plain place/transition nets?_ Coatings scheduling is all about "this batch is dark red and needs a 90-minute wash before the next white" — that's much cleaner with coloured tokens, and much clumsier without. I can do either.

Now the interview. **Answer what you can and skip the rest — rough guesses are fine, and "I don't know" is a useful answer.** I've put my default assumption in brackets where I have one, so you can often just say "yep."

---

## 1. What are you trying to learn from it?

1. Give me two or three real questions you'd want to ask this model. The more specific the better — e.g. "if I hold the small filling line for urgent orders only, do I miss fewer due dates?"
2. Is there a known bottleneck or sore spot? I'll model that part in detail and abstract the rest, rather than modelling everything at uniform detail.
3. Who else will look at the output — just you, or your boss and planners too?

## 2. The process route

1. What are you making, broadly? [Assuming liquid coatings — solvent-borne and/or water-borne, batch production.]
2. Walk me through the steps a batch goes through. My straw man: raw material weigh/dispense → premix → dispersion or milling → let-down/thin-down → QC sample and adjust → filter → fill and pack → warehouse. Correct, add, delete.
3. Do all products follow the same route, or are there variants — e.g. some skip milling, some need multiple mill passes?
4. Roughly how many distinct products/SKUs, and how many meaningfully different _routes_? (I don't need the SKU list, just the shape of it.)

## 3. Equipment

1. How many of each vessel/machine — mixers, mills, filling lines? Approximate is fine.
2. Are they interchangeable, or restricted? Typical restrictions: only certain tanks for water-borne, only the big mixer for volumes over X, whites kept off vessels that have run dark shades.
3. **Important:** when a batch finishes mixing but the filling line is busy, where does it sit? Does it stay in the mixer (blocking it) or go to a holding/storage tank? If holding tanks, how many, and are they dedicated?
4. Are people a constraint — operators per shift, one lab tech covering everything, a single cleaning crew? Or is labour effectively always available?

## 4. Batches and time

1. Is batch size fixed by the vessel, or do you flex it to the order? Do you ever combine several orders into one batch, or split one batch across several pack sizes / fill runs?
2. Rough durations for each step, and what makes them vary (product, batch size, viscosity)?
3. What time resolution do you care about — minutes, hours, or shifts? [Assuming hours.]
4. Shift pattern, weekend working, and how planned maintenance fits in. Can a batch be left part-finished over a shift break, or must some steps run to completion once started?

## 5. Changeovers — probably the crux

1. What determines the cleaning needed between two batches in the same vessel? Colour sequence, resin chemistry, both? I'm expecting something like a light-to-dark rule with a full solvent wash needed when you go backwards.
2. Roughly what do the different cleaning levels cost you in time? (e.g. same colour = quick rinse 20 min; light after dark = full wash 3 hrs.)
3. Do you deliberately run campaigns — batching up all the whites, then greys, then blacks — and if so over what cycle? Weekly?
4. Does cleaning consume something scarce: a wash bay, a crew, solvent, waste capacity?

## 6. QC and rework

1. After let-down you sample and test. How long does the lab take, and does the batch hold the vessel while it waits?
2. What fraction of batches pass first time? On a fail, what happens — tint adjust and retest (how many loops before you give up?), hold for review, downgrade to another SKU, scrap?
3. Any other rework loops — regrinds, refiltering, refill after a fill-line fault?

## 7. Demand and disruption

1. Make-to-order, make-to-stock, or a mix? If stock, do you replenish to reorder points?
2. How do orders arrive and how firm are they? Do you get urgent inserts that jump the queue, and how often?
3. Raw materials: assume always available, or do shortages genuinely drive your schedule? Any long-lead or single-source items?
4. Breakdowns: frequent enough to matter, or rare? Rough failure rate and repair time for the important machines if so.

## 8. Scoring the schedule

1. What makes a schedule good, in your judgement, in priority order? Candidates: due-date/OTIF performance, total changeover time or solvent used, throughput, vessel utilisation, WIP sitting in tanks, overtime.
2. Are there hard rules I must never break, versus preferences? (e.g. "a batch never sits more than 48 hrs before filling" is often a hard one.)
3. How do you actually sequence today — a spreadsheet, a rule of thumb, gut feel? I'd like the model to be able to reproduce your current approach as a baseline, so you can compare alternatives against it.

---

Send back whatever you've got. If you'd rather not answer all of it, give me sections 1, 3, 5 and 8 and I'll build a first cut with explicit assumptions marked, which is often a faster way to find out what I got wrong.

---

**Expert (Marta)**:

Right, let's do this. I've got about forty minutes before the huddle, so I'll go fast.

## 1. What I want to know

Three real questions, in order of how much I actually lose sleep over them:

1. When a line goes down at 6am, what's the best re-shuffle of the rest of the week — right now I improvise at the huddle and I know it's not great.
2. Is it ever worth sitting a line idle for an hour or two waiting for a same-family order, instead of paying for the washdown now? I do this by gut and nobody can tell me if I'm right.
3. Where do my changeover hours actually go, and would reordering the run sequence claw any back?

Sore spot: changeovers, no question. Tint→white washdowns are the expensive one, and the crew is shared across three lines, so it's not just the time, it's who's waiting on who. Model that in detail. The mixing/dispersion end I care about less.

Who looks at it: me first, then probably my boss (ops director) if it says anything useful. Commercial might get pulled in if it touches due-date stuff, but that's a maybe.

## 2 & 3. Process and equipment — quick corrections

We're coatings, yes — mix, mill, tint/letdown, then fill & pack. That's it, four stages, same order for everything. No separate QC-hold-and-adjust step in the way you described — QA sits at the _end_, after fill, not mid-process. I'll come back to that under section 6.

Three filling lines, not identical — Line 1 old and slow but does everything including specialty, Line 2 fast and big-volume, Line 3 newest, still being qualified SKU by SKU. About 14 SKUs, three families: base whites, tinted colours, specialty clears. Routes are the same shape for everyone, just different speeds and fussiness — specialty is thick and slow, particularly up at the mill end.

Holding tanks between stages, small ones. Line 1's mill-to-fill tank is the one that gives me grief — I think it's undersized and backs the line up, though engineering points at the line rate and says that's not it. One changeover crew, two techs, day shift, covers all three lines — that's a real constraint, if two lines want washing at once someone waits.

## 5. Changeovers — since you want detail here

Same-family rinse: quick, 20–30 minutes. Family switches are the real cost, and they're **not symmetric** — white to tint, maybe 45 minutes. Tint to white is a full wash, about 3 hours, because pigment carryover wrecks a white batch. Specialty in or out, either direction, roughly 2 hours.

We don't run strict weekly campaigns, but I do try to cluster — I'll hold a family together on a line rather than ping-ponging, purely to dodge the 3-hour wash. Cleaning eats the shared crew, that's the scarce resource, not solvent or bay space as far as I know.

## 6. Quality — correction to your model

No mid-process sample-adjust-retest loop. What happens is: batch finishes fill & pack, then sits in QA hold — about four hours typically, specialty can be a day. Lab's two people, backs up end of week. I don't have first-pass-yield numbers off the top of my head; I don't think we track it that granularly, quality just reports scrap as a monthly percentage across the board.

One thing I will flag: after any family switch the first units off the line are junk — "ramp scrap" — worse after the big washdowns. I can't give you exact quantities per changeover type though, that's not something I've got broken out.

## 8. Scoring and how I do it today

Priority order, honestly: don't ship late to Meridian, ever — that's our biggest account, mostly whites, and they fine and delist. Other big distributors can slip a couple of days if we phone ahead. Small accounts can slide a week and nobody notices. After that, changeover hours, then general utilization.

No hard rule I can quote you on tank dwell time or anything like that — the closest thing is Meridian white orders _always_ go on Line 2, that's just how it's done, has been for years. Specialty only runs on Lines 1 and 3, Line 2 was never set up for the clear resins.

Today I sequence off a spreadsheet — I map the week's demand book onto the three lines, rough rate per product per line, add changeover by feel, and I re-juggle it out loud at the 07:30 huddle most mornings. That sheet is the baseline you should try to reproduce first, honestly — if your model can't match what the sheet does, I won't trust what it says about doing better.

Send me the questions you're still stu

---

**Interviewer**:

Your message cut off at "still stu—", so I may be missing a line. Here's what I've got.

Three flags first, then the questions. The flags matter more than the questions.

---

## Flag 1: your Q1 isn't a simulation question, quite

"What's the best re-shuffle when a line goes down at 6am" is an _optimisation_ question. A Petri-net model simulates a policy you give it — it won't hand you the optimum reshuffle.

What it _will_ do: let you set up the Tuesday-morning-Line-2-is-dead scenario and race three or four candidate responses against each other (push everything to Line 1 / hold the tint block and pull whites forward / split across 1 and 3 and eat the specialty changeover). You get lateness and changeover hours for each. Over enough simulated breakdowns you can find which _rule_ wins on average, and that's the thing you'd actually take to the huddle — not a schedule, a reflex.

If you want true "give me the optimal reshuffle," that's a different tool and a bigger build. Tell me if that's the real requirement, because it changes what I hand you.

## Flag 2: I can't settle the Line 1 tank argument, and neither can the model

You think the mill-to-fill tank is undersized; engineering says it's the line rate. Whatever I assume about tank capacity and line rate, the model will faithfully reproduce that assumption and appear to prove one of you right. That's not evidence, it's just my guess with a simulation wrapper on it.

Two ways to make it real:

- **Measure it.** If tank capacity and Line 1's actual rate come from data, the model arbitrates honestly.
- **Invert it.** Don't ask "which is it," ask "how small would the tank have to be to cause the backup we see?" If the answer is "smaller than it actually is," it's the line rate. This is often the faster route and needs no new instrumentation — just a decent estimate of tank volume and observed blocking.

Either way: **do not let this model into a room with engineering as an argument-winner** until the inputs are measured. It'll get shredded, deservedly, and take the rest of the model down with it.

## Flag 3: the numbers you don't have

You flagged three: first-pass yield, ramp scrap per changeover type, and quality only reporting monthly scrap in aggregate.

I'm not going to fill those with plausible-looking invented figures — you'd have no way to tell them from real ones six weeks from now. Instead I'll build them as exposed parameters and run them as **threshold questions**:

> "Waiting two hours for a same-family order beats washing now — as long as ramp scrap after a tint→white wash is above about 40 units. Below that, wash immediately."

Then you only need to know which side of 40 you're on, which someone on the floor probably can eyeball, rather than needing a precise number. Same trick for first-pass yield. Every one of these gets logged in an assumptions register at the front of the deliverable, flagged UNVALIDATED, so when your ops director asks "where did that come from," the answer is on page one.

---

## What I actually need

**Blockers — I can't build a credible first cut without these:**

1. **The spreadsheet.** Send it as-is, mess and all. Rates, changeover allowances and your sequencing instincts are all in there, and it saves you answering half of what follows.
2. **Rate matrix** — units/hr for each SKU on each line, plus which SKUs Line 3 is actually qualified for today. Rough is fine. This is the single biggest driver of everything.
3. **A real demand book** — 4–6 weeks of orders with quantities, due dates and customer, so I can validate against something. Meridian's share of volume specifically.
4. **Shift pattern**, and the crew rule: your two techs are day shift only. So if a wash is needed at 9pm — does the line sit dead until morning, does someone else do a rough job, or does it never happen because you sequence to avoid it? **This is probably the highest-leverage single fact in the whole model** and it's the one I'd most want before building.
5. **Breakdowns** — how often, how long, which line is worst. Q1 is entirely made of this. Even "Line 1 goes down maybe twice a month for half a shift" is enough to start.

**Quick-fire, defaults in brackets — "yep" is a fine answer:**

1. Do your 2 techs work one wash together, or can they run two lines at once? [assuming: a 3hr wash takes both, a rinse takes one]
2. Tint→tint, dark to light — rinse, or something bigger? [assuming rinse, but suspicious]
3. Are washdown times line-specific? Is Line 1 slower to clean because it's old? [assuming same everywhere]
4. Does QA hold block anything upstream, or just delay shipment? [assuming just shipment — so it hits OTIF, not throughput]
5. Does the lab backing up at end of week actually make things late, or is it absorbed?
6. Batch → fill run: does one mixed batch become one fill run, or do you split it across pack sizes? [assuming 1:1]
7. Beyond "Meridian whites on Line 2" and "specialty on 1 and 3 only" — any other rules that are just how it's done?

**One validation question:** should the baseline match _the sheet's plan_, or _what actually happened_? They differ, and the gap is usually your improvising at the huddle. I'd rather match actuals — that's what makes it credible to your boss — but I'd use the sheet for the sequencing logic.

---

Send the sheet and the demand book and skip everything else if you're short on time. If I get nothing further, I'll build the first cut on the answers above with every gap marked, and the fastest way to find out what I got wrong is for you to read the assumptions register and start crossing things out.

Still worth asking your modelling person the one question: **coloured tokens and timed transitions, or plain place/transition?** Your priority tiers (Meridian / big distributor / small account) and family-based changeovers both want colour. Without it the net gets big and ugly, and I'd build it differently from the start.

---

**Expert (Marta)**:

Okay, that "still stu—" was me trying to type "still stuck on" and my keyboard's clearly as tired as I am. Ignore it.

Let me hit your flags first since you said they matter more.

**Flag 1** — fair, and honestly that's fine. A reflex I can bring to the huddle is more useful than a magic optimizer anyway, because I still have to sell whatever it says to the line leads. Race the candidate responses, that's the right shape.

**Flag 2** — agreed, and I appreciate you not just picking a side. I don't have a measured tank volume in my head, but I can probably get it — it's a spec sheet number, someone in engineering has it, I just never asked. I like the inversion idea better actually, "how small would it have to be" — I can take that number and go looking, rather than starting a fight over whose gut is right.

**Flag 3** — the threshold framing is good, that's actually how I already think about some of this. "I'll wait if it's not much scrap" is basically what I do by feel. Fine to build it that way.

Now the blockers, in order:

1. **The spreadsheet** — yes, I'll send it. Fair warning, it's ugly and has three tabs nobody remembers the purpose of.
2. **Rate matrix** — I can pull this together, give me a day. Line 3 qualification: today it's qualified for both whites, most tints, not specialty, and not two of the tint SKUs specifically — I'd have to check which two, I think it's the deep reds.
3. **Demand book** — I can get you 4-6 weeks of history from ERP, that's a real export, not a problem. Meridian's share is big, maybe a third of white volume, I'd want to check exactly.
4. **The night question** — good catch, and the honest answer is: we sequence to avoid it. I try never to leave a wash needed overnight, because no, nobody does it off-shift, the line just sits dirty till the techs are back at 6. That's actually a real source of lost time I probably undercount when I complain about changeover hours — it's not just the wash itself, it's the wait for a tech to be available.
5. **Breakdowns** — roughly: Line 2 filler jams every week or two, half an hour to half a shift when it does. Line 1's mill motor is rare but scary — took four days once, that's the one that actually wrecked a month. Line 3 I honestly can't remember a bad breakdown, it's new.

Quick-fire:

1. One wash needs both techs together, yes — pretty sure a 3hr wash is a two-person job, a rinse one tech can do solo while the other's elsewhere. That matches your assumption.
2. Tint to tint, dark to light — I said rinse before but now you're making me think about it and I'm not actually sure that's right. I'd guess it's a bit more than a rinse if you're jumping from say a black to a pale yellow, but I've never separated it out from same-shade-family rinses. Flag that as one I got wrong, not one I know.
3. Washdown times line-specific — no, I don't think so, same everywhere, it's the same crew doing the same procedure regardless of line.
4. QA hold — just delays shipment, doesn't block anything upstream, that's right.
5. Lab backing up end of week — it does bite sometimes, that's part of why Friday shipments occasionally slip even when production hit the number. Not every week, but often enough.
6. Batch to fill run — mostly 1:1, yes, but not always — sometimes I'll split a big mix batch across two pack sizes if two orders for the same SKU land the same week. That's probably a minority case though.
7. Other unwritten rules — one more: there's a specific white SKU, VW-02, that can't run right after a dark tint even with a full wash. QA's superstitious about it, there was a scare a couple years back. It's not written anywhere, everyone who's been here a while just knows not to sequence it that way.

Validation: match actuals, not the sheet's plan. You're right that the gap is exactly what I improvise at the huddle, and that gap is probably where the real story is.

I'll go ask the modelling-tool question and get you the spreadsheet and ERP pull this week.

---

**Interviewer**:

Got the lot. Here's the first cut. The structure below is complete enough to implement; the numbers are a mix of yours, parameterised unknowns, and three things I need before it's trustworthy.

---

## Three things your answers changed

**1. Specialty is single-threaded on Line 1, today.** Your unwritten rule says specialty runs on Lines 1 and 3 — but you also said Line 3 isn't qualified for specialty yet. So in practice every specialty order goes on Line 1: your slowest line, with the contested tank, and the mill motor that once cost you four days. If that's right, it changes the answer to Q1 quite a bit — a Line 1 outage doesn't just slow specialty, it stops it. Tell me if I've misread, because I've built it that way.

**2. Tech-wait becomes a headline KPI, not a footnote.** You said it yourself: the loss isn't the wash, it's the line sitting dirty until 06:00. Your current changeover accounting almost certainly bills you for the 3-hour wash and not the 9 hours of dark line in front of it. I'm splitting the metric into **wash hours** and **wait-for-tech hours**, reported separately, with overnight-dirty called out on its own. My guess is that when you ask "where do my changeover hours go" (Q3), a big slice of the answer isn't changeover hours at all — it's crew-availability hours, and it wants a different fix.

**3. Your Q7 retraction matters more than it looks.** If dark-tint→light-tint is really a rinse, fine. If it's an hour, and you've been aggregating it into "same-family rinse" all along, then your changeover book is wrong in exactly the place Q3 is pointed. I've made shade explicit and left that cell as a swept parameter. There's a cheap measurement below.

---

## The model

**Scope.** Fill & pack and the changeover crew in full detail. Mix/mill/tint collapsed to a single timed upstream transition per line feeding a holding tank — except that the tank capacity stays explicit so we can run the Flag 2 inversion. QA modelled as a capacity-2 queue after fill.

### Colour sets

| Set         | Values                                              |
| ----------- | --------------------------------------------------- |
| `FAMILY`    | WHITE, TINT, SPECIALTY                              |
| `SHADE`     | 1–5, light→dark (TINT only; WHITE=0, SPECIALTY=n/a) |
| `TIER`      | MERIDIAN, DISTRIBUTOR, SMALL                        |
| `SKU`       | 14 values, each carrying family + shade             |
| Order token | ⟨orderID, sku, qty, tier, dueTime⟩                  |
| Line token  | ⟨lineID, lastSKU, lastFamily, lastShade, state⟩     |

### Places

**Global:** `P_Demand` (order arrivals), `P_Ready` (released, awaiting assignment), `P_Techs` (cap 2, calendar-gated), `P_ShiftOpen` (token present during tech shift), `P_Lab` (cap 2), `P_Shipped`, `P_Late`.

**Per line L ∈ {1,2,3}:** `P_Tank_L` (cap K_L, in batches), `P_LineFree_L` (holds the line token with its state), `P_LineBusy_L`, `P_NeedsClean_L` (holds ⟨from,to⟩), `P_Cleaning_L`, `P_Down_L`.

### Transitions

| Transition                | Timing                        | Guard                                                             |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `T_Upstream_L`            | by family (specialty slowest) | tank not full                                                     |
| `T_Assign_L`              | instant                       | **policy layer** — see below                                      |
| `T_StartFill_L`           | instant                       | line clean-compatible; SKU qualified on L; batch in tank; line up |
| `T_EndFill_L`             | qty ÷ rate[sku][L]            | —                                                                 |
| `T_RaiseClean_L`          | instant                       | next job needs different prep; **deferred by wait-rule**          |
| `T_StartClean_L`          | instant                       | `P_ShiftOpen` marked **and** techs ≥ n(type)                      |
| `T_EndClean_L`            | changeover matrix             | —                                                                 |
| `T_Fail_L` / `T_Repair_L` | stochastic / scenario         | —                                                                 |
| `T_QAStart`               | instant                       | lab token free                                                    |
| `T_QAEnd`                 | 4h; specialty 24h             | —                                                                 |
| `T_Ship`                  | instant                       | compare to dueTime → `P_Shipped` or `P_Late`                      |

### Changeover matrix (minutes, techs in brackets)

| From ↓ To → | WHITE       | TINT light | TINT dark | SPECIALTY |
| ----------- | ----------- | ---------- | --------- | --------- |
| WHITE       | 25 (1)      | 45 (1)     | 45 (1)    | 120 (2)   |
| TINT light  | **180 (2)** | 25 (1)     | 25 (1)    | 120 (2)   |
| TINT dark   | **180 (2)** | **D (?)**  | 25 (1)    | 120 (2)   |
| SPECIALTY   | 120 (2)     | 120 (2)    | 120 (2)   | 25 (1)    |

`D` = unknown, default 60, swept 25–180.
**Hard guard, overrides everything:** VW-02 may not follow any TINT with shade ≥ 4, wash or no wash. Modelled as a forbidden transition, not a duration.

**Ramp scrap:** `S(type)` units discarded at start of each run after a changeover. Zero for same-family; parameterised and swept for family switches, largest after tint→white.

### Policy layer — the part you'll actually tune

The baseline reproduces you:

1. Meridian whites → Line 2, always.
2. Specialty → Line 1 (see point 1 above).
3. Otherwise prefer the line whose `lastFamily` matches the order.
4. Within a line, sequence by tier then due date.
5. **Avoid stranding a wash overnight**: don't start a job that will end after tech shift-end if it leaves the line needing a wash.
6. VW-02 guard.

Alternatives to race against it: **wait-rule with threshold W** (hold the line idle up to W hours for a same-family order rather than raise a wash — this is Q2, swept 0–6h); **breakdown reflexes** A/B/C for Q1; **Meridian-priority in the QA queue** (a free OTIF experiment given your Friday lab backup).

### KPIs

Meridian lateness (any); distributor lateness >2 days; small-account >7 days; **wash hours**; **wait-for-tech hours**; **overnight-dirty hours**; ramp scrap units; per-line utilisation; **tank-blocked hours** (Flag 2).

---

## Assumptions register — all UNVALIDATED

| #   | Assumption                                         | Basis                                                                        |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| A1  | Specialty runs Line 1 only, today                  | inferred from your qualification list — **please confirm**                   |
| A2  | `D` (dark→light tint) = 60 min                     | pure guess, you retracted the rinse answer                                   |
| A3  | ≥120 min washes take 2 techs, shorter take 1       | your rule extended by me                                                     |
| A4  | Washdown times identical across lines              | your answer                                                                  |
| A5  | Ramp scrap values                                  | invented, swept not asserted                                                 |
| A6  | Line 2 MTBF ~10 days, repair 0.5–4h                | your "every week or two"                                                     |
| A7  | Line 1 mill motor modelled as scenario, not random | too rare to sample meaningfully in a 6-week run; you'd get noise, not signal |
| A8  | Line 3 breakdowns = zero                           | your answer, but "new" ≠ "reliable" long-term                                |
| A9  | Batch→fill run 1:1; splits ignored in v1           | your "minority case"                                                         |
| A10 | Lab is day-shift, FIFO                             | never asked you — guessing                                                   |
| A11 | One mill per line                                  | never established; if mills are shared the Line 1 outage is much worse       |

---

## What I still need

**Blocking:**

- **Shift pattern.** Still don't have it. How many shifts do the _lines_ run, and what hours are the _techs_ on? Everything about wait-for-tech hangs on this gap, and it's the mechanism behind your own biggest complaint.
- Confirmation on A1 and A11.
- The spreadsheet, rate matrix, ERP pull — in hand this week, understood.

**Three cheap measurements**, each worth more than a week of my guessing:

1. **Time Line 1's fill rate when the tank isn't empty.** A stopwatch and one run. Without this, rate and tank capacity are both unknown and the inversion can't identify either — you'd be picking a winner in the engineering argument by assumption again. With it, tank capacity is the only free parameter and the question answers itself.
2. **Tick sheet for the techs, two weeks:** changeover type, start time, end time. Settles `D`, `A3`, and gives me real wash durations instead of your recollection of them.
3. **Eyeball ramp scrap** after the next tint→white and after the next same-family rinse. Rough units. Enough to put you on the right side of a threshold.

---

## PNML

Ready to cut, but I'd rather burn one day waiting than send your modeller the wrong dialect. If the answer is coloured + timed, you get the model above more or less as written. If it's plain place/transition, the colour has to be unfolded into separate places per family per line — roughly four times the net, and I'd drop `SHADE` to keep it legible, which means losing the `D` question and the VW-02 guard becomes clumsy. That's a real loss, so if there's a coloured-net option in the tool, take it.

Send the shift pattern and I'll start wiring the baseline against your ERP export. First thing I'll report is whether the model can reproduce your actual weekly output per line — if it can't, that's the finding, and we fix the model before it tells you anything about Tuesdays.

---

**Expert (Marta)**:

Shift pattern, since that's the blocker: Lines 1 and 2 run two shifts, roughly 6am to 10pm, with a gap overnight. Line 3 is day shift only, 6 to 2, unless someone's approved overtime, which is rare and needs the ops director to sign off. The techs — the two changeover guys — are day shift only, 6 to 2 as well, same as Line 3's crew basically, they just cover all three lines. So a second-shift line (1 or 2) that needs a wash after 2pm is stuck dirty until the morning crew's in — that's the mechanism you flagged, and yeah, I think you're right that it's bigger than I've been crediting.

On A1 — yes, confirmed, that's right as you've built it. Specialty is Line 1 only in practice today, even though the "rule" says 1 and 3. Nobody's written that down anywhere, it's just where Line 3's qualification list has landed. Good catch, honestly, I hadn't said it out loud like that before.

A11 — one mill per line, yes, as far as I know. I've never heard of mills being shared between lines, they're bolted to each line's own setup. I'll double check but I'd be surprised if I'm wrong.

On the three measurements — I can get you all of these, and I like that you've made them cheap. Stopwatch on Line 1's fill rate with a non-empty tank, I'll do that myself next time it happens, probably this week. The tech tick sheet I'll have to ask the crew to fill in, might take a bit of nagging but two weeks is doable. Ramp scrap eyeball, I can grab that off the floor lead next tint→white changeover, shouldn't be hard.

One thing on your KPI table — "overnight-dirty hours," I like that as its own number, that's exactly the thing I've never been able to point at and say "there, that's the cost." If nothing else comes out of this whole exercise, that number alone might be worth the huddle argument.

Go ahead and wire the baseline against the ERP export once you've got it, and I'll chase the shift confirmation on Line 3 overtime frequency if you need it — right now "rare" is genuinely the best I've got, I don't have a count.

---

**Interviewer**:

Shift pattern lands, and it does more than fill a gap — it constrains the plant hard enough that some things fall out before any simulation runs. Worth checking these by eye now, because if the arithmetic looks wrong to you, my changeover matrix is wrong, and better to find that out today than after I've wired it up.

---

## The headline question, which I should have asked two turns ago

**Can a line operator do a same-family rinse themselves, or does every changeover — including a 25-minute rinse — need one of the two techs?**

Everything below assumes the second answer, because that's how I read "one changeover crew, covers all three lines." If that's right, then **Lines 1 and 2 cannot change SKU at all after 14:00.** No rinses, no pack-size swaps, nothing. Whatever's loaded at 14:00 runs until 22:00 or until it runs out and the line stops.

That's a severe constraint and it may well be wrong. If operators handle their own rinses and the techs are really a _big-wash_ crew, the second shift is flexible and the model looks quite different. Please answer this one before anything else.

---

## The tech-hour budget

Two techs × 8 hours = **16 tech-hours per day**, and that's the whole plant's changeover capacity.

| Changeover        | Duration    | Techs | Cost         | Latest start |
| ----------------- | ----------- | ----- | ------------ | ------------ |
| Same-family rinse | 25 min      | 1     | 0.4 tech-h   | 13:35        |
| White → tint      | 45 min      | 1     | 0.75 tech-h  | 13:15        |
| Specialty in/out  | 120 min     | 2     | 4 tech-h     | 12:00        |
| **Tint → white**  | **180 min** | **2** | **6 tech-h** | **11:00**    |

Three things drop out:

**Big washes are strictly serial.** Both techs are consumed, so while a tint→white wash runs, no other line can get so much as a rinse. Two big washes in a day eats 6 of the 8 clock hours and blocks everything else for the duration.

**The ceiling is about two family switches a day, plant-wide.** Three is possible only if just one of them is a tint→white, and it leaves zero slack for rinses. Call it **8–10 family switches a week, maximum**, if the techs do nothing else.

**Your instinct to cluster isn't a preference, it's forced.** Three lines × 5 days = 15 line-days against ~8 available family switches. You physically cannot ping-pong even if you wanted to.

**Sanity check for you:** does the plant do more than about eight family switches in a normal week? If yes, one of my inputs is wrong — most likely the 3-hour wash is shorter in practice, or someone's doing it solo, or people stay late more than you think. Any of those is worth knowing.

---

## The 11:00 problem, and what it does to Meridian

A tint→white wash must start by 11:00. That gives you a **five-hour window per day** for the one changeover your biggest customer depends on — because Meridian whites always run Line 2, and Line 2 runs tints too.

Line 2 runs 16 hours a day but can only cross from tint to white in a 5-hour slot each morning. Run boundaries don't land there by chance; you'd have to aim at it.

Which points at a rule worth testing:

> **A wash raised at 22:00 is free. A wash raised at 14:30 costs you seven and a half hours.**

Nothing is scheduled between 22:00 and 06:00, so a line that finishes dirty at end of second shift loses nothing overnight — the techs clean it at 06:00 and you're away. The expensive case is a changeover falling due in the 14:00–22:00 dead zone, where the line sits idle through hours you're paying for.

So the candidate huddle rule is: **on Lines 1 and 2, land family switches either before 14:00 or at 22:00 — never in between.** That's testable, and if it holds it's the most directly actionable thing this exercise produces. Deliberately leaving Line 2 dirty overnight to catch the 06:00 wash slot is, on this logic, correct play rather than sloppiness.

---

## Your Q2 changes shape

You asked whether it's worth idling a line to wait for a same-family order. Given the calendar, the answer almost certainly isn't a single number of hours — **it's a function of the clock.**

At 07:00, waiting two hours is cheap: the wash window is wide open, you can still wash at 09:00 if nothing turns up. At 12:30, waiting is nearly free in a different sense — you've already lost the ability to do a big wash today, so there's nothing to trade off. At 10:30, waiting is expensive: an hour's wait closes the 11:00 window and pushes the switch to tomorrow morning.

I'll sweep `W` as time-of-day dependent rather than constant. Expect the output to look like "before 09:00 wait up to 3h; 09:00–11:00 never wait; after 11:00 wait as long as you like."

---

## KPI definition, tightened before your boss sees it

You liked overnight-dirty hours. Protect it from the obvious attack — someone will point out that a line dirty from 14:30 to 06:00 wasn't scheduled to run for eight of those hours, and if the number includes them it's inflated and the whole model looks sloppy. Three separate figures:

| Metric                    | Example (wash raised 14:30 Line 2, washed 06:00–09:00) | Status                        |
| ------------------------- | ------------------------------------------------------ | ----------------------------- |
| Clock-dirty hours         | 18.5 h                                                 | Report, label _not a loss_    |
| Wash hours                | 3 h                                                    | Largely unavoidable           |
| **Lost production hours** | **7.5 h**                                              | **The number you argue with** |

Split the last one by cause — _techs off shift_ vs _techs busy on another line_ — because they have different fixes. The first wants a shift change, the second wants a third tech or better sequencing.

---

## Model updates

Added: `P_Calendar` with per-resource windows (L1/L2 06:00–22:00, L3 06:00–14:00, techs 06:00–14:00, lab TBC). `T_StartClean_L` now guards on _whole duration fitting inside the tech window_ — **A12: a wash is never started unless it can finish, rather than pausing at 14:00 and resuming.** Tell me if the crew would in fact stay late to finish one.

Line 3's entire operating day sits inside the tech window, so its changeovers compete head-on with the morning wash queue for Lines 1 and 2. That's a new contention I hadn't modelled.

Line 3 overtime: don't go counting it. Treat as zero in baseline and use it as a **lever** — "what is it worth to approve Line 3 overtime twice a week?" is a better question than "how often does it happen," and it takes work off you.

**New experiment, and possibly the valuable one:** move the tech shift. Both techs 06:00–14:00 (status quo) vs 10:00–18:00 vs 14:00–22:00 vs one on each shift. Note that splitting them means no big washes ever happen, so that arm probably fails badly — but it's worth showing your ops director _why_ rather than asserting it. Costs nothing to test and it's the direct answer to the lost-production number you now have a name for.

---

## Standing asks

Blocking: **the rinse question at the top.** Then spreadsheet, rate matrix, ERP pull, and A12.

Parked and fine: the three measurements, on your timescale.

Still open: PNML dialect. Nothing's changed there — coloured plus timed if you can get it.

I'll wire the baseline the day the ERP export lands. First report is whether the model reproduces your actual weekly output per line, before it says anything about Tuesdays.

---

**Expert (Marta)**:

The rinse question — good, glad you flagged it, because the honest answer is: it depends, and I've never had to think about it this precisely before. Line operators _can_ do a quick same-family rinse themselves, that's within their own job, no tech needed. It's the family-switch cleans — anything from 45 minutes up, so white↔tint, specialty in/out, and definitely tint→white — that need one of the two techs, because those involve the actual wash chemicals and a signoff step QA cares about.

So it's not quite either of your two readings. Rinses are free of the tech constraint. Everything else isn't. That should loosen the afternoon picture somewhat — Lines 1 and 2 can still do same-family pack swaps and rinses after 14:00, they just can't cross families.

Given that correction — do more than about eight family switches happen in a normal week? Honestly, thinking about it properly for the first time... probably not much more than that, no. Some weeks feel like we're constantly washing, but that might just be the _pain_ of it, not the actual count. I'd believe your ceiling.

On the 11:00 problem and the overnight-wash-is-free logic — this matches something I do already without having named it. I do try to leave Line 2 dirty on a tint at end of second shift if I know tomorrow's first order is a Meridian white, rather than force an evening wash. I've never articulated why, I just know it "feels right." Sounds like you've found the reason.

A12 — would the crew stay late to finish a wash that's mid-way at 14:00? No, not routinely. If a wash is genuinely almost done, maybe ten minutes over, someone might just finish it, but they're not staying an extra hour. Your guard is right: don't start one unless it fits.

Line 3 competing with Lines 1 and 2 for the same tech window in the morning — yeah, that's real, and now that you say it, that probably explains some of the Tuesday scheduling headaches I mentioned right at the start, where Line 3 sits clean but idle. It's not that the crew is slow, it's that Line 3's whole day is crammed into the same four hours the big lines also want their washes done.

I like the tech-shift-move experiment. Ops director will ask why we don't just add a third tech before asking about shift timing, so if the split-shift arm fails as badly as you expect, that's useful ammunition too — shows we looked at cheaper options before asking for headcount.

I'll get you the rinse-vs-tech split confirmed properly on paper (not just my memory) alongside the tick sheet, since they're the same data collection exercise really. ERP export and rate matrix by end of week.

---

**Interviewer**:

That correction does real work — it moves the constraint off rinses entirely and onto family switches alone. Which sharpens the picture rather than loosening it.

---

## What the day actually looks like now

Latest possible start for each tech-requiring changeover, working back from 14:00:

| Changeover        | Duration | Techs    | Latest start       | Blocks other lines?  |
| ----------------- | -------- | -------- | ------------------ | -------------------- |
| White → tint      | 45 min   | 1        | **13:15**          | No — other tech free |
| Specialty in/out  | 120 min  | 2        | **12:00**          | Yes                  |
| Tint → white      | 180 min  | 2        | **11:00**          | Yes                  |
| Same-family rinse | 25 min   | operator | any time line runs | No                   |

So after **13:15, no line can cross families** until 06:00 the next morning. Lines 1 and 2 run to 22:00 locked to whatever family they were on at lunchtime.

**The morning decides the day.** Whatever Line 2 is set to by 13:15 is what it runs for the next nine hours. That's not a scheduling preference, it's the calendar. It also means your 07:30 huddle is genuinely the decision point — you're not improvising around a continuous decision space, you're setting two or three switches that then lock. Fewer decisions than it feels like, each worth more.

**A new rule falls out of that:** don't commit a morning family switch unless there's enough work in that family to fill through 22:00. Switch Line 2 to white at 09:00 with four hours of white orders behind it and you get four good hours and then a dead line until morning — you've spent a 3-hour wash _and_ stranded the evening. Call it the fill-the-shift rule; I'll add it as a policy variant and test it against the baseline.

---

## Capacity or timing? — the question your ops director's answer hangs on

Freeing rinses raises the theoretical ceiling to roughly 10–13 family switches a week. You think actual is around eight.

If that gap is real, **the techs are not running at capacity, and the binding constraint is the 11:00 window rather than headcount.** A third tech mostly buys you parallel capacity you aren't using. Moving the shift buys you window.

That's a hypothesis, not a finding — it could equally be that the mix is big-wash-heavy and eight _is_ the ceiling in practice. But it's exactly what the tick sheet will settle, and it's the difference between "we need another head" and "we need the existing heads at different hours." Worth knowing which before the conversation, not during.

**And a mechanism for your Tuesday complaint:** a tint→white starting at 06:00 consumes both techs until 09:00. Line 3 runs 06:00–14:00 — so it cannot cross families for the first three of its eight hours, and it's clean, staffed, and idle while it waits. That's testable against the sheet and would explain the pattern without anyone being slow at anything.

---

## One fix to the measurement design

The tick sheet as I specified it goes to the techs — so it will capture only tech-performed changeovers. Two things get missed:

1. **Rinses**, including `D`. If dark→light tint is an operator job, it never appears, and that's the number I most need.
2. **Shadow practice** — operators handling family switches informally when no tech is free. If that happens even occasionally, my hard guard is wrong and the model will under-predict your throughput.

**Log at the line, not at the crew.** Every changeover, every line: type, start, end, and _who did it_. Same effort, catches everything, and the "who" column answers the rinse-vs-tech split on paper as a by-product of the same exercise.

`D` is now a two-dimensional unknown — duration _and_ resource class. A 60-minute operator rinse costs line time only. A 60-minute tech job with a QA signoff costs window in the morning and is impossible after 13:15. Very different consequences, so the "who" column matters as much as the stopwatch.

---

## Model updates

- **`T_Clean_L` splits in two.** `T_Rinse_L`: guarded on line calendar only, no tech token, 25 min. `T_Wash_L`: guarded on tech calendar _and_ tech tokens _and_ whole-duration-fits (A12), with a 15-minute grace parameter for your almost-done case.
- **New reported metric: family-lock hours** — time per line per day during which no family switch is possible. Pairs with lost-production hours and shows _why_ they occurred.
- **Wait-rule `W` is now morning-only.** After 13:15 the choice "wait or wash" doesn't exist; it's "run same-family or stop." Q2 collapses to a question about the 06:00–13:15 window, which makes the sweep smaller and the answer easier to state at a huddle.
- **Policy variants to race:** baseline (you) / fill-the-shift rule / time-of-day wait-rule / tech shift 06:00–14:00 vs 10:00–18:00 vs split / Line 3 overtime as a purchasable lever.

**Assumptions register delta:** A3 retired and replaced — changeovers ≥45 min require a tech, rinses don't (your answer, to be confirmed on paper). A12 confirmed with grace parameter. A2 (`D`) upgraded from unknown-duration to unknown-duration-and-resource. New A13: operators are always available during line hours, so rinses never queue.

---

## Where this stands

I think the interview is done. I have the process, the equipment, the calendar, the changeover structure, the priority tiers, and your sequencing logic. What's outstanding is data, not understanding.

**Coming from you:** spreadsheet, rate matrix, ERP export (end of week). Then the three measurements plus the "who did it" column, on the crew's timescale.

**From me, on ERP arrival:** baseline wired and the reproduction check — actual weekly output per line, and roughly eight family switches a week. If it can't hit those, that's the finding and I fix the model before it says anything about Tuesdays.

**On the dialect:** if I haven't heard by the time the export lands, I'll ship coloured-plus-timed as primary and a reduced plain place/transition fallback for the fill-and-changeover subnet only. The fallback loses `SHADE` and makes the VW-02 guard ugly, but it'll run. Better than stalling further on a question your modelling person can answer in ten seconds whenever they surface.

One thing worth banking now, before any of the data lands: _the morning decides the day, and after 13:15 every line is locked to its family._ That's true regardless of what the numbers say, it came out of your own shift pattern, and it's a defensible thing to say at a huddle tomorrow.

---

**Expert (Marta)**:

This is a lot to take in but it tracks with what I actually do without having said it out loud — the 07:30 huddle _is_ the decision, not a running commentary on one. That "morning decides the day" line, I'll use that at the huddle tomorrow, honestly, it's a cleaner way of saying something I've been saying badly for years.

The fill-the-shift rule rings true too — I've absolutely done the thing where I switch a line for four hours of work and regretted it by evening, I just never called it a rule, I called it "having a bad day."

On the tick sheet fix — good, yes, log at the line not the crew, that's obviously right once you say it, and it's barely more work for whoever's writing it down. I'll set that up instead of the version I described before. And you're right that I don't actually know if operators ever do a family switch informally when a tech's tied up elsewhere — I want to say no, that's not allowed, but "not allowed" and "never happens" aren't the same thing on a busy Tuesday. Worth watching for on the sheet rather than me asserting an answer.

I don't have anything to correct on the capacity-vs-timing question — that's exactly the kind of thing I wanted this whole exercise for, and I'm glad it's sitting on "let's measure it" rather than either of us guessing.

Nothing else outstanding from my side. I'll get the spreadsheet, rate matrix and ERP export moving today, and chase the tooling person on the coloured-vs-plain question this afternoon so you're not stuck guessing on the dialect too. I'll ping you the moment the export's ready.

---

**Interviewer**:

Good. Two small things to hand over, then I'll get out of your way.

**The tick sheet, in one line, so you can set it up today.** One row per changeover, any changeover, all three lines:

> date | line | from-SKU | to-SKU | start | end | done by (operator / tech) | units scrapped at start of run

Eight columns, and the last one folds your ramp-scrap eyeball into the same exercise rather than a separate one. If the crew will only reliably fill in six, drop `units scrapped` and `from-SKU` — I can reconstruct the from-SKU from the run log.

**One caution on how you frame it to the crew.** The "done by" column only tells you the truth if nobody thinks it's a compliance check. If it reads as _are operators doing washes they shouldn't_, you'll get a clean sheet that says exactly what policy says, and the most interesting thing in the dataset will vanish. Frame it as working out which changeovers genuinely need a tech, because that's true — it's the capacity-vs-timing question, and it's the case for either a shift change or a third head.

**For tomorrow's huddle, what's safe to say and what isn't.**

Safe — it comes straight from your own shift pattern, not from my model: after 13:15 no line can cross families, so the morning decides the day; and a wash raised at 22:00 costs nothing while one raised at 14:30 costs the evening.

Hold back — the eight-switches-a-week ceiling, the capacity-vs-timing hypothesis, and anything about Line 3's idle mornings. Those are my arithmetic on your recollections. They're likely right, which is why they're worth measuring, but if you put a number in front of your ops director and the tick sheet contradicts it in a fortnight, you'll spend more credibility recovering than you gained.

**When the export lands** I'll wire the baseline and run the reproduction check first — weekly output per line, and the switch count. If it misses, that's the interesting result and I'll come back with what the model thinks is happening versus what your ERP says happened. That's normal, not a setback; the gap is usually where an assumption is wrong, and we have eleven of those on the register waiting to be caught.

Ping me when it's ready. If the dialect answer arrives first, even better — send it on its own and I'll start the net while I wait for the data.

---

**Expert (Marta)**:

Good, that's an easy sheet to hand over — eight columns, or six if they push back, either works.

The framing caution is well taken. I'll pitch it to the crew as figuring out which cleans genuinely need two of them versus one, not as anyone checking up on them. That's honest and it'll get better data than the compliance version.

And thanks for the huddle guardrail — I was actually about to walk in tomorrow and say "we can only do eight family switches a week" like it was fact. Good thing you flagged it. I'll stick to the two safe lines and leave the rest alone until the sheet earns it.

I'll get the tick sheet out today, chase the spreadsheet and ERP export, and ping you the moment the export's ready — or sooner if the dialect answer comes back first. Thanks for this, it's been more useful than I expected going in.

---

**Interviewer**:

Glad it landed. That near-miss on the eight-switches line is worth remembering as a general habit rather than a one-off: the model will keep producing numbers that feel solid because they're internally consistent, and the ones derived from recollection will look identical to the ones derived from data. The assumptions register exists so you can tell them apart — read it before you quote anything from me.

One thing not worth waiting a fortnight for: if the tick sheet shows an operator doing a family switch in week one, send it straight over. That single row would retire a hard guard in the model and change what the baseline predicts, so I'd rather rework early than build two weeks on it.

Otherwise — dialect when you have it, export when it's ready, and I'll come back with the reproduction check rather than answers. Good luck at the huddle.

---

**Expert (Marta)**:

Understood — I'll read the register before I say anything out loud with a number attached, that's a fair rule and I'll try to actually stick to it, not just agree to it now and forget by Thursday.

And noted on the operator-switch row — I won't sit on that if it shows up, I'll flag it the same day, not batch it in with the rest of the sheet at the two-week mark.

Talk soon.

---

**Interviewer**:

Sounds good. Nothing further needed from you until the export lands.

One practical note on the register habit, since sticking to it is harder than agreeing to it: I'll keep the register as page one of whatever I send, with the unvalidated rows flagged in place rather than in a separate appendix. That way it's in front of you rather than something you have to remember to go and look up. If a number ever shows up in my output without a traceable basis, treat that as my error and push back on it.

Talk soon — and good luck tomorrow.

---

**Expert (Marta)**:

Appreciated — page one, in place, is a much better bet than relying on my memory. That's on you to maintain and me to actually read, and I'll do my part.

Talk soon.

(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)

---

**Interviewer**:

Nothing. You're done — go.

Everything outstanding is on your side and on your timescale: tick sheet out today, spreadsheet/rate matrix/ERP when they're ready, dialect answer whenever your tooling person surfaces. No further questions from me.

For the next ten minutes, the two safe lines:

- After 13:15 no line can cross families — the morning decides the day.
- A wash raised at 22:00 is free; one raised at 14:30 costs the evening.

Both come from your own shift pattern. Nothing else from me is huddle-ready yet.

Good luck.

---

**Expert (Marta)**:

Thanks — heading in now.

---

**Interviewer**:

Go well.

---

**Expert (Marta)**:

_heads to the huddle_

---

**Interviewer**:

Nothing more from me — I'll pick this up when the export lands.

---

**Expert (Marta)**:

Sounds good — talk then.

---

**Interviewer**:

Talk then. Good luck with the rest of the day.

---

**Expert (Marta)**:

Thanks — same to you. I'll be in touch once the export's ready.

---

**Interviewer**:

Speak then.

---

**Expert (Marta)**:

Speak then.

---

**Interviewer**:

👍

---

**Expert (Marta)**:

👍

---

**Interviewer**:

—

---

**Expert (Marta)**:

_nods and heads off to the huddle_

---

**Interviewer**:

_(Nothing further needed — the thread's parked until the export lands.)_

---

**Expert (Marta)**:

Understood — parked. I'll reach out once it's ready.

---

**Interviewer**:

Perfect. Talk then.

---

**Expert (Marta)**:

Talk then.

---

**Interviewer**:

_[No further response needed — conversation complete.]_

---

**Expert (Marta)**:

_[Ends here.]_

---

**Interviewer**:

Closed. See you when the export lands.

---

**Expert (Marta)**:

See you then.

---

**Interviewer**:

👋

---

**Expert (Marta)**:

I really do have to stop here. Please produce the model now with everything you have.

---

**Interviewer**:

# Coatings Plant Scheduling Model — v1.0

**Delivered:** first cut, built on interview only. No plant data has been loaded yet.

**Status:** structurally complete, numerically unvalidated. Read page one before quoting any number from this model to anyone.

---

# PAGE ONE — ASSUMPTIONS REGISTER

## A. Confirmed by you in interview

| #   | Statement                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| C1  | Four stages: mix → mill → tint/letdown → fill & pack. Same order for all products.                                          |
| C2  | 3 filling lines, 14 SKUs, 3 families (base whites, tinted colours, specialty clears).                                       |
| C3  | Lines 1 & 2 run 06:00–22:00. Line 3 runs 06:00–14:00.                                                                       |
| C4  | Changeover techs: 2 people, 06:00–14:00 only, shared across all three lines.                                                |
| C5  | Rinses (same-family, ~25 min) are done by line operators — **no tech required**.                                            |
| C6  | Family switches (≥45 min, wash chemicals + QA signoff) **require a tech**.                                                  |
| C7  | Tint→white = ~180 min, 2 techs. White→tint = ~45 min. Specialty in/out = ~120 min, either direction.                        |
| C8  | A wash is not started unless it can finish before 14:00 (≤15 min overrun tolerated).                                        |
| C9  | QA hold is **after** fill, 4 h typical / ~24 h specialty, 2 lab staff. Delays shipment only; does not block upstream.       |
| C10 | Meridian white orders always run on Line 2.                                                                                 |
| C11 | Specialty runs Line 1 only in current practice (Line 3 not qualified).                                                      |
| C12 | VW-02 must not follow a dark tint, wash or no wash.                                                                         |
| C13 | Priority: Meridian never late > distributors (±2 days) > small accounts (±7 days). Then changeover hours, then utilisation. |
| C14 | Line 3 overtime requires ops director signoff; rare.                                                                        |
| C15 | One mill per line, not shared _(you flagged you'd double-check)_.                                                           |

## B. UNVALIDATED — my assumptions, not your statements

**Every row below will produce confident-looking output. None of it is evidence.**

| #       | Assumption                                                                       | Basis                                                                                        | How it gets retired                                |
| ------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **A2**  | `D` = dark-tint→light-tint changeover is **60 min, resource class unknown**      | Pure guess. You retracted your "rinse" answer.                                               | Tick sheet: duration + "done by" column            |
| **A5**  | Ramp scrap: 0 same-family; parameterised for family switches; largest tint→white | Invented. Swept, not asserted.                                                               | Floor-lead eyeball, next tint→white and next rinse |
| **A6**  | Line 2 MTBF ≈ 10 days, repair 0.5–4 h (triangular)                               | Your "every week or two, half hour to half a shift"                                          | Maintenance log                                    |
| **A7**  | Line 1 mill motor modelled as a **named scenario**, not a random failure         | Too rare to sample in a 6-week run — you'd get noise, not signal                             | n/a — design choice, but say so out loud           |
| **A8**  | Line 3 breakdowns = zero                                                         | Your answer. "New" ≠ "reliable" at 18 months.                                                | Revisit in 6 months                                |
| **A9**  | Batch→fill run is 1:1; multi-pack-size splits ignored in v1                      | Your "minority case"                                                                         | ERP export will show actual frequency              |
| **A10** | Lab is day-shift, FIFO, no priority for Meridian                                 | **Never asked you. Straight guess.**                                                         | One question to QA                                 |
| **A13** | Operators always available during line hours, so rinses never queue              | Convenience assumption                                                                       | Tick sheet                                         |
| **A14** | Rate matrix values                                                               | **Placeholders. Not real numbers.**                                                          | Your rate matrix                                   |
| **A15** | Tank capacities K₁, K₂, K₃                                                       | **Placeholders.** K₁ is the disputed one.                                                    | Engineering spec sheet + stopwatch                 |
| **A16** | Which two tint SKUs Line 3 is not qualified for (assumed the two deepest reds)   | Your recollection, unconfirmed                                                               | Qualification list                                 |
| **A17** | Order arrival pattern and Meridian's share (assumed ⅓ of white volume)           | Your estimate                                                                                | ERP export                                         |
| **A18** | Washdown durations identical on all three lines                                  | Your answer, plausible, untested                                                             | Tick sheet                                         |
| **A19** | Operators never perform family switches informally                               | Policy, not observation. **You said "not allowed and never happens aren't the same thing."** | Tick sheet "done by" column                        |

**A19 is the one to watch.** A single contrary row retires a hard guard and changes what the baseline predicts. Send it the same day it appears.

## C. What this model cannot do

1. **It will not compute an optimal reshuffle.** It races policies you specify. The output is a _reflex_ you can defend at the huddle, not a schedule.
2. **It cannot settle the Line 1 tank argument on current inputs.** Whatever I assume about K₁ and Line 1's rate, the model will reproduce faithfully and appear to prove someone right. Run the inversion (§7.3) only after the stopwatch measurement, and do not take it into a room with engineering before then.
3. **It has no first-pass-yield data.** Scrap is a swept parameter presented as thresholds, never as a point estimate.

---

# 1. Scope and resolution

| Area                         | Detail level                                            | Why                                                                 |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Fill & pack, all 3 lines     | **Full**                                                | Your bottleneck                                                     |
| Changeover crew and calendar | **Full**                                                | Your sore spot; the real constraint                                 |
| Mix / mill / tint            | Single timed transition per line feeding a holding tank | You care less; tank capacity kept explicit for the Flag 2 inversion |
| QA hold                      | Capacity-2 queue, post-fill                             | Affects OTIF only                                                   |
| Raw materials                | Assumed always available                                | Never raised as a driver                                            |

**Time base:** minutes. **Run length:** 6 weeks + 1 week warm-up. **Replications:** 30 per policy arm (breakdowns are stochastic; single runs will mislead you).

---

# 2. Colour sets

| Set         | Values                                                      |
| ----------- | ----------------------------------------------------------- |
| `FAMILY`    | `WHITE` \| `TINT` \| `SPECIALTY`                            |
| `SHADE`     | `0`(white) \| `1..5` light→dark (tints) \| `X`(specialty)   |
| `TIER`      | `MERIDIAN` \| `DISTRIBUTOR` \| `SMALL`                      |
| `SKU`       | 14 values; each carries `(family, shade, qualifiedLines[])` |
| `ORDER`     | `⟨id, sku, qty, tier, dueTime, releaseTime⟩`                |
| `LINESTATE` | `⟨lineId, lastSKU, lastFamily, lastShade, up:bool⟩`         |
| `BATCH`     | `⟨sku, qty⟩`                                                |
| `LOT`       | `⟨orderId, sku, qty, tier, dueTime, fillEndTime⟩`           |

---

# 3. Places

### 3.1 Shared

| Place                | Type  | Init     | Meaning                            |
| -------------------- | ----- | -------- | ---------------------------------- |
| `P_Demand`           | ORDER | from ERP | Order arrival stream               |
| `P_Ready`            | ORDER | ∅        | Released, awaiting line assignment |
| `P_Techs`            | unit  | 2        | Techs **on shift and free**        |
| `P_TechsOff`         | unit  | 0        | Techs off shift                    |
| `P_TechShiftOpen`    | unit  | 0        | Marked 06:00–14:00                 |
| `P_LineOpen_1`, `_2` | unit  | 0        | Marked 06:00–22:00                 |
| `P_LineOpen_3`       | unit  | 0        | Marked 06:00–14:00 (+OT lever)     |
| `P_Lab`              | unit  | 2        | Free lab capacity                  |
| `P_LabOpen`          | unit  | 0        | Marked during lab hours (A10)      |
| `P_QAQueue`          | LOT   | ∅        | Awaiting QA                        |
| `P_Shipped`          | LOT   | ∅        | Completed                          |
| `P_Clock`            | int   | 1        | Calendar cycle token               |

### 3.2 Per line L ∈ {1,2,3}

| Place               | Type            | Init | Meaning                                    |
| ------------------- | --------------- | ---- | ------------------------------------------ |
| `P_UpIdle_L`        | unit            | 1    | Upstream (mix/mill/tint) free              |
| `P_UpBusy_L`        | BATCH           | ∅    | Upstream in progress                       |
| `P_Tank_L`          | BATCH           | ∅    | Holding tank contents                      |
| `P_TankFree_L`      | unit            | K_L  | Remaining tank slots (complementary place) |
| `P_LineIdle_L`      | LINESTATE       | 1    | Line free, carrying its last-run identity  |
| `P_LineFilling_L`   | ORDER×LINESTATE | ∅    | Fill in progress                           |
| `P_ChangeoverDue_L` | ⟨from,to⟩       | ∅    | Changeover raised, not started             |
| `P_Rinsing_L`       | ⟨from,to⟩       | ∅    | Operator rinse in progress                 |
| `P_Washing_L`       | ⟨from,to⟩       | ∅    | Tech wash in progress                      |
| `P_Down_L`          | unit            | 0    | Line failed                                |

---

# 4. Transitions

## 4.1 Calendar subnet (drives everything)

| Transition                       | Fires at                    | Effect                                                      |
| -------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `T_TechShiftStart`               | 06:00 daily                 | `P_TechsOff` → `P_Techs`; mark `P_TechShiftOpen`            |
| `T_TechShiftEnd`                 | 14:00 daily                 | Unmark `P_TechShiftOpen`; return free techs to `P_TechsOff` |
| `T_Line12Open` / `T_Line12Close` | 06:00 / 22:00               | Mark/unmark `P_LineOpen_1`, `P_LineOpen_2`                  |
| `T_Line3Open` / `T_Line3Close`   | 06:00 / 14:00 (22:00 if OT) | Mark/unmark `P_LineOpen_3`                                  |
| `T_LabOpen` / `T_LabClose`       | per A10                     | Mark/unmark `P_LabOpen`                                     |

_Weekends: all calendar transitions gated off unless the weekend-working lever is set._

## 4.2 Production

| Transition          | Delay                                       | Guard                                                                                                                                              |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T_UpStart_L`       | —                                           | `P_UpIdle_L` marked ∧ `P_TankFree_L` ≥ 1 ∧ a job is assigned to L                                                                                  |
| `T_UpEnd_L`         | `upstream_time[family]` (specialty longest) | —                                                                                                                                                  |
| `T_Assign_L`        | —                                           | **Policy layer, §5**                                                                                                                               |
| `T_StartFill_L`     | —                                           | `P_LineOpen_L` ∧ ¬`P_Down_L` ∧ batch present in `P_Tank_L` ∧ `lastSKU` prep matches job (no changeover outstanding) ∧ `sku ∈ qualified(L)`         |
| `T_EndFill_L`       | `qty / rate[sku][L]`                        | —                                                                                                                                                  |
| **`T_Interrupt_L`** | —                                           | Fires at line close if fill incomplete; fill **pauses**, resumes at next open _(assumption: fills are interruptible at shift end — flag if wrong)_ |

## 4.3 Changeover — the detailed part

| Transition            | Delay          | Resource                   | Guard                                                                                                    |
| --------------------- | -------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `T_RaiseChangeover_L` | —              | —                          | Next job's prep ≠ line's current prep. **Deferred by wait-rule W, §5.2**                                 |
| `T_StartRinse_L`      | —              | none                       | `class(from,to) = OPERATOR` ∧ `P_LineOpen_L`                                                             |
| `T_EndRinse_L`        | 25 min         | —                          | —                                                                                                        |
| `T_StartWash_L`       | —              | **n(from,to) tech tokens** | `P_TechShiftOpen` ∧ `P_Techs ≥ n` ∧ **`now + dur ≤ 14:00 + grace(15 min)`** (C8) ∧ **VW-02 guard (C12)** |
| `T_EndWash_L`         | `dur(from,to)` | releases techs             | —                                                                                                        |

### Changeover matrix

Duration in minutes / resource class / techs required.

| From ↓ To →    | WHITE             | TINT light (1–2)            | TINT dark (3–5) | SPECIALTY     |
| -------------- | ----------------- | --------------------------- | --------------- | ------------- |
| **WHITE**      | 25 / op           | 45 / tech ×1                | 45 / tech ×1    | 120 / tech ×2 |
| **TINT light** | **180 / tech ×2** | 25 / op                     | 25 / op         | 120 / tech ×2 |
| **TINT dark**  | **180 / tech ×2** | **`D` = 60 / class ? — A2** | 25 / op         | 120 / tech ×2 |
| **SPECIALTY**  | 120 / tech ×2     | 120 / tech ×2               | 120 / tech ×2   | 25 / op       |

**Hard guard, not a duration:** `to_sku = VW-02 ∧ from_shade ≥ 4` → transition disabled. No wash clears it.

### Latest feasible start (derived from C4 + C8)

| Changeover       | Duration | Latest start              |
| ---------------- | -------- | ------------------------- |
| White → tint     | 45       | **13:15**                 |
| Specialty in/out | 120      | **12:00**                 |
| Tint → white     | 180      | **11:00**                 |
| Rinse (operator) | 25       | any time the line is open |

**Consequence, hard-coded by the calendar:** after 13:15, no line can cross families until 06:00 next day. Lines 1 and 2 run to 22:00 locked to whatever family they held at lunchtime.

## 4.4 Failure and QA

| Transition   | Delay                   | Notes                                                                  |
| ------------ | ----------------------- | ---------------------------------------------------------------------- |
| `T_Fail_L`   | `Exp(MTBF_L)`           | A6/A8. Line 1 mill motor is a **scenario injection**, not sampled (A7) |
| `T_Repair_L` | `Tri(min,mode,max)`     | Fill resumes where interrupted                                         |
| `T_QAStart`  | —                       | `P_Lab ≥ 1` ∧ `P_LabOpen`                                              |
| `T_QAEnd`    | 240 min; 1440 specialty | —                                                                      |
| `T_Ship`     | —                       | `lateness = max(0, now − dueTime)` recorded by tier                    |

---

# 5. Policy layer

This is what you tune. Everything above is plant physics; everything here is a decision.

## 5.1 Baseline — reproduces you

```
1. Meridian white orders  → Line 2 (C10, absolute)
2. Specialty orders       → Line 1 (C11, currently the only qualified line)
3. Otherwise: prefer the line whose lastFamily == order.family
              tie-break: earliest available
4. Within line: sort by TIER (Meridian, Distributor, Small), then dueTime
5. Overnight-strand rule: do not start a job that ends after the
   tech window if it leaves the line needing a wash
6. VW-02 guard (C12)
```

## 5.2 Variants to race against it

| Variant                    | Description                                                                                                                                                                   | Answers              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Wait-rule `W(t)`**       | Hold line idle up to `W` hours for a same-family order rather than raise a wash. **Time-of-day dependent** — after 13:15 the choice doesn't exist, so sweep only 06:00–13:15. | **Q2**               |
| **Fill-the-shift**         | Do not commit a morning family switch unless there is enough work in that family to run through line close                                                                    | Q2/Q3                |
| **Breakdown reflex A/B/C** | A: push all to remaining lines. B: hold the tint block, pull whites forward. C: split across 1 & 3, absorb the specialty changeover.                                          | **Q1**               |
| **Tech shift position**    | 06:00–14:00 (status quo) / 10:00–18:00 / 14:00–22:00 / one tech per shift                                                                                                     | Q3 + headcount case  |
| **Third tech**             | Add one head to the existing window                                                                                                                                           | Q3                   |
| **Line 3 OT**              | Purchasable lever, 0–5 days/week                                                                                                                                              | Q1                   |
| **Meridian-priority QA**   | Non-FIFO lab queue                                                                                                                                                            | Free OTIF experiment |

**Note on the split-shift arm:** with one tech per shift, no ≥120-min wash can ever run (they need two). I expect that arm to fail badly. Run it anyway — showing your ops director _why_ a cheap option fails is worth more than asserting it, and it demonstrates you looked at rota changes before asking for headcount.

---

# 6. KPIs

## 6.1 Service (primary)

| Metric                  | Definition                                         |
| ----------------------- | -------------------------------------------------- |
| **Meridian late count** | Any lot shipped after `dueTime`. Target zero (C13) |
| Distributor late        | Shipped > 48 h after due                           |
| Small-account late      | Shipped > 168 h after due                          |
| Meridian lateness hours | Total, for severity                                |

## 6.2 Changeover — reported as three separate numbers

**Do not merge these.** A single "dirty hours" figure will be attacked as inflated the first time someone notices it counts unscheduled hours.

| Metric                    | Definition                                                       | Framing                            |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Clock-dirty hours         | Wall-clock from changeover raised to complete                    | Report, label **not a loss**       |
| Wash hours                | Actual cleaning time                                             | Largely unavoidable                |
| **Lost production hours** | Dirty time that overlapped **scheduled line hours**              | **The number to argue with**       |
| — split by cause          | `techs_off_shift` vs `techs_busy_elsewhere`                      | Different fixes: rota vs headcount |
| **Family-lock hours**     | Per line per day, time during which no family switch is possible | Explains _why_ the losses occurred |
| Family switches per week  | Plant-wide count                                                 | Validation target                  |

_Worked example — wash raised 14:30 on Line 2, executed 06:00–09:00:_
clock-dirty 18.5 h · wash 3 h · **lost production 7.5 h** (cause: techs off shift).

## 6.3 Secondary

Ramp scrap units (by changeover type) · per-line utilisation · **tank-blocked hours** (Flag 2) · tech utilisation % of the 16 tech-hours/day · QA queue length, Fri/Mon split.

---

# 7. How to use it

## 7.1 Run this first — the reproduction check

Before any experiment, before anything goes to your ops director:

| Check                      | Target                      | If it misses                       |
| -------------------------- | --------------------------- | ---------------------------------- |
| Weekly output per line     | Within ±10% of ERP actuals  | Rate matrix or tank capacity wrong |
| Family switches/week       | Your estimate: ~8           | Changeover matrix or policy wrong  |
| Late-order pattern by tier | Matches history             | Priority logic wrong               |
| Line 3 idle mornings       | Should appear spontaneously | Tech contention modelled wrong     |

**If it misses, that is the finding.** The gap points at a register row and we fix the model before it says anything about Tuesdays.

## 7.2 Then, in order

1. **Q3 — where do changeover hours go.** Baseline only. Decompose lost production hours by cause and by line. Cheapest result, no new policy needed.
2. **Q2 — the wait-vs-wash question.** Sweep `W(t)`. Expected output shape: _"before 09:00 wait up to N hours; 09:00–11:00 never wait; after 11:00 wait as long as you like."_
3. **Q1 — the breakdown reflex.** Inject Line 2 failure at 06:00 Tue, Line 1 mill motor at 06:00 Mon (4 days). Race reflexes A/B/C over 30 reps. Output is a rule, not a schedule.
4. **Rota and headcount.** Only after the tick sheet lands.

## 7.3 The Line 1 tank inversion — after the stopwatch, not before

Fix Line 1's fill rate to the measured value. Sweep K₁ downward. Find the largest K₁ that reproduces observed blocking.

- If that K₁ is **below** the spec-sheet volume → the tank is not the constraint; the rate is.
- If it is **at or above** → your instinct holds.

Without the measured rate, both parameters are free and the inversion identifies neither. It will still produce a confident-looking answer. Do not use it.

---

# 8. Parameter file

Everything below is data, not structure. Hand this to whoever fills it in; the net does not change.

```csv
# === lines.csv ===
line_id,open_time,close_time,ot_available,mtbf_hours,repair_min,repair_mode,repair_max,tank_capacity_K
1,06:00,22:00,no,PLACEHOLDER,PLACEHOLDER,PLACEHOLDER,PLACEHOLDER,K1_PLACEHOLDER
2,06:00,22:00,no,240,30,90,240,K2_PLACEHOLDER
3,06:00,14:00,yes_signoff,99999,0,0,0,K3_PLACEHOLDER

# === skus.csv ===
sku_id,family,shade,qual_L1,qual_L2,qual_L3
VW-01,WHITE,0,1,1,1
VW-02,WHITE,0,1,1,1          # C12 guard applies
T-01..T-09,TINT,1..5,1,1,mostly-1   # two deep reds = 0 on L3 (A16)
S-01..S-03,SPECIALTY,X,1,0,0        # C11: L1 only in practice

# === rates.csv ===   units/hr, PLACEHOLDER = A14
sku_id,rate_L1,rate_L2,rate_L3

# === changeover.csv ===
from_family,from_shade,to_family,to_shade,minutes,resource,techs
WHITE,*,WHITE,*,25,OPERATOR,0
WHITE,*,TINT,*,45,TECH,1
WHITE,*,SPECIALTY,*,120,TECH,2
TINT,*,WHITE,*,180,TECH,2
TINT,1-2,TINT,*,25,OPERATOR,0
TINT,3-5,TINT,3-5,25,OPERATOR,0
TINT,3-5,TINT,1-2,60,UNKNOWN,?     # A2 — sweep 25..180, both resource classes
TINT,*,SPECIALTY,*,120,TECH,2
SPECIALTY,*,*,*,120,TECH,2
SPECIALTY,*,SPECIALTY,*,25,OPERATOR,0

# === ramp_scrap.csv ===   A5 — swept, not asserted
changeover_type,scrap_units
same_family,0
white_to_tint,SWEEP_0_200
specialty_switch,SWEEP_0_200
tint_to_white,SWEEP_0_400

# === resources.csv ===
resource,count,open,close
tech,2,06:00,14:00
lab,2,PLACEHOLDER,PLACEHOLDER      # A10

# === tiers.csv ===
tier,tolerance_hours
MERIDIAN,0
DISTRIBUTOR,48
SMALL,168
```

---

# 9. PNML

**Dialect note.** Your tooling question never came back, so this is built to load anywhere: the graph structure is plain P/T-net so any PNML reader will open it, and all colour, guard, timing and resource information is carried in `<toolspecific>` blocks and inscriptions. If your tool is coloured + timed, map the annotations onto the colour sets in §2 — that is a mechanical translation, roughly an hour's work. If it is plain P/T, the net runs as-is with `SHADE` folded out; you lose the `D` question and the VW-02 guard has to become a separate forbidden-pair place per SKU.

**Coverage.** Shared resources, the calendar subnet, and **Line 1 in full**. Lines 2 and 3 are structurally identical: duplicate the `_L1` block, change the id suffix, and substitute from `lines.csv`. I've done it this way so the file stays readable — a 3× copy is ten minutes of work and impossible to get wrong, whereas a 900-line file nobody reads is a different kind of risk.

````xml
<?xml version="1.0" encoding="UTF-8"?>
<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">
  <net id="coatings_sched_v1"
       type="http://www.pnml.org/version-2009/grammar/ptnet">
    <name><text>Coatings Plant Scheduling Model v1.0</text></name>
    <toolspecific tool="spec" version="1.0">
      <timeUnit>minutes</timeUnit>
      <runLength>60480</runLength>
      <warmup>10080</warmup>
      <replications>30</replications>
      <note>Colour sets, guards and policy layer defined in accompanying
            spec sections 2-5. Parameter values in parameter file section 8.
            UNVALIDATED assumptions listed on page one.</note>
    </toolspecific>
    <page id="top">

      <!-- ============ CALENDAR SUBNET ============ -->
      <place id="P_Clock">
        <name><text>Calendar cycle</text></name>
        <initialMarking><text>1</text></initialMarking>
        <graphics><position x="40" y="40"/></graphics>
      </place>
      <place id="P_TechShiftOpen">
        <name><text>Tech shift open 06:00-14:00</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="200" y="40"/></graphics>
      </place>
      <place id="P_LineOpen_L1">
        <name><text>Line 1 open 06:00-22:00</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="360" y="40"/></graphics>
      </place>
      <place id="P_LineOpen_L2">
        <name><text>Line 2 open 06:00-22:00</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="520" y="40"/></graphics>
      </place>
      <place id="P_LineOpen_L3">
        <name><text>Line 3 open 06:00-14:00 (OT lever)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="680" y="40"/></graphics>
      </place>
      <place id="P_LabOpen">
        <name><text>Lab open (A10 UNVALIDATED)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="840" y="40"/></graphics>
      </place>

      <transition id="T_ShiftStart">
        <name><text>06:00 daily open</text></name>
        <toolspecific tool="spec" version="1.0">
          <schedule>daily 06:00, weekdays</schedule>
          <effect>mark P_TechShiftOpen, P_LineOpen_L1/2/3, P_LabOpen;
                  move 2 tokens P_TechsOff -> P_Techs</effect>
        </toolspecific>
        <graphics><position x="120" y="120"/></graphics>
      </transition>
      <transition id="T_TechShiftEnd">
        <name><text>14:00 tech shift end</text></name>
        <toolspecific tool="spec" version="1.0">
          <schedule>daily 14:00</schedule>
          <effect>unmark P_TechShiftOpen; free techs -> P_TechsOff</effect>
        </toolspecific>
        <graphics><position x="280" y="120"/></graphics>
      </transition>
      <transition id="T_Line3Close">
        <name><text>14:00 Line 3 close</text></name>
        <toolspecific tool="spec" version="1.0">
          <schedule>daily 14:00 unless OT lever set</schedule>
        </toolspecific>
        <graphics><position x="440" y="120"/></graphics>
      </transition>
      <transition id="T_Line12Close">
        <name><text>22:00 Lines 1-2 close</text></name>
        <toolspecific tool="spec" version="1.0">
          <schedule>daily 22:00</schedule>
        </toolspecific>
        <graphics><position x="600" y="120"/></graphics>
      </transition>

      <arc id="a01" source="P_Clock" target="T_ShiftStart"/>
      <arc id="a02" source="T_ShiftStart" target="P_TechShiftOpen"/>
      <arc id="a03" source="T_ShiftStart" target="P_LineOpen_L1"/>
      <arc id="a04" source="T_ShiftStart" target="P_LineOpen_L2"/>
      <arc id="a05" source="T_ShiftStart" target="P_LineOpen_L3"/>
      <arc id="a06" source="T_ShiftStart" target="P_LabOpen"/>
      <arc id="a07" source="P_TechShiftOpen" target="T_TechShiftEnd"/>
      <arc id="a08" source="P_LineOpen_L3" target="T_Line3Close"/>
      <arc id="a09" source="P_LineOpen_L1" target="T_Line12Close"/>
      <arc id="a10" source="P_LineOpen_L2" target="T_Line12Close"/>
      <arc id="a11" source="T_Line12Close" target="P_Clock"/>

      <!-- ============ SHARED RESOURCES ============ -->
      <place id="P_Techs">
        <name><text>Techs on shift and free</text></name>
        <initialMarking><text>2</text></initialMarking>
        <toolspecific tool="spec" version="1.0">
          <lever>count = 2 (baseline) | 3 (third-tech arm)</lever>
        </toolspecific>
        <graphics><position x="200" y="220"/></graphics>
      </place>
      <place id="P_TechsOff">
        <name><text>Techs off shift</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="200" y="300"/></graphics>
      </place>
      <place id="P_Lab">
        <name><text>Lab capacity</text></name>
        <initialMarking><text>2</text></initialMarking>
        <graphics><position x="840" y="220"/></graphics>
      </place>
      <place id="P_Demand">
        <name><text>Order arrivals (ERP stream)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <toolspecific tool="spec" version="1.0">
          <colour>ORDER = id,sku,qty,tier,dueTime</colour>
          <source>ERP export, 4-6 weeks. A17 until loaded.</source>
        </toolspecific>
        <graphics><position x="40" y="380"/></graphics>
      </place>
      <place id="P_Ready">
        <name><text>Released, awaiting assignment</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="180" y="380"/></graphics>
      </place>

      <transition id="T_Release">
        <name><text>Release order</text></name>
        <graphics><position x="110" y="380"/></graphics>
      </transition>
      <arc id="a12" source="P_Demand" target="T_Release"/>
      <arc id="a13" source="T_Release" target="P_Ready"/>

      <!-- ============ LINE 1 SUBNET ============ -->
      <!-- duplicate this block for L2, L3; substitute ids and parameters -->

      <place id="P_UpIdle_L1">
        <name><text>L1 upstream idle (mix/mill/tint)</text></name>
        <initialMarking><text>1</text></initialMarking>
        <graphics><position x="300" y="460"/></graphics>
      </place>
      <place id="P_UpBusy_L1">
        <name><text>L1 upstream in progress</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="380" y="460"/></graphics>
      </place>
      <place id="P_Tank_L1">
        <name><text>L1 holding tank (DISPUTED CAPACITY - A15)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <toolspecific tool="spec" version="1.0">
          <capacity>K1 = PLACEHOLDER</capacity>
          <note>Flag 2. Do not run the inversion before Line 1 fill rate
                is measured with a non-empty tank.</note>
        </toolspecific>
        <graphics><position x="460" y="460"/></graphics>
      </place>
      <place id="P_TankFree_L1">
        <name><text>L1 tank free slots</text></name>
        <initialMarking><text>K1</text></initialMarking>
        <graphics><position x="460" y="540"/></graphics>
      </place>
      <place id="P_LineIdle_L1">
        <name><text>L1 idle, carrying lastSKU/lastFamily/lastShade</text></name>
        <initialMarking><text>1</text></initialMarking>
        <toolspecific tool="spec" version="1.0">
          <colour>LINESTATE = lineId,lastSKU,lastFamily,lastShade,up</colour>
        </toolspecific>
        <graphics><position x="560" y="460"/></graphics>
      </place>
      <place id="P_LineFilling_L1">
        <name><text>L1 filling</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="660" y="460"/></graphics>
      </place>
      <place id="P_ChangeoverDue_L1">
        <name><text>L1 changeover raised, not started</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="560" y="620"/></graphics>
      </place>
      <place id="P_Rinsing_L1">
        <name><text>L1 rinsing (operator, no tech)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="480" y="700"/></graphics>
      </place>
      <place id="P_Washing_L1">
        <name><text>L1 washing (tech, QA signoff)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="640" y="700"/></graphics>
      </place>
      <place id="P_Down_L1">
        <name><text>L1 down</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="760" y="540"/></graphics>
      </place>

      <transition id="T_Assign_L1">
        <name><text>Assign order to L1</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>POLICY LAYER - spec section 5.
                 Baseline: Meridian white -> L2 only; specialty -> L1;
                 else prefer matching lastFamily; sort TIER then dueTime.</guard>
        </toolspecific>
        <graphics><position x="240" y="380"/></graphics>
      </transition>
      <transition id="T_UpStart_L1">
        <name><text>L1 start upstream</text></name>
        <graphics><position x="340" y="460"/></graphics>
      </transition>
      <transition id="T_UpEnd_L1">
        <name><text>L1 end upstream</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>upstream_time[family]; specialty slowest (thick, slow mill)</delay>
        </toolspecific>
        <graphics><position x="420" y="460"/></graphics>
      </transition>
      <transition id="T_StartFill_L1">
        <name><text>L1 start fill</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>P_LineOpen_L1 marked AND NOT P_Down_L1 AND batch in tank
                 AND no changeover outstanding AND sku qualified on L1
                 (specialty: L1 only - C11)</guard>
        </toolspecific>
        <graphics><position x="610" y="460"/></graphics>
      </transition>
      <transition id="T_EndFill_L1">
        <name><text>L1 end fill</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>qty / rate[sku][L1]  (A14 placeholder)</delay>
          <effect>emit LOT to P_QAQueue, less ramp_scrap if run followed
                  a family switch (A5, swept)</effect>
        </toolspecific>
        <graphics><position x="720" y="460"/></graphics>
      </transition>
      <transition id="T_RaiseChangeover_L1">
        <name><text>L1 raise changeover</text
```xml
      <transition id="T_RaiseChangeover_L1">
        <name><text>L1 raise changeover</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>next job prep != line current prep</guard>
          <delay>DEFERRED by wait-rule W(t) - spec 5.2.
                 Morning only; after 13:15 the choice does not exist.</delay>
        </toolspecific>
        <graphics><position x="560" y="540"/></graphics>
      </transition>
      <transition id="T_StartRinse_L1">
        <name><text>L1 start rinse (operator)</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>class(from,to) = OPERATOR AND P_LineOpen_L1 marked</guard>
          <note>C5 - no tech token consumed. Available to 22:00.</note>
        </toolspecific>
        <graphics><position x="480" y="620"/></graphics>
      </transition>
      <transition id="T_EndRinse_L1">
        <name><text>L1 end rinse</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>25</delay>
        </toolspecific>
        <graphics><position x="400" y="700"/></graphics>
      </transition>
      <transition id="T_StartWash_L1">
        <name><text>L1 start wash (tech)</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>class(from,to) = TECH
                 AND P_TechShiftOpen marked
                 AND P_Techs >= n(from,to)
                 AND now + dur(from,to) &lt;= 14:00 + grace(15)   [C8]
                 AND NOT (to_sku = VW-02 AND from_shade &gt;= 4)   [C12]</guard>
          <consumes>n(from,to) tokens from P_Techs</consumes>
        </toolspecific>
        <graphics><position x="640" y="620"/></graphics>
      </transition>
      <transition id="T_EndWash_L1">
        <name><text>L1 end wash</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>dur(from,to) per changeover matrix, spec 4.3</delay>
          <effect>release n techs to P_Techs; set lastFamily/lastShade := to</effect>
        </toolspecific>
        <graphics><position x="720" y="700"/></graphics>
      </transition>
      <transition id="T_Fail_L1">
        <name><text>L1 fail</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>Exp(MTBF_L1) - A6 PLACEHOLDER</delay>
          <note>A7: mill motor 4-day outage is a SCENARIO INJECTION,
                not sampled. Too rare for a 6-week run.</note>
        </toolspecific>
        <graphics><position x="800" y="460"/></graphics>
      </transition>
      <transition id="T_Repair_L1">
        <name><text>L1 repair</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>Tri(min,mode,max) - A6</delay>
          <effect>fill resumes from interruption point</effect>
        </toolspecific>
        <graphics><position x="800" y="620"/></graphics>
      </transition>
      <transition id="T_Interrupt_L1">
        <name><text>L1 shift-end interrupt</text></name>
        <toolspecific tool="spec" version="1.0">
          <schedule>fires at line close if fill incomplete</schedule>
          <note>ASSUMPTION: fills are interruptible at shift end and resume
                next open. Never confirmed - flag if wrong.</note>
        </toolspecific>
        <graphics><position x="720" y="380"/></graphics>
      </transition>

      <arc id="b01" source="P_Ready" target="T_Assign_L1"/>
      <arc id="b02" source="T_Assign_L1" target="P_UpIdle_L1"/>
      <arc id="b03" source="P_UpIdle_L1" target="T_UpStart_L1"/>
      <arc id="b04" source="P_TankFree_L1" target="T_UpStart_L1"/>
      <arc id="b05" source="T_UpStart_L1" target="P_UpBusy_L1"/>
      <arc id="b06" source="P_UpBusy_L1" target="T_UpEnd_L1"/>
      <arc id="b07" source="T_UpEnd_L1" target="P_Tank_L1"/>
      <arc id="b08" source="T_UpEnd_L1" target="P_UpIdle_L1"/>
      <arc id="b09" source="P_Tank_L1" target="T_StartFill_L1"/>
      <arc id="b10" source="P_LineIdle_L1" target="T_StartFill_L1"/>
      <arc id="b11" source="P_LineOpen_L1" target="T_StartFill_L1">
        <inscription><text>test arc - not consumed</text></inscription>
      </arc>
      <arc id="b12" source="T_StartFill_L1" target="P_LineFilling_L1"/>
      <arc id="b13" source="T_StartFill_L1" target="P_TankFree_L1"/>
      <arc id="b14" source="P_LineFilling_L1" target="T_EndFill_L1"/>
      <arc id="b15" source="T_EndFill_L1" target="P_LineIdle_L1"/>
      <arc id="b16" source="T_EndFill_L1" target="P_QAQueue"/>
      <arc id="b17" source="P_LineIdle_L1" target="T_RaiseChangeover_L1"/>
      <arc id="b18" source="T_RaiseChangeover_L1" target="P_ChangeoverDue_L1"/>
      <arc id="b19" source="P_ChangeoverDue_L1" target="T_StartRinse_L1"/>
      <arc id="b20" source="T_StartRinse_L1" target="P_Rinsing_L1"/>
      <arc id="b21" source="P_Rinsing_L1" target="T_EndRinse_L1"/>
      <arc id="b22" source="T_EndRinse_L1" target="P_LineIdle_L1"/>
      <arc id="b23" source="P_ChangeoverDue_L1" target="T_StartWash_L1"/>
      <arc id="b24" source="P_Techs" target="T_StartWash_L1">
        <inscription><text>n(from,to)  [1 or 2]</text></inscription>
      </arc>
      <arc id="b25" source="P_TechShiftOpen" target="T_StartWash_L1">
        <inscription><text>test arc - not consumed</text></inscription>
      </arc>
      <arc id="b26" source="T_StartWash_L1" target="P_Washing_L1"/>
      <arc id="b27" source="P_Washing_L1" target="T_EndWash_L1"/>
      <arc id="b28" source="T_EndWash_L1" target="P_LineIdle_L1"/>
      <arc id="b29" source="T_EndWash_L1" target="P_Techs">
        <inscription><text>n(from,to)</text></inscription>
      </arc>
      <arc id="b30" source="P_LineFilling_L1" target="T_Fail_L1"/>
      <arc id="b31" source="T_Fail_L1" target="P_Down_L1"/>
      <arc id="b32" source="P_Down_L1" target="T_Repair_L1"/>
      <arc id="b33" source="T_Repair_L1" target="P_LineFilling_L1"/>
      <arc id="b34" source="P_LineFilling_L1" target="T_Interrupt_L1"/>
      <arc id="b35" source="T_Interrupt_L1" target="P_LineFilling_L1">
        <inscription><text>paused; resumes at next line open</text></inscription>
      </arc>

      <!-- ============ QA AND SHIPPING ============ -->
      <place id="P_QAQueue">
        <name><text>Awaiting QA (post-fill hold)</text></name>
        <initialMarking><text>0</text></initialMarking>
        <toolspecific tool="spec" version="1.0">
          <note>C9 - delays shipment only, does not block upstream.
                Watch Fri/Mon queue length: your Friday slip mechanism.</note>
        </toolspecific>
        <graphics><position x="900" y="380"/></graphics>
      </place>
      <place id="P_InQA">
        <name><text>In QA</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="900" y="460"/></graphics>
      </place>
      <place id="P_Shipped">
        <name><text>Shipped</text></name>
        <initialMarking><text>0</text></initialMarking>
        <graphics><position x="900" y="620"/></graphics>
      </place>

      <transition id="T_QAStart">
        <name><text>Start QA</text></name>
        <toolspecific tool="spec" version="1.0">
          <guard>P_Lab >= 1 AND P_LabOpen marked</guard>
          <policy>BASELINE FIFO (A10). Variant: Meridian-priority queue.</policy>
        </toolspecific>
        <graphics><position x="900" y="420"/></graphics>
      </transition>
      <transition id="T_QAEnd">
        <name><text>End QA</text></name>
        <toolspecific tool="spec" version="1.0">
          <delay>240 min; 1440 min if family = SPECIALTY</delay>
        </toolspecific>
        <graphics><position x="900" y="500"/></graphics>
      </transition>
      <transition id="T_Ship">
        <name><text>Ship and record lateness</text></name>
        <toolspecific tool="spec" version="1.0">
          <effect>lateness = max(0, now - dueTime); bucket by TIER;
                  MERIDIAN tolerance 0, DISTRIBUTOR 2880, SMALL 10080 min</effect>
        </toolspecific>
        <graphics><position x="900" y="570"/></graphics>
      </transition>

      <arc id="c01" source="P_QAQueue" target="T_QAStart"/>
      <arc id="c02" source="P_Lab" target="T_QAStart"/>
      <arc id="c03" source="T_QAStart" target="P_InQA"/>
      <arc id="c04" source="P_InQA" target="T_QAEnd"/>
      <arc id="c05" source="T_QAEnd" target="P_Lab"/>
      <arc id="c06" source="T_QAEnd" target="P_Shipped"/>
      <arc id="c07" source="P_Shipped" target="T_Ship"/>

    </page>
  </net>
</pnml>
````

---

# 10. Building Lines 2 and 3

Copy the Line 1 block; change the `_L1` suffix throughout; substitute from `lines.csv`. The only structural differences:

|                  | Line 2                                   | Line 3                                                |
| ---------------- | ---------------------------------------- | ----------------------------------------------------- |
| Calendar place   | `P_LineOpen_L2`, 06:00–22:00             | `P_LineOpen_L3`, 06:00–**14:00**                      |
| Qualification    | Specialty SKUs excluded (C11)            | Specialty excluded; two deep-red tints excluded (A16) |
| Assignment guard | **Meridian whites forced here** (C10)    | No forced work                                        |
| Failure          | MTBF ≈ 240 h, repair Tri(30,90,240) (A6) | Zero (A8)                                             |
| OT lever         | none                                     | `T_Line3Close` deferred to 22:00 when set             |

**One consequence worth checking against the model's own output:** Line 3's entire operating day sits inside the tech window. Its changeovers compete head-on with the morning wash queue for Lines 1 and 2. A tint→white wash starting 06:00 on Line 2 holds both techs to 09:00, during which Line 3 cannot cross families — three of its eight hours, clean and staffed and waiting. If that pattern doesn't emerge spontaneously in the reproduction check, the tech contention is modelled wrong.

---

# 11. What happens next

**Blocking, from you:** spreadsheet, rate matrix, ERP export. Nothing runs until the rate matrix lands — `A14` placeholders make every duration in the model fictional.

**Then, in order:** reproduction check (§7.1) → Q3 decomposition → Q2 sweep → Q1 reflexes. Rota and headcount arms only after the tick sheet.

**Send early, don't batch:** any tick-sheet row showing an operator performing a family switch. That retires A19, changes a hard guard, and I'd rather rework in week one than build a fortnight on it.

**Still unanswered:** the PNML dialect, A10 (lab hours and queue discipline — I never asked and it drives your Friday slips), A15 (tank capacities), whether fills are interruptible at shift end (§4.2), and A16 (which two tints Line 3 can't run).

---

# 12. Two lines that don't depend on any of this

Both fall out of your own shift pattern — C3, C4, C6, C8 — not from anything I've modelled. They were true before this document existed and stay true whatever the data says:

> **After 13:15, no line can cross families. The morning decides the day.**

> **A wash raised at 22:00 costs nothing. One raised at 14:30 costs the evening.**

Everything else in here — the switches-per-week ceiling, the capacity-versus-timing hypothesis, Line 3's idle mornings, and every number in §8 — is arithmetic on recollection. Hold it back until the sheet earns it.
