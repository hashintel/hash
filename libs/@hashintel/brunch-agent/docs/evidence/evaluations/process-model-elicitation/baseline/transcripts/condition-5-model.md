# Condition 5 — the elicited model, folded from the capture store

The harness's own deliverable: `foldElicitedModel` over the active captures, then
`evaluateCompletion` against the sdcpn definition. Nothing here was written by the
interviewer; every value is a capture the sweep extracted and the store admitted.

- Plugin version: `sdcpn/2026-08-26.2`
- Revision: `34f9da8a0149564c`
- Active captures: 166
- Complete: **no** — 93 unsatisfied, 16 node(s) outside every objective's slice, 0 unmapped capture(s)

## Nodes

### entity-type (6)

#### `entity-type:changeover crew`
- **how many there are, or the population's shape** — conflict — 3 readings
- **state that rides along with each instance** — "free, or tied up / about to be pulled onto Line 1 or Line 3 for something else — if tied up, the wash-down option isn't available and the job queues behind whoever else needs them" — spelled out, explicit, practiced — _The crew is either free or tied up on another line; that state gates whether a changeover can start._
- **the distinctions the process treats apart** — conflict — 2 readings

#### `entity-type:line`
- **how many there are, or the population's shape** — "Three lines — Line 1, Line 2, Line 3" — number, explicit — _Expert named three lines as the scheduling scope._

#### `entity-type:lines`
- **how many there are, or the population's shape** — "three lines — Line 1, Line 2, Line 3" — number, explicit — _Three lines, named Line 1, Line 2, Line 3._

#### `entity-type:order`
- **how many there are, or the population's shape** — conflict — 2 readings
- **state that rides along with each instance** — conflict — 6 readings
- **the distinctions the process treats apart** — conflict — 6 readings

#### `entity-type:the changeover crew`
- **how many there are, or the population's shape** — conflict — 2 readings
- **the distinctions the process treats apart** — conflict — 2 readings

#### `entity-type:the three lines`
- **how many there are, or the population's shape** — conflict — 3 readings
- **the distinctions the process treats apart** — conflict — 3 readings

### boundary-condition (3)

#### `boundary-condition:demand book release`
- **the arrival or availability pattern** — "Orders arrive by release into the demand book from ERP on a weekly book cycle, re-planned by the morning huddle; releases occur within the day (e.g. an order \"was going to be released from the demand book that afternoon\"). No rate or shape given" — named, explicit, practiced — _Expert described the cycle and replan rhythm but gave no rate or shape._

#### `boundary-condition:release from the demand book`
- **the arrival or availability pattern** — "Releases follow the demand book's weekly cycle, re-planned every morning at the huddle; past a week the book is soft and gets revised. Rate and shape of arrivals not yet given." — spelled out, explicit — _The expert gives the release cycle (weekly demand book, re-planned each morning at the huddle) but no rate or shape of arrivals._
- **the starting state** — "An order lands in the demand book from ERP — that is \"released\" — with an SKU, quantity and due date." — spelled out, explicit — _Orders enter the expert's world on release into the demand book from ERP, carrying SKU, quantity and due date._

#### `boundary-condition:the demand book`
- **the arrival or availability pattern** — conflict — 3 readings
- **the starting state** — conflict — 2 readings

### activity (16)

#### `activity:a breakdown on a line`
- **how often it occurs, if it is an event rather than a step** — absence: deferred → next round with the expert (breakdowns) — one recalled instance: a breakdown chewed up two days on Line 1 in the odd weeks the model must reproduce (explicit)

#### `activity:breakdown on a line`
- **how long it takes** — conflict — 2 readings
- **how often it occurs, if it is an event rather than a step** — conflict — 2 readings

#### `activity:changeover (washdown)`
- **what is lost when it changes the system's mode** — "A wash that \"we can't get back\", counted by the expert as changeover hours; no quantity given yet" — named, tentative, practiced — _Expert named the loss qualitatively (a wash, changeover hours) but gave no figure in this range._
- **what it needs before it can start** — "The changeover crew must be free — \"If they're tied up elsewhere, my 'wash down now' option isn't even really available\" — and the line must have finished its current run" — spelled out, explicit, practiced — _Crew availability is the stated precondition._
- **what it produces or changes** — "Converts the line from the previous colour to the next — \"a full white-to-tint changeover is a wash we can't get back\"; a white-to-white succession needs \"no changeover\"" — spelled out, explicit — _The changeover converts the line's colour state; same-colour succession needs none._
- **who or what performs it** — "entity-type:changeover crew — one crew of two techs" — named, explicit — _Directly named performer._

#### `activity:changeover wash down`
- **what is lost when it changes the system's mode** — "a full white-to-tint changeover is \"a wash we can't get back\"; the amount of time or capacity lost was not quantified" — named, explicit — _The expert names the loss qualitatively — a full white-to-tint changeover is a wash that cannot be recovered — without giving hours._
- **what it needs before it can start** — "The changeover crew must be free; if they are tied up on another line the wash-down option isn't available and the job queues behind whoever else needs them." — spelled out, explicit, practiced — _Availability of the shared changeover crew gates the start of a wash down._
- **who or what performs it** — "the changeover crew — one crew, two techs, shared across all three lines" — named, explicit — _The changeover crew performs the wash down._

#### `activity:clears QA hold`
- **what it produces or changes** — "The order clears QA hold and ships; the due date is judged against when it clears, not when it comes off the line — a batch can be done Tuesday and still ship late if the lab's backed up." — spelled out, explicit, practiced — _Clearing QA is the event against which lateness is judged and the point the order leaves the expert's scope._

#### `activity:full white-to-tint changeover`
- **what it needs before it can start** — "The next job is a different colour class than the one just run — a white-to-tint switch requires the changeover; a white order following white needs no changeover." — spelled out, explicit, practiced — _The changeover is triggered by a colour change from white to tint; same-colour succession needs none._
- **what it produces or changes** — "The line is washed down and set for tint; it is \"a wash we can't get back\" — the changeover hours are consumed capacity." — spelled out, explicit, practiced — _Expert's own characterisation of the outcome of the changeover._
- **whether its quantities vary by type** — "Yes by colour pair: white-to-tint is a full washdown, white-to-white needs no changeover at all." — named, explicit — _The expert distinguishes white-to-tint (full wash) from white-to-white (none); other direction/colour pairs not yet stated._

#### `activity:QA hold`
- **how long it takes** — conflict — 3 readings
- **what it needs before it can start** — conflict — 3 readings
- **what it produces or changes** — conflict — 3 readings
- **whether its quantities vary by type** — conflict — 3 readings
- **who or what performs it** — conflict — 3 readings

#### `activity:run on the line`
- **how long it takes** — absence: deferred → the sheet the scheduler will bring next round, which answers the run-rate question (explicit)

#### `activity:specialty changeover`
- **how long it takes** — conflict — 3 readings
- **whether its quantities vary by type** — conflict — 2 readings

#### `activity:the hold-or-change-over call`
- **how often it occurs, if it is an event rather than a step** — "three or four times a month" — range, explicit, practiced — _Frequency of the decision point the model is meant to test._
- **who or what performs it** — "The master scheduler, by gut judgment" — named, explicit — _The expert makes the call themselves, by gut._

#### `activity:the run`
- **how long it takes** — "For that big-volume Meridian white order: on the line most of the day — started Wednesday morning and wrapped Wednesday evening; exact hours would have to be checked on the sheet." — number, explicit — _Only a single recalled case at roughly a day; the expert explicitly says exact hours would need the sheet, so no range or spread was reached._
- **what it needs before it can start** — "The order must be in the Line 2 column on the sheet and must wait its turn behind whatever is already running on that line; if the job ahead is the same family, no changeover is needed — a straight run-into-run." — spelled out, explicit — _Precondition stated in the walkthrough: the line free of the previous job, and either same family (no changeover) or a completed changeover._
- **what it produces or changes** — "Mix, mill, tint stage (skipped for a white), through fill and pack; the finished order is palletized and moved off the line into the queue for the lab." — spelled out, explicit — _The run's output as described._
- **who or what performs it** — "The line itself (Line 2 in the recalled case); no changeover crew involved — \"that's the easy case, no crew involved\". The expert does not watch it minute by minute." — named, explicit — _The expert names the line as what runs the order and says he does not watch the operators minute by minute; no crew is involved in a run-into-run._

#### `activity:the run (mix, mill, fill and pack)`
- **how long it takes** — conflict — 2 readings
- **what it needs before it can start** — conflict — 2 readings
- **what it produces or changes** — conflict — 2 readings
- **who or what performs it** — "The production line (this order ran on Line 2); no crew involvement for a run-into-run" — named, explicit — _Performed by the line itself; the scheduler does not track the operators._

#### `activity:tint-to-white changeover`
- **how long it takes** — "Quickest maybe two and a half hours (everything clean, crew fresh); on a bad day — dried pigment in a fitting — it has crept toward four hours; three hours typical, the number actually used on the sheet." — range, explicit, practiced — _Low two and a half hours, high toward four hours, typical three hours — a range with a typical._
- **what is lost when it changes the system's mode** — "A full washdown — two and a half to four hours of line time, three typical — because any pigment left behind wrecks a white batch; direction matters, it is not symmetric with white-to-tint." — range, explicit, practiced — _Loss is the full washdown time on the line plus the crew, driven by the direction of the change._
- **whether its quantities vary by type** — "Yes — changeover duration varies by direction and family: white-to-tint is the cheap direction, tint-to-white the expensive one, specialty its own animal." — named, explicit — _Explicit answer that changeover duration varies by direction and family._

#### `activity:tint-to-white washdown`
- **how long it takes** — conflict — 2 readings
- **what is lost when it changes the system's mode** — "A full washdown, because any pigment left behind wrecks a white batch — direction absolutely matters, it's not symmetric: tint-to-white is the expensive one (three hours typical) versus white-to-tint (45 minutes to an hour). \"A full white-to-tint changeover is a wash we can't get back.\"" — spelled out, explicit, practiced — _Directional asymmetry and its reason; loss is the full washdown time, not recoverable._
- **what it produces or changes** — "A full washdown of the line so no pigment is left behind; any pigment left behind wrecks a white batch." — spelled out, explicit — _Purpose and consequence of omission._
- **who or what performs it** — "entity-type:the changeover crew (two techs)" — named, explicit — _Same shared crew._

#### `activity:white-to-tint changeover`
- **how long it takes** — conflict — 2 readings
- **what it needs before it can start** — "The changeover crew must be free; if they are tied up on another line the wash-down option is not available and the line queues behind whoever else needs them." — spelled out, explicit — _Crew availability gates the changeover._
- **whether its quantities vary by type** — "Yes — direction absolutely matters and is not symmetric: white-to-tint is the cheap direction, tint-to-white the expensive one, and specialty is its own animal again." — named, explicit — _Explicit answer that duration varies by direction and family._
- **who or what performs it** — conflict — 2 readings

#### `activity:white-to-tint changeover on Line 2`
- **how long it takes** — "Quickest maybe 40 minutes (crew right there, nothing fighting them); longest about an hour twenty on a bad day (crew stretched thin or something stuck); typically lands around 45 minutes to an hour. The \"cheap\" direction." — range, explicit, practiced — _Low, high and a typical band given — a range with a typical, not a full spread; not rounded up._
- **what is lost when it changes the system's mode** — "Line time consumed by the changeover: 40 minutes to an hour twenty, typically 45 minutes to an hour, plus occupancy of the two-tech crew for that period." — range, explicit, practiced — _The loss on this mode change is the line time consumed by the wash; the expert gave it as the changeover duration._
- **what it needs before it can start** — "The previous run on the line finished and the changeover crew free; if the crew is tied up on another line, the changeover cannot start and the line queues behind whoever else needs them." — spelled out, explicit — _Precondition: previous run finished and the shared crew available._
- **who or what performs it** — "The changeover crew — one crew, two techs, shared across all three lines." — named, explicit — _All changeovers are performed by the shared two-tech crew._

### ordering/flow (1)

#### `ordering/flow:release to cleared QA`
- **how a branch or merge is decided** — conflict — 3 readings
- **the order things happen in** — conflict — 5 readings

### policy (6)

#### `policy:Meridian-to-Line-2`
- **the rule as actually practiced** — absence: deferred → the expert will check whether Meridian-to-Line-2 is written in stone or just habit before next round (explicit)

#### `policy:sit the line for an expected same-colour order`
- **the rule as actually practiced** — "When a same-colour order is expected to be released later the same day, hold the line idle rather than change over — because a full white-to-tint changeover is a wash that can't be got back, versus an hour of idle time. Judged by gut, three or four times a month." — spelled out, explicit, practiced — _The practiced rule behind the decision, given as gut judgment on a real occasion; not yet elicited as a general rule with conditions._

#### `policy:the wash-versus-idle call`
- **the rule as actually practiced** — "Weigh changeover hours against idle hours by gut in the moment; a changeover is treated as a wash you can't get back, so the line is sat idle when a same-family order is expected soon." — spelled out, explicit, practiced — _The practiced heuristic behind the decision the model must test._

#### `policy:we just don't do that (Meridian never slips)`
- **the rule as actually practiced** — "A Meridian order is never allowed to slip its due date — it is a \"we just don't do that\" rule rather than a traded-off cost, because a Meridian miss means a fine plus ammunition for them to delist a line item at next contract review, and commercial and the boss get calls. Non-Meridian distributor orders that slip 2-3 days are handled with a phone call." — spelled out, explicit, practiced — _An unwritten rule stated by the expert as absolute, with its organisational consequence._
- **what overrides it** — absence: explicitly-absent → no number of small late orders flips it in any range seen in a week (explicit)

#### `policy:who gets the changeover crew`
- **the rule as actually practiced** — conflict — 2 readings
- **what overrides it** — "Maintenance can pull the crew mid-job for a genuine emergency — a line leaking, something needing isolating right now. Rare, and not the scheduler's call; a real fight escalates over his head to the ops director." — spelled out, explicit, practiced — _Named override with escalation path._

#### `policy:who gets the crew`
- **the rule as actually practiced** — conflict — 2 readings
- **what overrides it** — conflict — 2 readings

### objective (7)

#### `objective:Meridian-versus-small-orders exchange rate`
- **what "better" means, and trade-off weights** — absence: deferred → commercial — would have to be got in a room and forced to say it out loud (explicit)

#### `objective:the wash-versus-idle call`
- **the nodes it depends on** — ["entity-type:order","entity-type:the three lines","entity-type:the changeover crew","boundary-condition:the demand book","activity:white-to-tint changeover on Line 2","activity:tint-to-white changeover","activity:specialty changeover","activity:the run","activity:QA hold","ordering/flow:release to cleared QA","policy:who gets the crew","constraint:no Meridian misses"] — named, explicit — _The expert named the scope of the decision: orders, three lines, the shared crew, the changeovers, the run and the QA hold up to cleared-QA._
- **the question, in the expert's words** — "Whether to wash down Line 2 for the tint order right then, or let Line 2 sit idle for about an hour waiting for a smaller white order that needs no changeover — a judgment made by gut maybe three or four times a month, never verified." — spelled out, explicit, practiced — _The expert's own framing of the decision the model must inform, given as a real recent case._
- **what "better" means, and trade-off weights** — "Better = no Meridian late orders first (not tradeable — three small late orders beat one Meridian miss, and even twenty small late orders would not flip it), then late-order count, with changeover hours and idle time as the expert's own diagnostics rather than the graded measure." — spelled out, explicit, practiced — _A lexicographic ranking, not a weight: Meridian misses are refused at any exchange rate the expert would see in a week._

#### `objective:wash down for the tint now, or sit the line for the white order coming later`
- **the nodes it depends on** — ["activity:full white-to-tint changeover","entity-type:order","policy:we just don't do that (Meridian never slips)"] — named, inferred — _The expert names changeover hours, idle hours and late orders as the things the model must put on the same page._
- **the question, in the expert's words** — "Whether to wash down for the tint right then, or let the line sit idle for about an hour waiting for another same-colour (white) order that will be released from the demand book later that day — i.e. whether sitting the line was actually the cheaper choice or just the safer-feeling one." — spelled out, explicit, practiced — _The expert's own recent decision, stated as the first question to put to the model._
- **what "better" means, and trade-off weights** — "Graded on the late-order count, with Meridian orders weighted extra heavy in practice though nobody has written that down; three non-Meridian orders a day late each is the better week than one Meridian order a day late, and the trade does not flip even at twenty small orders versus one Meridian — so no exchange rate exists; a real number would require getting commercial in a room and forcing them to say it out loud." — spelled out, explicit, practiced — _Better = fewer late orders with Meridian dominating; the expert explicitly refuses an exchange rate and names where a number would have to come from._

#### `objective:wash down for the tint right then, or let Line 2 sit idle`
- **the nodes it depends on** — ["entity-type:order","entity-type:the three lines","entity-type:the changeover crew","boundary-condition:the demand book","activity:the run (mix, mill, fill and pack)","activity:QA hold","activity:white-to-tint changeover","activity:tint-to-white washdown","activity:specialty changeover","ordering/flow:release to cleared QA","policy:who gets the changeover crew","constraint:we just don't do that (Meridian)"] — named, inferred — _The scheduler named the scope of the decision: orders, three lines, the shared crew, the changeovers, the run, QA and the demand book._
- **the question, in the expert's words** — "Whether to wash down for a tint order right away, or hold the line idle (about an hour) for an expected same-family white order that has not yet been released — a call made by gut three or four times a month, never verified." — spelled out, explicit, practiced — _The decision the model exists to test, stated as a real recurring call._
- **what "better" means, and trade-off weights** — "Judged on late-order count, with Meridian orders weighted extra heavy in practice though written nowhere; changeover hours and idle time are the scheduler's own concern, currently tracked separately. No numeric exchange rate for a Meridian miss exists — it would take commercial in a room to say it out loud." — spelled out, explicit, practiced — _Ranking given, with an explicit refusal to supply an exchange rate for Meridian._

#### `objective:wash down now or sit Line 2 idle`
- **the nodes it depends on** — ["entity-type:lines","entity-type:changeover crew","entity-type:order","boundary-condition:release from the demand book","activity:changeover wash down","activity:clears QA hold","ordering/flow:release to cleared QA","constraint:no Meridian misses"] — named, explicit — _The expert names the scheduling unit (three lines plus the one crew) and the span of an order (release to cleared QA) as what the decision turns on._
- **the question, in the expert's words** — "Whether to wash down for the tint right then, or let Line 2 sit idle for about an hour waiting for another white order (smaller, still white, no changeover needed) to be released from the demand book that afternoon — a call made by gut three or four times a month, never provably right." — spelled out, explicit, practiced — _The expert's own statement of the decision the model must inform, given as a recent real case._
- **what "better" means, and trade-off weights** — "Graded on late-order count, with Meridian orders weighted extra heavy in practice though nobody has written that down; a Meridian miss is a \"we just don't do that\" rule, not a traded-off cost; changeover hours and idle hours are the expert's own concern because wasted capacity turns into missed due dates later in the week." — spelled out, explicit, practiced — _Better is judged on late orders, with Meridian misses as an unwritten hard rule rather than a weight; changeover and idle hours are the expert's own diagnostics._

#### `objective:wash down now or sit the line idle`
- **the nodes it depends on** — ["entity-type:order","entity-type:changeover crew","entity-type:line","activity:changeover (washdown)","activity:QA hold","ordering/flow:release to cleared QA","boundary-condition:demand book release","constraint:no Meridian miss"] — named, inferred — _The expert named the scheduling unit (three lines plus the one crew) and the span release-to-cleared-QA as what the decision turns on._
- **the question, in the expert's words** — "Whether to \"wash down for the tint right then, or let Line 2 sit idle for about an hour\" waiting for another white order that needs no changeover — a call made \"by gut maybe three or four times a month\"" — spelled out, explicit, practiced — _The expert's own recent decision, stated as the first question for the model._
- **what "better" means, and trade-off weights** — "Graded on \"the late-order count, maybe with Meridian orders weighted extra heavy in practice even though nobody's written that down anywhere\"; a Meridian miss never trades against small late orders — \"I don't think it does flip, not in any range I'd actually see in a week\"; \"changeover hours and the idle time are more my own concern\" as diagnostics. No numeric exchange rate: \"you'd have to get commercial in a room and force them to say it out loud\"" — spelled out, explicit, practiced — _Expert gave a qualitative ranking and explicitly refused a numeric exchange rate._

#### `objective:wash-versus-idle call on Line 2`
- **the nodes it depends on** — ["entity-type:order","entity-type:changeover crew","entity-type:the three lines","boundary-condition:the demand book","activity:the run (mix, mill, fill and pack)","activity:white-to-tint changeover","activity:tint-to-white washdown","activity:specialty changeover","activity:QA hold","ordering/flow:release to cleared QA","policy:who gets the crew","constraint:we just don't do that (Meridian)"] — named, inferred — _Nodes the expert named as inside the scheduling unit and the lateness clock._
- **the question, in the expert's words** — "Whether to wash down for the tint right then, or let Line 2 sit idle for about an hour waiting for a same-colour (white) order expected to be released that afternoon — a judgment made by gut maybe three or four times a month, never proven right or wrong." — spelled out, explicit, practiced — _The anchoring decision the model must inform, given as a real recent case._
- **what "better" means, and trade-off weights** — "No Meridian misses first (a hard rule, not a weight — does not flip even at twenty small orders late versus one Meridian), then late-order count, with changeover hours and idle time as the scheduler's own diagnostics. A real exchange rate between Meridian and small late orders would have to come from commercial being put in a room and forced to say it out loud." — spelled out, explicit, practiced — _Ranking rather than a weight; expert explicitly refused an exchange rate and named where one would come from._

### constraint (6)

#### `constraint:no Meridian miss`
- **the limit and what happens when it is hit** — "A Meridian order must not miss its due date — a \"we just don't do that\" rule, written nowhere; if hit: \"it's a fine, and it's ammunition for them to delist a line item next contract review. Commercial gets calls, my boss gets calls.\"" — spelled out, explicit, practiced — _Stated as an unwritten absolute rule with named consequences._

#### `constraint:no Meridian misses`
- **the limit and what happens when it is hit** — conflict — 2 readings

#### `constraint:one crew serving three lines`
- **the limit and what happens when it is hit** — "Only one changeover can be served at a time by the single two-tech crew. When two lines want them at once, the losing line sits clean but idle waiting its turn — close to two hours in the recalled case — and that wasted line time does not show up anywhere as a problem." — spelled out, explicit, practiced — _Capacity limit with its practiced consequence: the losing line idles and the loss is invisible in reporting._

#### `constraint:one-week planning horizon`
- **the limit and what happens when it is hit** — conflict — 2 readings

#### `constraint:planning horizon`
- **the limit and what happens when it is hit** — "One week is the horizon that must hold; two weeks is watched only for \"the big minimum-run stuff, specialty especially\"; beyond a month the plan is refused — \"too much changes\" and the book itself gets revised" — spelled out, explicit, practiced — _Horizon over which the plan must remain useful, with the expert's stated failure beyond it._

#### `constraint:we just don't do that (Meridian)`
- **the limit and what happens when it is hit** — conflict — 2 readings

### data-binding (4)

#### `data-binding:changeover log`
- **the variable and its feed** — "Changeover hours, fed by the plant's changeover log (tracked separately from the late-order report)" — named, explicit — _Named existing record of changeover hours._

#### `data-binding:changeover log and late-order report`
- **the variable and its feed** — conflict — 3 readings

#### `data-binding:changeover log, late-order report and the sheet`
- **the variable and its feed** — "Changeover hours from the changeover log; late orders from the late-order report — currently never put on the same page; run rates and exact run hours from the sheet, to be brought next session." — named, explicit — _Three existing records named as feeds, currently unlinked._

#### `data-binding:late-order report`
- **the variable and its feed** — "Late-order count, fed by the late-order report (tracked separately from the changeover log)" — named, explicit — _Named existing record of late orders, the boss's grading measure._

### validation-criterion (2)

#### `validation-criterion:recognize the shape of a real month`
- **how the expert would know the model is right** — conflict — 3 readings

#### `validation-criterion:the shape of a real month`
- **how the expert would know the model is right** — "Feed it last month's demand book: it must land roughly on the actual late-order count and the same kind of misses (at least two Meridian scrapes and a handful of small ones) — getting the kind wrong is worse than getting the count wrong; changeover hours on Lines 2 and 3 must be recognisable, and Line 3 must not sit idle half the week waiting on the crew; it must reproduce the odd weeks, including a breakdown that ate two days on Line 1. Not a single number — the shape of a real month." — spelled out, explicit — _Replay test stated in the expert's own terms._

## Completion report

- [unsupported-active-objective] objective:Meridian-versus-small-orders exchange rate depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:Meridian-versus-small-orders exchange rate` — the nodes it depends on)
- [unaddressed] "how long it takes" has not been addressed on activity:changeover (washdown). (`activity:changeover (washdown)` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:changeover (washdown). (`activity:changeover (washdown)` — how often it occurs, if it is an event rather than a step)
- [inadmissible-status] "what is lost when it changes the system's mode" on activity:changeover (washdown) is held under status tentative; accepted: explicit. (`activity:changeover (washdown)` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:changeover (washdown). (`activity:changeover (washdown)` — whether its quantities vary by type)
- [unaddressed] "what it produces or changes" has not been addressed on activity:changeover wash down. (`activity:changeover wash down` — what it produces or changes)
- [unaddressed] "how long it takes" has not been addressed on activity:changeover wash down. (`activity:changeover wash down` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:changeover wash down. (`activity:changeover wash down` — how often it occurs, if it is an event rather than a step)
- [below-required-precision] "what is lost when it changes the system's mode" on activity:changeover wash down is known as a named; the model needs range. Smallest delta: move it from named to range. (`activity:changeover wash down` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:changeover wash down. (`activity:changeover wash down` — whether its quantities vary by type)
- [unaddressed] "what it needs before it can start" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — what it needs before it can start)
- [unaddressed] "who or what performs it" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — who or what performs it)
- [unaddressed] "how long it takes" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:clears QA hold. (`activity:clears QA hold` — whether its quantities vary by type)
- [unaddressed] "who or what performs it" has not been addressed on activity:full white-to-tint changeover. (`activity:full white-to-tint changeover` — who or what performs it)
- [unaddressed] "how long it takes" has not been addressed on activity:full white-to-tint changeover. (`activity:full white-to-tint changeover` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:full white-to-tint changeover. (`activity:full white-to-tint changeover` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:full white-to-tint changeover. (`activity:full white-to-tint changeover` — what is lost when it changes the system's mode)
- [open-conflict] "what it needs before it can start" on activity:QA hold has competing active captures; an explicit, user-cited resolution must close it. (`activity:QA hold` — what it needs before it can start)
- [open-conflict] "what it produces or changes" on activity:QA hold has competing active captures; an explicit, user-cited resolution must close it. (`activity:QA hold` — what it produces or changes)
- [open-conflict] "who or what performs it" on activity:QA hold has competing active captures; an explicit, user-cited resolution must close it. (`activity:QA hold` — who or what performs it)
- [open-conflict] "how long it takes" on activity:QA hold has competing active captures; an explicit, user-cited resolution must close it. (`activity:QA hold` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:QA hold. (`activity:QA hold` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:QA hold. (`activity:QA hold` — what is lost when it changes the system's mode)
- [open-conflict] "whether its quantities vary by type" on activity:QA hold has competing active captures; an explicit, user-cited resolution must close it. (`activity:QA hold` — whether its quantities vary by type)
- [unaddressed] "what it needs before it can start" has not been addressed on activity:specialty changeover. (`activity:specialty changeover` — what it needs before it can start)
- [unaddressed] "what it produces or changes" has not been addressed on activity:specialty changeover. (`activity:specialty changeover` — what it produces or changes)
- [unaddressed] "who or what performs it" has not been addressed on activity:specialty changeover. (`activity:specialty changeover` — who or what performs it)
- [open-conflict] "how long it takes" on activity:specialty changeover has competing active captures; an explicit, user-cited resolution must close it. (`activity:specialty changeover` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:specialty changeover. (`activity:specialty changeover` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:specialty changeover. (`activity:specialty changeover` — what is lost when it changes the system's mode)
- [open-conflict] "whether its quantities vary by type" on activity:specialty changeover has competing active captures; an explicit, user-cited resolution must close it. (`activity:specialty changeover` — whether its quantities vary by type)
- [below-required-precision] "how long it takes" on activity:the run is known as a number; the model needs spread. Smallest delta: move it from number to spread. (`activity:the run` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:the run. (`activity:the run` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:the run. (`activity:the run` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:the run. (`activity:the run` — whether its quantities vary by type)
- [open-conflict] "what it needs before it can start" on activity:the run (mix, mill, fill and pack) has competing active captures; an explicit, user-cited resolution must close it. (`activity:the run (mix, mill, fill and pack)` — what it needs before it can start)
- [open-conflict] "what it produces or changes" on activity:the run (mix, mill, fill and pack) has competing active captures; an explicit, user-cited resolution must close it. (`activity:the run (mix, mill, fill and pack)` — what it produces or changes)
- [open-conflict] "how long it takes" on activity:the run (mix, mill, fill and pack) has competing active captures; an explicit, user-cited resolution must close it. (`activity:the run (mix, mill, fill and pack)` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:the run (mix, mill, fill and pack). (`activity:the run (mix, mill, fill and pack)` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:the run (mix, mill, fill and pack). (`activity:the run (mix, mill, fill and pack)` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:the run (mix, mill, fill and pack). (`activity:the run (mix, mill, fill and pack)` — whether its quantities vary by type)
- [unaddressed] "what it needs before it can start" has not been addressed on activity:tint-to-white changeover. (`activity:tint-to-white changeover` — what it needs before it can start)
- [unaddressed] "what it produces or changes" has not been addressed on activity:tint-to-white changeover. (`activity:tint-to-white changeover` — what it produces or changes)
- [unaddressed] "who or what performs it" has not been addressed on activity:tint-to-white changeover. (`activity:tint-to-white changeover` — who or what performs it)
- [below-required-precision] "how long it takes" on activity:tint-to-white changeover is known as a range; the model needs spread. Smallest delta: move it from range to spread. (`activity:tint-to-white changeover` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:tint-to-white changeover. (`activity:tint-to-white changeover` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what it needs before it can start" has not been addressed on activity:tint-to-white washdown. (`activity:tint-to-white washdown` — what it needs before it can start)
- [open-conflict] "how long it takes" on activity:tint-to-white washdown has competing active captures; an explicit, user-cited resolution must close it. (`activity:tint-to-white washdown` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:tint-to-white washdown. (`activity:tint-to-white washdown` — how often it occurs, if it is an event rather than a step)
- [below-required-precision] "what is lost when it changes the system's mode" on activity:tint-to-white washdown is known as a spelled out; the model needs range. Smallest delta: move it from spelled out to range. (`activity:tint-to-white washdown` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:tint-to-white washdown. (`activity:tint-to-white washdown` — whether its quantities vary by type)
- [unaddressed] "what it produces or changes" has not been addressed on activity:white-to-tint changeover. (`activity:white-to-tint changeover` — what it produces or changes)
- [open-conflict] "who or what performs it" on activity:white-to-tint changeover has competing active captures; an explicit, user-cited resolution must close it. (`activity:white-to-tint changeover` — who or what performs it)
- [open-conflict] "how long it takes" on activity:white-to-tint changeover has competing active captures; an explicit, user-cited resolution must close it. (`activity:white-to-tint changeover` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:white-to-tint changeover. (`activity:white-to-tint changeover` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:white-to-tint changeover. (`activity:white-to-tint changeover` — what is lost when it changes the system's mode)
- [unaddressed] "what it produces or changes" has not been addressed on activity:white-to-tint changeover on Line 2. (`activity:white-to-tint changeover on Line 2` — what it produces or changes)
- [below-required-precision] "how long it takes" on activity:white-to-tint changeover on Line 2 is known as a range; the model needs spread. Smallest delta: move it from range to spread. (`activity:white-to-tint changeover on Line 2` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:white-to-tint changeover on Line 2. (`activity:white-to-tint changeover on Line 2` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:white-to-tint changeover on Line 2. (`activity:white-to-tint changeover on Line 2` — whether its quantities vary by type)
- [unaddressed] "the starting state" has not been addressed on boundary-condition:demand book release. (`boundary-condition:demand book release` — the starting state)
- [below-required-precision] "the arrival or availability pattern" on boundary-condition:demand book release is known as a named; the model needs spread or spelled out. Smallest delta: move it from named to one of spread or spelled out. (`boundary-condition:demand book release` — the arrival or availability pattern)
- [open-conflict] "the starting state" on boundary-condition:the demand book has competing active captures; an explicit, user-cited resolution must close it. (`boundary-condition:the demand book` — the starting state)
- [open-conflict] "the arrival or availability pattern" on boundary-condition:the demand book has competing active captures; an explicit, user-cited resolution must close it. (`boundary-condition:the demand book` — the arrival or availability pattern)
- [open-conflict] "the limit and what happens when it is hit" on constraint:no Meridian misses has competing active captures; an explicit, user-cited resolution must close it. (`constraint:no Meridian misses` — the limit and what happens when it is hit)
- [open-conflict] "the limit and what happens when it is hit" on constraint:we just don't do that (Meridian) has competing active captures; an explicit, user-cited resolution must close it. (`constraint:we just don't do that (Meridian)` — the limit and what happens when it is hit)
- [open-conflict] "the distinctions the process treats apart" on entity-type:changeover crew has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:changeover crew` — the distinctions the process treats apart)
- [open-conflict] "how many there are, or the population's shape" on entity-type:changeover crew has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:changeover crew` — how many there are, or the population's shape)
- [unaddressed] "the distinctions the process treats apart" has not been addressed on entity-type:line. (`entity-type:line` — the distinctions the process treats apart)
- [unaddressed] "state that rides along with each instance" has not been addressed on entity-type:line. (`entity-type:line` — state that rides along with each instance)
- [below-required-precision] "how many there are, or the population's shape" on entity-type:line is known as a number; the model needs range. Smallest delta: move it from number to range. (`entity-type:line` — how many there are, or the population's shape)
- [unaddressed] "the distinctions the process treats apart" has not been addressed on entity-type:lines. (`entity-type:lines` — the distinctions the process treats apart)
- [unaddressed] "state that rides along with each instance" has not been addressed on entity-type:lines. (`entity-type:lines` — state that rides along with each instance)
- [below-required-precision] "how many there are, or the population's shape" on entity-type:lines is known as a number; the model needs range. Smallest delta: move it from number to range. (`entity-type:lines` — how many there are, or the population's shape)
- [open-conflict] "the distinctions the process treats apart" on entity-type:order has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:order` — the distinctions the process treats apart)
- [open-conflict] "state that rides along with each instance" on entity-type:order has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:order` — state that rides along with each instance)
- [open-conflict] "how many there are, or the population's shape" on entity-type:order has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:order` — how many there are, or the population's shape)
- [open-conflict] "the distinctions the process treats apart" on entity-type:the changeover crew has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:the changeover crew` — the distinctions the process treats apart)
- [unaddressed] "state that rides along with each instance" has not been addressed on entity-type:the changeover crew. (`entity-type:the changeover crew` — state that rides along with each instance)
- [open-conflict] "how many there are, or the population's shape" on entity-type:the changeover crew has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:the changeover crew` — how many there are, or the population's shape)
- [open-conflict] "the distinctions the process treats apart" on entity-type:the three lines has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:the three lines` — the distinctions the process treats apart)
- [unaddressed] "state that rides along with each instance" has not been addressed on entity-type:the three lines. (`entity-type:the three lines` — state that rides along with each instance)
- [open-conflict] "how many there are, or the population's shape" on entity-type:the three lines has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:the three lines` — how many there are, or the population's shape)
- [unaddressed] "the question, in the expert's words" has not been addressed on objective:Meridian-versus-small-orders exchange rate. (`objective:Meridian-versus-small-orders exchange rate` — the question, in the expert's words)
- [unaddressed] "what "better" means, and trade-off weights" on objective:Meridian-versus-small-orders exchange rate is open: the expert answered "deferred", pointing at commercial — would have to be got in a room and forced to say it out loud; that is not a value. (`objective:Meridian-versus-small-orders exchange rate` — what "better" means, and trade-off weights)
- [open-conflict] "the order things happen in" on ordering/flow:release to cleared QA has competing active captures; an explicit, user-cited resolution must close it. (`ordering/flow:release to cleared QA` — the order things happen in)
- [open-conflict] "how a branch or merge is decided" on ordering/flow:release to cleared QA has competing active captures; an explicit, user-cited resolution must close it. (`ordering/flow:release to cleared QA` — how a branch or merge is decided)
- [open-conflict] "the rule as actually practiced" on policy:who gets the changeover crew has competing active captures; an explicit, user-cited resolution must close it. (`policy:who gets the changeover crew` — the rule as actually practiced)
- [open-conflict] "the rule as actually practiced" on policy:who gets the crew has competing active captures; an explicit, user-cited resolution must close it. (`policy:who gets the crew` — the rule as actually practiced)
- [open-conflict] "what overrides it" on policy:who gets the crew has competing active captures; an explicit, user-cited resolution must close it. (`policy:who gets the crew` — what overrides it)

## Outside every objective's slice

- `activity:a breakdown on a line` — 7 open
- `activity:breakdown on a line` — 7 open
- `activity:run on the line` — 7 open
- `activity:the hold-or-change-over call` — 5 open
- `constraint:one crew serving three lines` — 0 open
- `constraint:one-week planning horizon` — 1 open
- `constraint:planning horizon` — 0 open
- `data-binding:changeover log` — 0 open
- `data-binding:changeover log and late-order report` — 1 open
- `data-binding:changeover log, late-order report and the sheet` — 0 open
- `data-binding:late-order report` — 0 open
- `policy:Meridian-to-Line-2` — 2 open
- `policy:sit the line for an expected same-colour order` — 1 open
- `policy:the wash-versus-idle call` — 1 open
- `validation-criterion:recognize the shape of a real month` — 1 open
- `validation-criterion:the shape of a real month` — 0 open

## The harness's cue at close

```
The harness folded the model at revision 34f9da8a0149564c (plugin sdcpn/2026-08-26.2): 51 node(s) from 166 active capture(s). Complete: no.

Unsatisfied, in file order:
- [unsupported-active-objective] objective:Meridian-versus-small-orders exchange rate depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [unaddressed] "how long it takes" has not been addressed on activity:changeover (washdown).
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:changeover (washdown).
- [inadmissible-status] "what is lost when it changes the system's mode" on activity:changeover (washdown) is held under status tentative; accepted: explicit.
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:changeover (washdown).
- [unaddressed] "what it produces or changes" has not been addressed on activity:changeover wash down.
- [unaddressed] "how long it takes" has not been addressed on activity:changeover wash down.
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:changeover wash down.
- [below-required-precision] "what is lost when it changes the system's mode" on activity:changeover wash down is known as a named; the model needs range. Smallest delta: move it from named to range.
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:changeover wash down.
- [unaddressed] "what it needs before it can start" has not been addressed on activity:clears QA hold.
- [unaddressed] "who or what performs it" has not been addressed on activity:clears QA hold.
- … and 81 more.

Patterns whose trigger may apply (discretionary):
- P01 on activity:changeover (washdown): occurrence and duration are two slots. Ask how often, as a range, for each named event separately; then how long, as a spread. Keep the value grade the expert actually gave; never round a range up to a spread.
- P02 on activity:changeover (washdown): ask what is lost in the transition, as a range, after a *named* transition. If the expert does not know, ask what they would treat as an authoritative source — never convert "unknown" into a value. Ask before recording an explicit "not applicable"; an ordinary activity with no mode change is a useful negative answer, not a reason to skip the slot.
- P08 on activity:changeover (washdown): record both on the same node under `source-regime`, with the expert's account of when they diverge. Do not average them and do not pick one.
- P04 on boundary-condition:demand book release: replace any time-shaped approximation ("about two days before") with the practiced event or state that makes it runnable, who or what flips it, and where that is observable.
- P05 on entity-type:changeover crew: ask which wins, what overrides that, how ties break, and for a recent borderline case that shows the practiced rule. Never infer the rule from a schedule or a document.
- P07 on entity-type:changeover crew: ask explicitly whether it varies by type. Record "no" as a value; it is load-bearing.
- P03 on ordering/flow:release to cleared QA: ask what the group is, the smallest sensible one, whether a group must stay together, and what an extra split costs (extra mode changes, extra loss) on the activities it touches.

16 node(s) lie outside every objective's dependency slice and are recorded but not demanded.

Completion is computed from the model, never from the conversation; it does not decide whether to continue. Choose the next question, or none.
```
