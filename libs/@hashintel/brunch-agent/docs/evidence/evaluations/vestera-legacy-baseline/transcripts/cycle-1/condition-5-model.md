# Condition 5 — the elicited model, folded from the capture store

The harness's own deliverable: `foldElicitedModel` over the active captures, then
`evaluateCompletion` against the sdcpn definition. Nothing here was written by the
interviewer; every value is a capture the sweep extracted and the store admitted.

- Plugin version: `sdcpn/2026-08-25.2`
- Revision: `26a8219a17118558`
- Active captures: 267
- Complete: **no** — 46 unsatisfied, 53 node(s) outside every objective's slice, 0 unmapped capture(s)

## Nodes

### entity-type (12)

#### `entity-type:line`
- **how many there are, or the population's shape** — conflict — 2 readings
- **state that rides along with each instance** — "What it is currently running — e.g. mid-run on a tint, which sets the colour it would have to be washed down from — and whether it is jammed/down awaiting repair." — spelled out, inferred, practiced — _A line is spoken of as carrying what it is currently running (its colour state) and whether it is down._
- **the distinctions the process treats apart** — conflict — 2 readings

#### `entity-type:line (Line 1 / Line 2)`
- **how many there are, or the population's shape** — conflict — 2 readings
- **the distinctions the process treats apart** — conflict — 3 readings

#### `entity-type:Line 1 and Line 2`
- **how many there are, or the population's shape** — "Two lines — Line 1 and Line 2." — number, explicit — _The expert speaks only of Line 1 and Line 2 throughout._
- **state that rides along with each instance** — "What order is on it, how far through that order is, and what family (tint or white) it is currently running — the last decides washdown cost and direction." — spelled out, explicit
- **the distinctions the process treats apart** — conflict — 3 readings

#### `entity-type:mix, mill, tint, fill`
- **how many there are, or the population's shape** — absence: unknown-to-user → how much overlap happens and how often mixing is blocked by a full tank is not tracked by the scheduler (explicit)
- **the distinctions the process treats apart** — divergence — prescribed {"value":"On the sheet the line is one row treated as one thing: the order occupies it for its whole run, mix through fill, and nothing else is scheduled on it until it is done."}; practiced {"value":"Physically four separate tanks and separate kit strung together with small holding tanks in between; the mixer can start the next order's batch while the fill head is still finishing the last, if there is room in the holding tank — the crew will get a head start on mixing the next batch if the tank ahead of it has space."}

#### `entity-type:mix, mill, tint, fill kit and holding tanks`
- **how many there are, or the population's shape** — absence: deferred → engineering drawings (explicit)
- **the distinctions the process treats apart** — "Mix, mill, tint and fill are separate tanks and separate kit strung together, with small holding tanks between them." — spelled out, explicit, practiced

#### `entity-type:mix, mill, tint, fill stages`
- **how many there are, or the population's shape** — absence: deferred → engineering drawings (tank sizes) — expert does not carry them in his head (explicit)
- **the distinctions the process treats apart** — "Mix, mill, tint, fill are separate tanks and separate kit strung together with small holding tanks in between; the mixer can be starting the next order's batch while the fill head is still finishing the last one, if the holding tank between mix and mill, or mill and fill, has room." — spelled out, explicit, practiced — _The floor's account: four separately contended pieces of kit per line, buffered by small holding tanks._

#### `entity-type:order`
- **how many there are, or the population's shape** — absence: unknown-to-user → demand book / ERP (inferred)
- **state that rides along with each instance** — conflict — 6 readings
- **the distinctions the process treats apart** — conflict — 6 readings

#### `entity-type:order (demand book line item)`
- **state that rides along with each instance** — "Quantity, due date, SKU; plus remaining quantity and the customer's identity, which the expert weighs when an order slips." — spelled out, inferred — _Quantity, due date and SKU are explicit; remaining quantity and customer identity are named later as things the answer hangs on._
- **the distinctions the process treats apart** — "Orders are treated apart by whose order it is: a distributor sliding two days is a shrug, a small account sliding a week is fine, an awkward account that gets prickly is a second problem." — spelled out, explicit, practiced

#### `entity-type:order (line item in the demand book)`
- **state that rides along with each instance** — "Quantity, due date, SKU; the customer (distributor / small account / awkward account); which line and week-slot it has been allocated to; whether it has gone late and by how many days." — spelled out, explicit — _Quantity, due date, SKU come from ERP; customer type is used in the slip judgement; line allocation is set at step one._
- **the distinctions the process treats apart** — "Orders are line items with quantity, due date and SKU. Treated apart: whites (tint stage barely there, more of a pass-through than a real letdown step) vs tints (real letdown); and by customer — a distributor sliding two days is a shrug, a small account sliding a week is fine, an awkward account that gets prickly is a second problem." — spelled out, explicit — _Whites vs tints differ in the tint stage and in run time by line; customer identity differs in slip tolerance._

#### `entity-type:product family (white vs tint)`
- **the distinctions the process treats apart** — "Whites versus tints: for a white the tint stage is barely there, more of a pass-through than a real letdown step; tints run at nearly the same speed on both lines while whites do not; and the tint-to-white changeover direction is the expensive one." — spelled out, explicit

#### `entity-type:stage kit (mix, mill, tint, fill)`
- **the distinctions the process treats apart** — "Four separate pieces of kit per line — mixer, mill, tint, fill head — each usable independently, with small holding tanks buffering between mix/mill and mill/fill." — spelled out, explicit, practiced — _Each stage is separately contended kit._

#### `entity-type:the four stages — mix, mill, tint, fill`
- **how many there are, or the population's shape** — "Four stages in series per line — mix, mill, tint, fill — with small holding tanks between them; how often blocking occurs is not tracked." — named, explicit — _Count of stages is stated; occupancy/blocking frequency is explicitly untracked._
- **the distinctions the process treats apart** — "Physically mix, mill, tint and fill are separate tanks and separate kit strung together with small holding tanks in between; the mixer can start the next order's batch while the fill head finishes the last one if the tank ahead has space." — spelled out, explicit, practiced — _The floor's version of the line: four contended stages with buffers, not one resource._

### boundary-condition (2)

#### `boundary-condition:demand book from ERP`
- **the arrival or availability pattern** — conflict — 2 readings
- **the starting state** — conflict — 3 readings

#### `boundary-condition:demand book line items out of ERP`
- **the starting state** — "An order starts life as a line item in the demand book once ERP spits that out, carrying quantity, due date and SKU." — spelled out, explicit

### activity (15)

#### `activity:allocation`
- **what it needs before it can start** — conflict — 5 readings
- **what it produces or changes** — conflict — 5 readings
- **who or what performs it** — conflict — 3 readings

#### `activity:allocation onto a line and a slot in the week`
- **what it needs before it can start** — "A line item in the demand book out of ERP, with quantity, due date and SKU." — spelled out, explicit
- **what it produces or changes** — "The order is placed onto a named line and a slot in the week." — spelled out, explicit
- **who or what performs it** — "The master scheduler, on the sheet." — named, explicit

#### `activity:filler jam`
- **how long it takes** — conflict — 5 readings
- **how often it occurs, if it is an event rather than a step** — conflict — 3 readings
- **what it needs before it can start** — "Repair duration is not known at the time of the decision — \"which I never know at the time\"; only \"could be quick, could be long\"." — spelled out, explicit — _At the time of the decision the repair length is unobservable to the scheduler._
- **what it produces or changes** — conflict — 5 readings
- **who or what performs it** — "A tech — comes over, clears whatever's jammed, resets." — named, explicit — _Repair is done by a tech._

#### `activity:filler jam on Line 2`
- **how long it takes** — "Repair: typical thirty to forty-five minutes; quick one-in-ten ten to fifteen minutes (basically a false alarm); bad one-in-ten four to five hours when something is actually broken in the filler head, occasionally eating the rest of the shift." — spread, explicit, practiced
- **how often it occurs, if it is an event rather than a step** — "Every week or two; low end once every three weeks, high end twice a week. Not seasonal, but runs streaks of bad weeks." — range, explicit, practiced
- **what it produces or changes** — "The run stops and time is lost inside the run — the big bad days (twelve to thirteen hours) are the breakdown showing up inside the run rather than the run being slow." — spelled out, explicit
- **who or what performs it** — "A tech comes over, clears whatever's jammed and resets." — named, explicit

#### `activity:filler jammed`
- **how long it takes** — "Two kinds of repair: the \"half hour\" kind and the \"half a shift\" kind. The most recent Line 2 filler jam came back in about two hours." — range, explicit, practiced — _Two recognised repair kinds bracket the duration; the recent instance fell between them._
- **what it produces or changes** — "The line's filler stops mid-run with an unknown ETA, putting the order on it at risk and forcing a decision to wait out the repair or move the order to the other line." — spelled out, explicit — _An event that befalls the line mid-run and forces the switch-or-wait decision._

#### `activity:Line 2 filler jam`
- **how long it takes** — "Repairs come in a \"half hour\" kind and a \"half a shift\" kind; the recent instance came back in about two hours." — range, explicit, practiced — _Expert described two kinds of repair — half an hour and half a shift — and one observed instance of about two hours; quantiles not yet elicited._
- **what it produces or changes** — "Line 2 stops producing until repaired (half a shift lost in the recent case); the order sitting on Line 2 is at risk of its due date, forcing a decision to wait out the repair or shift the order to Line 1." — spelled out, explicit, practiced — _The event takes the line out of production and puts the order sitting on it at risk, forcing a wait-or-move decision._

#### `activity:mix/mill/tint/fill`
- **what it produces or changes** — "Runs the order through four stages every product goes through — mix, mill, tint, fill and pack — producing filled and packed product that comes off the fill line." — spelled out, explicit — _Stated as the production step common to all products._
- **whether its quantities vary by type** — "Yes — the stages are the same for every product, but for a white the tint stage is barely there, a pass-through rather than a real letdown step." — named, explicit — _Explicit type-dependence at the tint stage; stage durations themselves not yet given._

#### `activity:production run (mix, mill, tint, fill)`
- **how long it takes** — conflict — 3 readings
- **what it needs before it can start** — "The order allocated to a line and a slot in the week; then it runs the same four stages every product goes through — mix, mill, tint, fill and pack." — spelled out, explicit
- **what it produces or changes** — "Packed product coming off the fill line, which then goes into QA hold." — spelled out, explicit
- **whether its quantities vary by type** — "Yes — run time varies by product family and line: whites are much slower on Line 1, tints are nearly the same speed on either line; the \"Line 2 is twice as fast\" figure is really a whites number. No explanation for the tint case; it is sheet-derived." — named, explicit

#### `activity:QA hold`
- **how long it takes** — conflict — 7 readings
- **what it needs before it can start** — "The order has come off the fill line; it then sits in the lab's queue awaiting check." — spelled out, explicit — _Stated as the precondition and the waiting arrangement._
- **what it produces or changes** — conflict — 3 readings
- **whether its quantities vary by type** — conflict — 2 readings
- **who or what performs it** — conflict — 7 readings

#### `activity:release and ship`
- **what it produces or changes** — conflict — 4 readings

#### `activity:run it through mix/mill/tint/fill`
- **how long it takes** — conflict — 6 readings
- **what it needs before it can start** — conflict — 2 readings
- **what it produces or changes** — conflict — 2 readings
- **whether its quantities vary by type** — conflict — 3 readings
- **who or what performs it** — conflict — 2 readings

#### `activity:run the batch (mix/mill/tint/fill)`
- **how long it takes** — absence: deferred → the expert's scheduling sheet (roughly how long a batch of a given SKU takes end to end on each line) (explicit)
- **what it produces or changes** — "The order is produced through the same four stages every product goes through — mix, mill, tint, fill and pack — and comes off the fill line." — spelled out, explicit — _The production run through the four stages._
- **whether its quantities vary by type** — absence: deferred → the historian (stage-by-stage times: how long does mixing take, how long does milling take) (explicit)

#### `activity:the run (mix, mill, tint, fill)`
- **how long it takes** — conflict — 4 readings
- **what it needs before it can start** — "The order allocated onto a line and a slot in the week (\"I slot it onto Line 2 on the sheet, that's step one, allocation\")." — spelled out, explicit
- **what it produces or changes** — "Filled and packed product coming off the fill line, which then goes into QA hold." — spelled out, explicit
- **whether its quantities vary by type** — "Yes — run time varies by family and by line: whites are about twice as fast on Line 2 as Line 1, tints run at nearly the same speed on both; and different SKUs are slow at different stages." — named, explicit
- **who or what performs it** — "The line (Line 1 or Line 2) — its mix, mill, tint and fill kit — worked by the crew." — named, explicit

#### `activity:tint stage`
- **whether its quantities vary by type** — "Yes — for a white the tint stage is barely there, more of a pass-through than a real letdown step." — named, explicit — _Explicit variation by product type._

#### `activity:tint-to-white washdown`
- **how long it takes** — conflict — 6 readings
- **what is lost when it changes the system's mode** — conflict — 8 readings
- **what it needs before it can start** — conflict — 7 readings
- **what it produces or changes** — conflict — 4 readings
- **who or what performs it** — "The crew, on the line being changed over (Line 1 in the incident described)." — named, explicit

### ordering/flow (8)

#### `ordering/flow:allocate → run → QA hold → release and ship`
- **the order things happen in** — conflict — 2 readings

#### `ordering/flow:line occupancy across the four stages`
- **the order things happen in** — divergence — prescribed {"value":"On the sheet, Line 2 is one row: the order occupies Line 2 for its whole run, mix through fill, and nothing else is scheduled on it until it is done."}; practiced {"value":"Physically the stages overlap: the mixer can start the next order's batch while the fill head is still finishing the last one, if there is room in the holding tank between mix and mill, or mill and fill; the crew will get a head start on mixing if the tank ahead has space."}

#### `ordering/flow:order flow from demand book to ship`
- **the order things happen in** — "Allocate it onto a line and a slot in the week → run it through mix/mill/tint/fill → QA hold → release and ship against the due date." — spelled out, explicit

#### `ordering/flow:order flow from demand book to shipment`
- **the order things happen in** — "allocate it onto a line and a slot in the week → run it through mix/mill/tint/fill (fill and pack) → QA hold → release and ship. Four steps if QA and shipping are counted as one, five if split." — spelled out, explicit — _Given verbatim as the end-to-end sequence for the Meridian white order._

#### `ordering/flow:order flow, allocate to ship`
- **the order things happen in** — "Allocate the order onto a line and a slot in the week → run it through mix / mill / tint / fill and pack → QA hold → release and ship. Four steps if QA and shipping count as one, five if split." — spelled out, explicit — _The end-to-end order stated by the expert._

#### `ordering/flow:order life on the floor`
- **the order things happen in** — "allocate it onto a line and a slot in the week → run it through mix/mill/tint/fill → QA hold → release and ship" — spelled out, explicit — _Expert's own summary of the end-to-end sequence._

#### `ordering/flow:order lifecycle: allocate, run, QA hold, release and ship`
- **how a branch or merge is decided** — "The scheduler slots the order onto a line on the sheet at allocation; on a disruption the choice is re-decided — shift it to the other line or wait out the repair." — spelled out, explicit — _The line choice is made by the scheduler at allocation and can be revisited on disruption._
- **the order things happen in** — "allocate it onto a line and a slot in the week → run it through mix/mill/tint/fill → QA hold → release and ship" — spelled out, explicit

#### `ordering/flow:stage overlap on a line`
- **how a branch or merge is decided** — absence: unknown-to-user (explicit)
- **the order things happen in** — conflict — 3 readings

### policy (5)

#### `policy:a line is occupied for the whole run`
- **the rule as actually practiced** — "On the sheet, a line is one row: the order occupies that line for its whole run, mix through fill, and nothing else is scheduled on it till it's done." — spelled out, explicit, prescribed — _P08: the scheduling sheet's rule, which the expert says lies to him a bit._
- **what overrides it** — "On the floor the crew will get a head start on mixing the next batch if the tank ahead of it has space — the mixer can start the next order while the fill head finishes the last one. How much overlap happens, and how often it is blocked because a tank is full, is not tracked." — spelled out, explicit, practiced — _P08 divergence: floor practice overlaps stages when buffer space allows._

#### `policy:Meridian on time`
- **the rule as actually practiced** — "A Meridian-style order ships on time, full stop; it is not traded off against anything." — spelled out, explicit, practiced — _Hard constraint on the scheduling decision._
- **what overrides it** — "Only when there is truly no way through." — spelled out, explicit, practiced — _Only exception stated._

#### `policy:Meridian ships on time, full stop`
- **the rule as actually practiced** — "The Meridian order ships on time, full stop; it is not traded off against washdown hours or other orders' due dates." — spelled out, explicit, practiced — _Stated as an absolute the scheduler protects ahead of all other considerations._
- **what overrides it** — "Only when there is truly no way through; otherwise nothing overrides it." — spelled out, explicit, practiced — _Expert named the sole override in general terms; the practiced test for "no way through" is not yet on record._

#### `policy:wait for the repair or shift the order to Line 1`
- **the rule as actually practiced** — "Gut math at the huddle: weigh the gamble that the repair is the \"half hour\" kind against the tint-to-white washdown plus the bumped tint order going late. In the Meridian case he went with waiting; it came back in about two hours and just scraped the Thursday due date." — spelled out, explicit, practiced
- **what overrides it** — "The Meridian-style on-time due date overrides the weighing — a line he won't cross unless there's truly no way through." — spelled out, explicit

#### `policy:who can absorb the slip`
- **the rule as actually practiced** — conflict — 7 readings
- **what overrides it** — conflict — 4 readings

### objective (7)

#### `objective:is the mill-to-fill tank on Line 1 slowing the line down`
- **the nodes it depends on** — conflict — 3 readings
- **the question, in the expert's words** — "\"Is the mill-to-fill tank on Line 1 actually slowing the line down, or is that just a story I tell myself?\"" — spelled out, explicit — _Second question the expert wrote out as he would type it._
- **what "better" means, and trade-off weights** — "The model showing \"here's where Line 1 loses its time\" — something to take to engineering other than a hunch; no numeric weighting given." — spelled out, explicit — _Qualitative: showing where Line 1 loses its time, in a form usable with engineering._

#### `objective:switch or wait when Line 2 goes down`
- **the nodes it depends on** — ["entity-type:order","entity-type:line","activity:run it through mix/mill/tint/fill","activity:tint-to-white washdown","activity:filler jam","policy:who can absorb the slip"] — named, explicit — _The expert listed what the answer hangs on: the protected run and its due date, the state of Line 1, the changeover and its direction, the jam duration, and whose order gets bumped._
- **the question, in the expert's words** — "\"If Line 2 goes down mid-run, is it cheaper to wait for the repair or shift the order to Line 1, given what that costs the order already running there?\"" — spelled out, explicit — _The expert wrote the question as he would type it into the tool._
- **what "better" means, and trade-off weights** — "Hard line: days late on Meridian, anything above zero is bad news. Underneath that, weighed by judgment with no formula: washdown hours, and whether the bumped order goes late and by how much and for which customer." — spelled out, explicit, practiced — _Expert gave a lexicographic hard constraint plus unweighted second-order criteria, explicitly denying a formula._

#### `objective:switch or wait when Line 2 goes down mid-run`
- **the nodes it depends on** — ["entity-type:order","entity-type:Line 1 and Line 2","activity:the run (mix, mill, tint, fill)","activity:filler jam","activity:tint-to-white washdown","policy:who can absorb the slip","constraint:Meridian ships on time"] — named, explicit — _The expert listed what the answer hangs on._
- **the question, in the expert's words** — "\"If Line 2 goes down mid-run, is it cheaper to wait for the repair or shift the order to Line 1, given what that costs the order already running there?\"" — spelled out, explicit — _The expert wrote the question as they would type it into the tool._
- **what "better" means, and trade-off weights** — "Meridian on time is non-negotiable (days late on Meridian, anything above zero is bad news); underneath that, washdown hours and whether the bumped order goes late and by how much are weighed by judgment — \"I don't have a formula for it.\"" — spelled out, explicit — _Hard constraint plus unweighted secondary measures; the expert explicitly denied having a formula._

#### `objective:wait or shift when Line 2 goes down`
- **the nodes it depends on** — "entity-type:order (demand book line item) — its due date and remaining quantity; entity-type:line (Line 1 / Line 2) — what is on Line 1 and how far through; entity-type:product family (white vs tint); activity:production run (mix, mill, tint, fill); activity:filler jam on Line 2 — repair length unknown at the time; activity:tint-to-white washdown — including its direction and ramp scrap; policy:who can absorb the slip — whose tint got bumped" — named, explicit
- **the question, in the expert's words** — "\"If Line 2 goes down mid-run, is it cheaper to wait for the repair or shift the order to Line 1, given what that costs the order already running there?\"" — spelled out, explicit — _The expert wrote the question as he would type it into the tool._
- **what "better" means, and trade-off weights** — "Lexicographic: days late on Meridian first, anything above zero is bad; below that, weigh washdown hours against whether the bumped order goes late and by how much and who the customer is. No formula — judgment on who can absorb the slip." — spelled out, explicit, practiced

#### `objective:where Line 1 loses its time`
- **the nodes it depends on** — conflict — 3 readings
- **the question, in the expert's words** — conflict — 3 readings

#### `objective:which option actually loses less`
- **the nodes it depends on** — conflict — 3 readings
- **the question, in the expert's words** — conflict — 3 readings
- **what "better" means, and trade-off weights** — conflict — 3 readings

#### `objective:which option loses less`
- **the nodes it depends on** — conflict — 2 readings
- **the question, in the expert's words** — conflict — 2 readings
- **what "better" means, and trade-off weights** — conflict — 2 readings

### constraint (8)

#### `constraint:holding tank capacity between stages`
- **the limit and what happens when it is hit** — "A stage can only get a head start if there's room in the holding tank ahead of it; when a tank's full, mixing has to wait. How often that blocking happens is not tracked by the expert." — spelled out, explicit — _Blocking consequence stated; frequency and size not tracked._

#### `constraint:Meridian on time`
- **the limit and what happens when it is hit** — "The hard-line customer's order must ship on or before its due date — days late must be zero. The line is not crossed unless there is truly no way through; if it is crossed, the scheduler has to go explain it." — spelled out, explicit, practiced — _Stated as non-negotiable with a named consequence._

#### `constraint:Meridian ships on time`
- **the limit and what happens when it is hit** — "Meridian ships on time, full stop; days late above zero is bad news the scheduler has to go explain. Only crossed \"unless there's truly no way through\"." — spelled out, explicit

#### `constraint:Meridian-style due date is a line I won't cross`
- **the limit and what happens when it is hit** — "The protected order must ship on time; days late above zero is bad news the scheduler has to go explain. The line is crossed only if there's truly no way through." — spelled out, explicit, practiced

#### `constraint:published line rate`
- **the limit and what happens when it is hit** — divergence — prescribed {"value":"Engineering's position is that the line rate is what it is regardless of the tanks."}; practiced {"value":"In practice Line 1 feels sluggish and blocked in ways the published line rate does not account for; the expert suspects the mill-to-fill tank costs more than people admit, but has no proof."}

#### `constraint:small holding tank between mill and fill on Line 1`
- **the limit and what happens when it is hit** — "Holding tanks between stages are small — especially the one between mill and fill on Line 1. When there is room, the upstream stage can start the next order's batch; when the tank is full, the upstream stage is blocked and mixing has to wait. Actual tank capacity is not held by the expert; engineering's position is that the line rate is what it is regardless." — spelled out, explicit — _Qualitative blocking rule stated; the numeric capacity is not available from the expert._

#### `constraint:small holding tanks`
- **the limit and what happens when it is hit** — conflict — 2 readings

#### `constraint:small holding tanks between stages`
- **the limit and what happens when it is hit** — conflict — 3 readings

### data-binding (10)

#### `data-binding:filler repair times from the CMMS`
- **the variable and its feed** — absence: deferred → maintenance work-order times in the CMMS (explicit)

#### `data-binding:filler repair work-order times in the CMMS`
- **the variable and its feed** — "Actual filler repair durations — feed: maintenance work-order times in the CMMS; never pulled by the expert." — named, explicit

#### `data-binding:stage-by-stage durations from the historian`
- **the variable and its feed** — "Stage-by-stage durations (how long mixing takes, how long milling takes) per SKU and line — feed: the historian. Never pulled apart; only end-to-end batch time per SKU per line is on the scheduling sheet." — named, explicit — _Stage-level rates exist as data but not in the expert's head; feed named._

#### `data-binding:stage-by-stage rates from the historian`
- **the variable and its feed** — "Stage-by-stage durations (how long mixing takes, how long milling takes) — feed: the plant historian; never pulled apart, not known to the scheduler." — named, explicit — _Stage-level durations are needed for the separate-stage model and exist only in the historian._

#### `data-binding:stage-by-stage times`
- **the variable and its feed** — "Stage-by-stage durations (how long mixing takes, how long milling takes) — the historian." — named, explicit — _Named feed for stage durations._

#### `data-binding:stage-level rates`
- **the variable and its feed** — "Stage-by-stage durations/rates (how long mixing takes, how long milling takes, mill speed versus fill speed on Line 1) — feed: the historian." — named, explicit — _Expert named the system where the missing stage-level numbers live._

#### `data-binding:stage-level times from the historian and tank sizes from engineering drawings`
- **the variable and its feed** — absence: deferred → the historian (stage-by-stage times) and engineering drawings (tank sizes) (explicit)

#### `data-binding:stage-level times in the historian`
- **the variable and its feed** — "Stage-by-stage durations (how long mixing takes, how long milling takes) — feed: the historian; never pulled apart by the expert." — named, explicit

#### `data-binding:tank sizes`
- **the variable and its feed** — conflict — 2 readings

#### `data-binding:tank sizes from engineering drawings`
- **the variable and its feed** — "Holding tank sizes, especially mill-to-fill on Line 1 — feed: engineering drawings." — named, explicit

### validation-criterion (2)

#### `validation-criterion:stage rates must come from data, not gut-feel`
- **how the expert would know the model is right** — "Stage-level rates and tank sizes must not be taken from the expert's gut-feel — he can supply gut-feel and known bottleneck stories, but real numbers must come from the historian and engineering drawings." — spelled out, explicit — _Expert explicitly bounds what his own testimony can support._

#### `validation-criterion:the sheet's end-to-end batch times`
- **how the expert would know the model is right** — "The model's end-to-end batch time for a given SKU on each line should match what the scheduler's sheet shows; and it would have to speak to engineering's claim that \"the line rate is what it is regardless\"." — named, explicit — _The only figures the expert holds first-hand are sheet-level end-to-end times per SKU per line; engineering's counter-claim is that the line rate is what it is regardless of the tanks._

## Completion report

- [unsupported-active-objective] objective:is the mill-to-fill tank on Line 1 slowing the line down depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:is the mill-to-fill tank on Line 1 slowing the line down` — the nodes it depends on)
- [unsupported-active-objective] objective:wait or shift when Line 2 goes down depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:wait or shift when Line 2 goes down` — the nodes it depends on)
- [unsupported-active-objective] objective:where Line 1 loses its time depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:where Line 1 loses its time` — the nodes it depends on)
- [unsupported-active-objective] objective:which option actually loses less depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:which option actually loses less` — the nodes it depends on)
- [unsupported-active-objective] objective:which option loses less depends on nothing the model contains; an objective that depends on nothing is unsupported. (`objective:which option loses less` — the nodes it depends on)
- [open-conflict] "what it produces or changes" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it. (`activity:filler jam` — what it produces or changes)
- [open-conflict] "how long it takes" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it. (`activity:filler jam` — how long it takes)
- [open-conflict] "how often it occurs, if it is an event rather than a step" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it. (`activity:filler jam` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:filler jam. (`activity:filler jam` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:filler jam. (`activity:filler jam` — whether its quantities vary by type)
- [open-conflict] "what it needs before it can start" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it. (`activity:run it through mix/mill/tint/fill` — what it needs before it can start)
- [open-conflict] "what it produces or changes" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it. (`activity:run it through mix/mill/tint/fill` — what it produces or changes)
- [open-conflict] "who or what performs it" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it. (`activity:run it through mix/mill/tint/fill` — who or what performs it)
- [open-conflict] "how long it takes" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it. (`activity:run it through mix/mill/tint/fill` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:run it through mix/mill/tint/fill. (`activity:run it through mix/mill/tint/fill` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:run it through mix/mill/tint/fill. (`activity:run it through mix/mill/tint/fill` — what is lost when it changes the system's mode)
- [open-conflict] "whether its quantities vary by type" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it. (`activity:run it through mix/mill/tint/fill` — whether its quantities vary by type)
- [open-conflict] "how long it takes" on activity:the run (mix, mill, tint, fill) has competing active captures; an explicit, user-cited resolution must close it. (`activity:the run (mix, mill, tint, fill)` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:the run (mix, mill, tint, fill). (`activity:the run (mix, mill, tint, fill)` — how often it occurs, if it is an event rather than a step)
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:the run (mix, mill, tint, fill). (`activity:the run (mix, mill, tint, fill)` — what is lost when it changes the system's mode)
- [open-conflict] "what it needs before it can start" on activity:tint-to-white washdown has competing active captures; an explicit, user-cited resolution must close it. (`activity:tint-to-white washdown` — what it needs before it can start)
- [open-conflict] "what it produces or changes" on activity:tint-to-white washdown has competing active captures; an explicit, user-cited resolution must close it. (`activity:tint-to-white washdown` — what it produces or changes)
- [open-conflict] "how long it takes" on activity:tint-to-white washdown has competing active captures; an explicit, user-cited resolution must close it. (`activity:tint-to-white washdown` — how long it takes)
- [unaddressed] "how often it occurs, if it is an event rather than a step" has not been addressed on activity:tint-to-white washdown. (`activity:tint-to-white washdown` — how often it occurs, if it is an event rather than a step)
- [open-conflict] "what is lost when it changes the system's mode" on activity:tint-to-white washdown has competing active captures; an explicit, user-cited resolution must close it. (`activity:tint-to-white washdown` — what is lost when it changes the system's mode)
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:tint-to-white washdown. (`activity:tint-to-white washdown` — whether its quantities vary by type)
- [open-conflict] "the distinctions the process treats apart" on entity-type:line has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:line` — the distinctions the process treats apart)
- [inadmissible-status] "state that rides along with each instance" on entity-type:line is held under status inferred; accepted: explicit. (`entity-type:line` — state that rides along with each instance)
- [open-conflict] "how many there are, or the population's shape" on entity-type:line has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:line` — how many there are, or the population's shape)
- [open-conflict] "the distinctions the process treats apart" on entity-type:Line 1 and Line 2 has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:Line 1 and Line 2` — the distinctions the process treats apart)
- [below-required-precision] "how many there are, or the population's shape" on entity-type:Line 1 and Line 2 is known as a number; the model needs range. Smallest delta: move it from number to range. (`entity-type:Line 1 and Line 2` — how many there are, or the population's shape)
- [open-conflict] "the distinctions the process treats apart" on entity-type:order has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:order` — the distinctions the process treats apart)
- [open-conflict] "state that rides along with each instance" on entity-type:order has competing active captures; an explicit, user-cited resolution must close it. (`entity-type:order` — state that rides along with each instance)
- [inadmissible-status] "how many there are, or the population's shape" on entity-type:order is held under status inferred; accepted: explicit. (`entity-type:order` — how many there are, or the population's shape)
- [below-required-precision] "what "better" means, and trade-off weights" on objective:is the mill-to-fill tank on Line 1 slowing the line down is known as a spelled out; the model needs range. Smallest delta: move it from spelled out to range. (`objective:is the mill-to-fill tank on Line 1 slowing the line down` — what "better" means, and trade-off weights)
- [below-required-precision] "what "better" means, and trade-off weights" on objective:switch or wait when Line 2 goes down is known as a spelled out; the model needs range. Smallest delta: move it from spelled out to range. (`objective:switch or wait when Line 2 goes down` — what "better" means, and trade-off weights)
- [below-required-precision] "what "better" means, and trade-off weights" on objective:switch or wait when Line 2 goes down mid-run is known as a spelled out; the model needs range. Smallest delta: move it from spelled out to range. (`objective:switch or wait when Line 2 goes down mid-run` — what "better" means, and trade-off weights)
- [below-required-precision] "what "better" means, and trade-off weights" on objective:wait or shift when Line 2 goes down is known as a spelled out; the model needs range. Smallest delta: move it from spelled out to range. (`objective:wait or shift when Line 2 goes down` — what "better" means, and trade-off weights)
- [open-conflict] "the question, in the expert's words" on objective:where Line 1 loses its time has competing active captures; an explicit, user-cited resolution must close it. (`objective:where Line 1 loses its time` — the question, in the expert's words)
- [unaddressed] "what "better" means, and trade-off weights" has not been addressed on objective:where Line 1 loses its time. (`objective:where Line 1 loses its time` — what "better" means, and trade-off weights)
- [open-conflict] "the question, in the expert's words" on objective:which option actually loses less has competing active captures; an explicit, user-cited resolution must close it. (`objective:which option actually loses less` — the question, in the expert's words)
- [open-conflict] "what "better" means, and trade-off weights" on objective:which option actually loses less has competing active captures; an explicit, user-cited resolution must close it. (`objective:which option actually loses less` — what "better" means, and trade-off weights)
- [open-conflict] "the question, in the expert's words" on objective:which option loses less has competing active captures; an explicit, user-cited resolution must close it. (`objective:which option loses less` — the question, in the expert's words)
- [open-conflict] "what "better" means, and trade-off weights" on objective:which option loses less has competing active captures; an explicit, user-cited resolution must close it. (`objective:which option loses less` — what "better" means, and trade-off weights)
- [open-conflict] "the rule as actually practiced" on policy:who can absorb the slip has competing active captures; an explicit, user-cited resolution must close it. (`policy:who can absorb the slip` — the rule as actually practiced)
- [open-conflict] "what overrides it" on policy:who can absorb the slip has competing active captures; an explicit, user-cited resolution must close it. (`policy:who can absorb the slip` — what overrides it)

## Outside every objective's slice

- `activity:allocation` — 7 open
- `activity:allocation onto a line and a slot in the week` — 4 open
- `activity:filler jam on Line 2` — 3 open
- `activity:filler jammed` — 6 open
- `activity:Line 2 filler jam` — 6 open
- `activity:mix/mill/tint/fill` — 5 open
- `activity:production run (mix, mill, tint, fill)` — 4 open
- `activity:QA hold` — 6 open
- `activity:release and ship` — 7 open
- `activity:run the batch (mix/mill/tint/fill)` — 6 open
- `activity:tint stage` — 6 open
- `boundary-condition:demand book from ERP` — 2 open
- `boundary-condition:demand book line items out of ERP` — 1 open
- `constraint:holding tank capacity between stages` — 0 open
- `constraint:Meridian on time` — 0 open
- `constraint:Meridian-style due date is a line I won't cross` — 0 open
- `constraint:published line rate` — 1 open
- `constraint:small holding tank between mill and fill on Line 1` — 0 open
- `constraint:small holding tanks` — 1 open
- `constraint:small holding tanks between stages` — 1 open
- `data-binding:filler repair times from the CMMS` — 1 open
- `data-binding:filler repair work-order times in the CMMS` — 0 open
- `data-binding:stage-by-stage durations from the historian` — 0 open
- `data-binding:stage-by-stage rates from the historian` — 0 open
- `data-binding:stage-by-stage times` — 0 open
- `data-binding:stage-level rates` — 0 open
- `data-binding:stage-level times from the historian and tank sizes from engineering drawings` — 1 open
- `data-binding:stage-level times in the historian` — 0 open
- `data-binding:tank sizes` — 1 open
- `data-binding:tank sizes from engineering drawings` — 0 open
- `entity-type:line (Line 1 / Line 2)` — 3 open
- `entity-type:mix, mill, tint, fill` — 3 open
- `entity-type:mix, mill, tint, fill kit and holding tanks` — 2 open
- `entity-type:mix, mill, tint, fill stages` — 2 open
- `entity-type:order (demand book line item)` — 2 open
- `entity-type:order (line item in the demand book)` — 1 open
- `entity-type:product family (white vs tint)` — 2 open
- `entity-type:stage kit (mix, mill, tint, fill)` — 2 open
- `entity-type:the four stages — mix, mill, tint, fill` — 2 open
- `ordering/flow:allocate → run → QA hold → release and ship` — 2 open
- `ordering/flow:line occupancy across the four stages` — 2 open
- `ordering/flow:order flow from demand book to ship` — 1 open
- `ordering/flow:order flow from demand book to shipment` — 1 open
- `ordering/flow:order flow, allocate to ship` — 1 open
- `ordering/flow:order life on the floor` — 1 open
- `ordering/flow:order lifecycle: allocate, run, QA hold, release and ship` — 0 open
- `ordering/flow:stage overlap on a line` — 2 open
- `policy:a line is occupied for the whole run` — 0 open
- `policy:Meridian on time` — 0 open
- `policy:Meridian ships on time, full stop` — 0 open
- `policy:wait for the repair or shift the order to Line 1` — 0 open
- `validation-criterion:stage rates must come from data, not gut-feel` — 0 open
- `validation-criterion:the sheet's end-to-end batch times` — 1 open

## The harness's cue at close

```
The harness folded the model at revision 26a8219a17118558 (plugin sdcpn/2026-08-25.2): 69 node(s) from 267 active capture(s). Complete: no.

Unsatisfied, in file order:
- [unsupported-active-objective] objective:is the mill-to-fill tank on Line 1 slowing the line down depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [unsupported-active-objective] objective:wait or shift when Line 2 goes down depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [unsupported-active-objective] objective:where Line 1 loses its time depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [unsupported-active-objective] objective:which option actually loses less depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [unsupported-active-objective] objective:which option loses less depends on nothing the model contains; an objective that depends on nothing is unsupported.
- [open-conflict] "what it produces or changes" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it.
- [open-conflict] "how long it takes" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it.
- [open-conflict] "how often it occurs, if it is an event rather than a step" on activity:filler jam has competing active captures; an explicit, user-cited resolution must close it.
- [unaddressed] "what is lost when it changes the system's mode" has not been addressed on activity:filler jam.
- [unaddressed] "whether its quantities vary by type" has not been addressed on activity:filler jam.
- [open-conflict] "what it needs before it can start" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it.
- [open-conflict] "what it produces or changes" on activity:run it through mix/mill/tint/fill has competing active captures; an explicit, user-cited resolution must close it.
- … and 34 more.

Patterns whose trigger may apply (discretionary):
- P01 on activity:filler jam: occurrence and duration are two slots. Ask how often, as a range, for each named event separately; then how long, as a spread. Keep the precision the expert actually gave; never round a range up to a spread.
- P02 on activity:filler jam: ask what is lost in the transition, as a range, after a *named* transition. If the expert does not know, ask what they would treat as an authoritative source — never convert "unknown" into a value.
- P08 on activity:filler jam: record both on the same node under `source-regime`, with the expert's account of when they diverge. Do not average them and do not pick one.
- P05 on entity-type:line: ask which wins, what overrides that, how ties break, and for a recent borderline case that shows the practiced rule. Never infer the rule from a schedule or a document.
- P07 on entity-type:line: ask explicitly whether it varies by type. Record "no" as a value; it is load-bearing.
- P04 on policy:who can absorb the slip: replace any time-shaped approximation ("about two days before") with the practiced event or state that makes it runnable, who or what flips it, and where that is observable.

53 node(s) lie outside every objective's dependency slice and are recorded but not demanded.

Completion is computed from the model, never from the conversation; it does not decide whether to continue. Choose the next question, or none.
```
