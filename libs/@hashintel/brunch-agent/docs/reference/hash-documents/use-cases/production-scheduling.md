# One-liner

A supply chain manager at a multi-line plant uses this model to assign a fixed book of product demand across three production lines and rank it within each line, so as to maximise contribution margin net of changeover, scrap and backorder under deterministic or stochastic step durations and equipment failure.

# Problem & context

**What is being modelled.** A fixed demand book of product types, produced on parallel non-identical production lines. Four structural features define the class:

1. **Production lines.** Each line is an ordered sequence of steps with finite inter-step buffers. Several units are in flight simultaneously, so line throughput is set by the slowest step *for the product currently loaded* — and different products can bottleneck on different steps of the same line. This is invisible in the capacity spreadsheets managers work from.
2. **Sequence-dependent changeovers.** Switching a production line between product families costs time, the matrix is asymmetric, and the changeover consumes a shared crew — so changeovers on different lines serialise against each other.
3. **Batching by production run.** Demand for a product type is produced in runs. Run length trades changeover amortisation against due-date responsiveness, and interacts with ramp-up scrap, which is incurred per run rather than per unit.
4. **Resource contention.** Lines, the changeover crew, buffers, materials and shift labour are all finite and interact.

**Assumptions:** 

- Demand is fixed and known at t = 0. Each demand token is *hard-assigned* to exactly one production line.
- A line that becomes idle must immediately start the highest-priority **eligible** token assigned to it, where eligibility is controlled by a per-token release time: an order becomes eligible only after its `wait` has elapsed. Firing therefore stays greedy, while deliberate idling — holding a line for an incoming same-family order rather than paying an expensive changeover — is expressed by the release times the optimiser chooses.

**Who feels the pain:** 

The supply chain manager or master scheduler, on a horizon of days to weeks. The incumbent is a spreadsheet allocation maintained by one experienced person, plus a daily verbal reallocation on the floor. 

**What improves:** 

Line assignment and within-line ordering are currently set by habit and by which line "usually" runs which product. Both are directly optimisable, both have large leverage on changeover hours and on whether the demand book completes on time, and neither is currently measured.

# System sketch

!image.png

**Physical side.** Three lines, each with an ordered step sequence and capacity-bounded buffers between steps. Step durations vary by product type, so both line rate and bottleneck location are product-dependent. Each line carries a changeover state (last family produced) and a maintenance counter. One changeover crew serves all lines. Finished units pass to QA before counting as delivered.

**Cyber side.** ERP supplies the demand book, due dates, margins and product master data. MES supplies run start/stop, actual quantities and downtime reason codes — the calibration source, and reliably complete wherever line-level scanning exists. The historian supplies step-level cycle times, which are what the model actually needs and what nobody currently analyses per product. For reactive use, the MES also supplies the current plant state, consumed directly as an initial marking.

# Why a Petri net?

**What maps natively.** The production line subnet is drawn directly from the step sequence. Buffers are capacity-bounded places, which is what produces blocking (a step finishes but cannot hand off) and starvation (a downstream step idles behind an upstream stoppage). Neither appears in any closed-form line-rate calculation, and both are why real lines miss nameplate. Step durations read off the *product token's own colour*, so one net structure serves every product type and the bottleneck migrates between steps with no structural change. Changeover state lives in the line token; the changeover transition also consumes the shared crew token, so cross-line serialisation of setups falls out for free.

**The framing that matters.** A schedule is a timed firing sequence σ = ⟨(τᵢ, tᵢ, βᵢ)⟩; the start times τᵢ are the firing instants of the `StartRun` transitions and the bindings βᵢ are demand token to production line assignments. Precedence, capacity, changeover and resource constraints are the conditions under which σ is admissible, not side constraints checked afterwards.

**The marking is the plant state.** Reactive rescheduling means loading the current state as a marking and re-running. No reformulation, no separate rescheduling model. Since real plants reschedule constantly, this is worth more than a marginal improvement in solution quality.

**Where the PN does not help.** The net evaluates; it does not generate an optimal plan. An optimisation layer is required, and its design is the engineering content. Constraint programming  Satisfiability (CP-SAT) with interval variables handles the deterministic core of assignment plus sequencing plus setup matrices very well, and remains the honest state of the art there. The PN's complementary advantages are stochastic evaluation, emergent line throughput, state-as-marking rescheduling, and one artefact where CP requires a separate simulation model kept manually in sync.

# Model outline

## Formal problem statement

**Given**

- Product types P. Type p has family f(p) ∈ F, demand Dₚ, due date dₚ, margin mₚ, minimum run qₚᵐⁱⁿ, ramp scrap ρₚ
- Lines L = {1, 2, 3}. Line ℓ has ordered steps Sℓ, buffer capacities κ(ℓ, s), changeover matrix σℓ : F × F → ℝ⁺ (asymmetric), maintenance threshold Θℓ.
- Step duration δ(ℓ, s, p) — the key coupling. Both line rate and bottleneck location follow from it.
- Shared changeover crew, capacity 1.

**Derived line performance** for a run of q units of p on ℓ, with cycle time c = maxₛ δ(ℓ, s, p) and fill time F = Σₛ δ(ℓ, s, p):

```
T(ℓ, p, q) = F(ℓ, p) + (q − 1)·c(ℓ, p)
```

This is the formula in the manager's spreadsheet. It holds only with infinite buffers and no failures, so **the gap between it and the simulated result is the value the model adds**. It also doubles as a validation check: run the net with unbounded buffers and failures disabled, and it must reproduce this exactly.

**Decide** — for each demand token d: a line assignment `line_id(d)` ∈ L, a priority `priority(d)` ∈ [0,1], and a release time `wait(d)` ∈ ℝ⁺; plus run decomposition (how Dₚ splits into runs).

**Selection rule.** When line ℓ becomes idle, it starts the pending token of maximal priority among the *eligible* set `{d : line_id(d) = ℓ, t ≥ wait(d)}`, subject to material availability. Given the wait vector, this fully determines every start time — no separate timing decision exists.

**Maximise** Π, where

```
Π = Σₚ mₚ·delivered(p) − backorder penalty − changeover cost − ramp scrap − overtime
```

with makespan and total changeover minutes as natural secondary axes for a Pareto front.

## Structure of the search space

Because assignment is hard, an idle line cannot pick up work assigned to another line regardless of how starved it is. The outer problem is therefore a **partition of the demand set into three bins with a sequence-dependent setup cost inside each bin** — bin packing wrapped around three sequencing problems. Release times weaken this characterisation somewhat, since deliberate idle time now enters makespan alongside run time and changeovers, but the packing structure still dominates.

Three consequences:

- **Assignment dominates.** The packing decision has far more leverage on the objective than within-line ordering or release timing. Expect most of the optimiser's improvement to come from `line_id`, and consider a load-balancing warm start.
- **Priorities are identified only within a line.** Any monotone transformation preserving within-line order gives an identical schedule, so the space carries |D|-dimensional continuous plateaus. Rank-normalising priorities within each `line_id` group removes the symmetry cheaply and materially helps TPE.
- **Release time and priority are overcomplete.** With unbounded `wait` you can encode any schedule directly by setting each token's release to its intended start, at which point priority only breaks exact ties. That is a second, larger plateau structure layered on the first. Bounding `wait` to the maximum changeover time is the principled fix — waiting longer than the changeover being avoided is dominated on that line — and it keeps `wait` doing the one job it is genuinely needed for.

The one place cross-line priority comparison has meaning is the shared changeover crew, where a global scale is needed to break ties between simultaneous changeover requests.

## Deliberate idling via release times

Greedy firing is retained: a line must start whenever an eligible token is assigned to it. What the optimiser controls is the *eligible set*, through a deterministic release time on each demand token. A `ReleaseDemand` transition with delay `wait(d)` moves the token from `Pending` into `Demand`; until it fires, the line simply has nothing to start.

This buys back the full space of active schedules without complicating the firing semantics, and without sacrificing feasibility-by-construction — every (line_id, priority, wait) vector still yields a valid schedule.

It matters because of asymmetric changeovers. If a line finishes a base-family run and only a tinted-family token is currently eligible, pure greedy firing forces the tinted start and the expensive tinted→base wash is paid later. Holding the line for the base-family order can dominate by a wide margin. Under the earlier non-idling formulation this was a known limitation; here it is exactly what the release times are for.

Keeping release as a *transition* rather than a clock guard on `StartRun` is deliberate: it preserves guard locality, which structural analysis depends on.

## Two Petri net versions

- Deterministic Statically Coloured Timed PN: deterministic step durations at nominal or quantile values. Output: an executable plan with start times.
- Stochastic Statically Coloured Timed PN:  stochastic durations, breakdowns, probabilistic QA outcomes. Output: distributions over completion, margin and backorder.

A Petri Net with an optimisation layer combines the strengths of two approaches: Constraint Programming (CP) and Discrete Event Simulation (DES):

- A pure CP tool can optimise but does not naturally support dynamic simulation.
- A pure DES tool can simulate system behavior but cannot optimise decisions.

This approach enables both **simulation** and **optimisation** within a single framework.

## Places

**Shared:** `Pending` (all orders at t = 0), `Demand` (eligible orders only, initially empty), `Materials`, `Crew` (capacity 1), `QAHold`, `Delivered`, `RampScrap`, `Backorder`.

**Per line ℓ:** `Idle_ℓ` (line token), `In_ℓ`, `Step1_ℓ`, `Buffer_ℓ` (capacity κ), `Step2_ℓ`, `Step3_ℓ`, `Out_ℓ`, `Down_ℓ`.

## Transitions

| Transition               | Kind                                         | Notes                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReleaseDemand`          | Timed, deterministic                         | `Pending → Demand`, delay `d.wait`. The mechanism for deliberate idling                                                                                                                                     |
| `StartRun_ℓ`             | Immediate, **conflict-resolved by priority** | The decision point. Guard is local: `line_id = ℓ` ∧ line idle ∧ material available ∧ family matches line state. Consumes the demand and line tokens; emits q unit tokens into `In_ℓ`; sets `remaining := q` |
| `Changeover_ℓ`           | Timed, guarded on family mismatch            | Delay σℓ(last, new); seizes `Crew`, which serialises setups across lines; updates line-token family; emits ramp scrap                                                                                       |
| `Enter_s,ℓ` / `Exit_s,ℓ` | Timed                                        | Delay δ(ℓ, s, p) read from the unit token's colour. Buffer capacity guards produce blocking and starvation                                                                                                  |
| `Fail_ℓ` / `Repair_ℓ`    | Stochastic (evaluation mode)                 | On the bottleneck step; preemption semantics required                                                                                                                                                       |
| `FinishRun_ℓ`            | Immediate                                    | Fires when `remaining = 0`; returns the line token to `Idle_ℓ`; releases product to `QAHold`                                                                                                                |
| `Maintenance_ℓ`          | Timed, guarded on `units_since_maint ≥ Θℓ`   | The manager's lever is whether to co-locate it with a changeover already being paid for                                                                                                                     |
| `Release`                | Timed                                        | Finite QA capacity                                                                                                                                                                                          |

## Colours

- **Demand token:** ⟨`type`, `family`, `qty`, `due`, `margin`, **`line_id`**, **`priority`**, **`wait`**⟩
- **Line token:** ⟨`line_id`, `last_family`, `units_since_maint`, `remaining`⟩
- **Unit token:** ⟨`type`, `run_id`, `entered_step_at`⟩

# Questions the model answers

| Question                                                                                   | Task type                                  | Output                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| How should we split the demand book across the three lines, and in what order within each? | Combinatorial assignment + sequencing      | `line_id`, `priority` and `wait` per demand token; executable plan with start times |
| Is it worth holding a line idle to avoid an expensive changeover?                          | Release-time optimisation                  | Idle minutes deliberately taken vs. changeover hours avoided; net margin effect     |
| What throughput will each line actually achieve for this product mix?                      | Simulation vs. closed form                 | Simulated rate vs. F + (q−1)c; the gap attributed to blocking, starvation, downtime |
| Which step is the bottleneck — and does it move by product?                                | Bottleneck identification                  | Per-step utilisation and blocking/starvation split, by product type                 |
| How much capacity are we losing to changeovers, and how much does reordering recover?      | Sequencing with asymmetric setups          | Changeover hours by family pair; hours recovered under optimised ordering           |
| Where should we add buffer, and how much?                                                  | Constraint sensitivity                     | Throughput vs. buffer capacity curve per position                                   |
| How robust is this plan to breakdowns?                                                     | Stochastic evaluation of a fixed plan      | Distribution of completion; P(backorder) per product                                |
| A line goes down at 06:00 — what now?                                                      | Reactive rescheduling from current marking | Repaired assignment; products newly at risk                                         |
| Is the demand book feasible at all this period?                                            | Feasibility / capacity check               | Feasible plan, or the binding constraint identified                                 |
| Which fitted parameters most affect the recommendation?                                    | Global sensitivity analysis                | Sobol indices; guides measurement priorities                                        |

# Data requirements for real-world application

1. **Step durations δ(ℓ, s, p)** — historian, at step level, by product. This is the input that makes the model different from a spreadsheet, and it is the one most often *available but never analysed per product*. Check early whether bottlenecks genuinely move between steps by type; if they don't, the intra-line pipeline collapses to one rate per product and the second modelling level stops earning its keep.
2. **Changeover matrix σℓ(f, f′)** — reconstructable from timestamp gaps between consecutive runs, but the family taxonomy has to be built with process engineers. Expect asymmetry to be real and undocumented.
3. **Buffer capacities and line topology** — master data or a walk down the line.
4. **Breakdown and repair distributions** — CMMS or historian downtime records; quality varies.
5. **Ramp scrap by changeover severity** — quality records; often aggregated in a way that loses the per-run structure.
6. **Material lead times** — needed to keep supply-driven delay out of the `wait` field. See Model limitations.
7. **Demand book, due dates, margins, backorder penalties** — ERP for the first three. **Penalty weights are almost never written down** and must be elicited from commercial; the entire objective pivots on them.

**Plausibility.** Items 1–4 are available wherever line-level MES and a historian exist. The gaps requiring elicitation are the family taxonomy, ramp scrap structure and penalty weights. Scope pilots so that elicitation happens in week one.

# Commercial angle

**Buyer vs. user.** The **user** is the supply chain manager or master scheduler. The **buyer** is the operations or plant director, measured on service level, line utilisation and conversion cost. Quality holds a veto wherever changeover protocols are contamination- or allergen-driven, so lead with better *ordering* and fewer full changeovers, never with running closer to the limits.

**Value.** In descending reliability: recovered capacity on the constraining line from changeover sequencing, which is capex-free and verifiable from historical data *before the model is built* — an excellent pre-sales artefact. Then better load balancing across lines, which is pure allocation and costs nothing to change. Then reduced ramp scrap through longer, better-placed runs. Then reduced dependence on the one person who knows how to build the allocation.

**Alternatives.** Spreadsheet plus an experienced scheduler is the real incumbent — free, trusted, and unable to see that a line's bottleneck step moves with the product. APS modules assume product-independent line rates and symmetric setups. In-house CP-SAT is the most credible competitor and should be co-opted architecturally rather than opposed: CP proposes assignments on a deterministic abstraction, the SDCPN evaluates them stochastically, the optimiser iterates.

**Commercial value 4/5** — quantifiable capex-free benefit across a broad base, discounted for a strong free incumbent in CP and conservative buyers.

# Model limitations

**Scale.** Exhaustive reachability is out — the marking includes real-valued timestamps. The decision vector is 3|D| (|D| is number of demand tokens), which is still modest, but a 200-order book (|D|=200) puts the optimiser past its comfortable range. A RL approach such as the one described here (code repo) might scale much better.

**Do not let `wait` absorb material lead time.** If a token's start is delayed because the supplier has not delivered, that is *data* and belongs in the `Materials` guard. If it is delayed because holding the line is worth it, that is a *decision* and belongs in `wait`. Both fit the same field and the mechanism is identical, so conflating them is easy — and it would make the optimiser appear to be choosing something it is not. Keep them separate in the model and in the reporting.

**Unbounded release times make the encoding overcomplete.** See *Structure of the search space*. Bound `wait` to the maximum changeover time; the bound is principled rather than arbitrary. Consider also encoding `wait` as a boolean gate plus a magnitude so that most tokens sit at zero, which keeps the search focused on the assignment decision where the leverage actually is.

**Release times are open-loop.** A `wait` vector fixed at t = 0 cannot react to a breakdown at t = 6h. For a generated plan that is fine. For reactive use, the closed-loop equivalent is a null "wait" choice offered at each idle event, decided on current state — a different and larger design.

**Validation.** The bar is reproducing a historical period's actual line rates, changeover hours and downtime from the recorded allocation. Only then do counterfactual allocations mean anything. Expect unwritten constraints to surface — products that "always" run on line 2, customer-specific line qualifications.

**Realism 4/5.** The structure is well-attested and the data mostly exists. Held below 5 by unproven validation and by the fact that hard line assignment is a simplification the target plant may not actually obey.

# **Petrinaut feature requests**

- **[partial] Subnet templating / replication**. Three structurally identical line subnets should be one definition instantiated three times, not three hand-built copies that drift apart.
- **Priority-based conflict resolution.** The selection rule is the entire decision layer here and currently has to be encoded ad hoc. Highest-value gap by a distance.
- **Firing-instant extraction.** The plan is the timestamped firing sequence; the runtime should emit it as a Gantt artefact, not just a final marking.
- **Mixed-type decision variables in `OptimisationSpec`** . Three variable types per demand token (categorical `line_id`, continuous `priority`, bounded continuous `wait`), plus Pareto results in the streaming API.
- **Common random numbers across trials,** so candidate allocations are compared on the same realisations rather than seed noise.
- **Learning production line allocation policy.** We need to learn either a general transition kernel that allocates demand/order tokens to production lines based on some heuristic or learn the transition firing sequence of transitions that allocate demand tokens to production lines. In both cases, petrinaut should be able to support “controllable” transitions that fire when told. Some Claude-generated reqs for support such transitions are found below

Requirements for controllable transitions in Petrinaut

- **Marking injection** from external state (data feed), for reactive rescheduling.
- **Structural analysis surfaced** — P-invariants confirming unit conservation through the line subnets catch modelling errors automatically; siphon analysis on the resource subnet establishes deadlock-freedom. No DES competitor can do either.

# Pros / Cons rationale

**Pros.**

- *Line throughput emerges rather than being assumed.* The closed form F + (q−1)c is what the manager has today; the simulated gap against it is the product.
- *Release times recover the full active-schedule space* without complicating firing semantics or sacrificing feasibility-by-construction. Every decision vector still yields a valid schedule.
- *One artefact, both modes* — nominal generation and stochastic evaluation from the same structure. Neither CP tools nor DES tools offer the pairing.
- *The marking is the plant state*, so rescheduling is a re-run. Most scheduling tools die at rescheduling, not at first solve.
- *Small, box-constrained decision vector* — 3|D| mixed-type variables that Optuna handles directly.
- *Structural verification* — unit-conservation invariants and deadlock analysis are formal guarantees from the net structure alone.
- *Sector-transferable* — the subnet is a template; instantiation supplies product types, a changeover matrix and fitted durations.

**Cons.**

- *High-dimensional sparse decision space.* 3|D| decision vector scales with the number of demand tokens. This makes optimisation very challenging for any application with a semi-realistic scale |D|. We need to efficiently explore the structure of `line_id`,`priority`,`wait`  in the optimisation as these are largely correlated.
- *Release time and priority overlap.* Unbounded, `wait` can express any schedule on its own, leaving priority to break ties and creating large plateaus. Requires bounding and preferably sparsity encouragement.
- *CP-SAT as an alternative is free, excellent and improving*, and might suffice for the purposes of a commercial application.
- *Elicitation-heavy inputs* — family taxonomy, ramp scrap structure and penalty weights are the three things nobody has written down, and all three are load-bearing.

# Open questions

- [ ]  Should `wait` be sparse (boolean gate plus magnitude, most tokens at zero) or free within its bound? Sparse keeps search pressure on the assignment decision; free is simpler to implement. Measure the gap on one instance.
- [ ]  Is the open-loop plan sufficient, or does reactive use require a closed-loop null choice evaluated at each idle event? These are materially different builds and the answer determines the product shape.
- [ ]  Do bottlenecks genuinely migrate between steps by product type? Cheap to check from historian data, and it determines whether the intra-line pipeline earns its place.
- [ ]  Priority-based conflict resolution: what is the right syntax, and does it belong in the net or in a separate policy object attached to it? Language-design question, worth getting right once.
- [ ]  Common random numbers: how much does it reduce required replications? Quick experiment against the existing supply chain demo model before committing to the larger build.
- [ ]  Preemption on breakdown — resumable, restartable or scrap? Probably a per-step attribute rather than a global choice.
- [ ]  Can we build a pre-sales artefact that estimates recoverable changeover hours from a plant's historical run sequence alone, before any model is built? Looks like the cheapest way to open a conversation.

# References

**Scheduling**

- Pinedo, M. *Scheduling: Theory, Algorithms, and Systems.* Springer. — Parallel machine scheduling, dispatch rules, weighted tardiness.
- Allahverdi, A. "The third comprehensive survey on scheduling problems with setup times/costs." *EJOR*, 2015.
- Kolisch, R. & Hartmann, S. "Experimental investigation of heuristic solution procedures for the RCPSP." — Priority-rule encodings and schedule generation schemes.
- Harjunkoski, I. et al. "Scope for industrial applications of production scheduling models and solution methods." *CACE*, 2014. — Why academic scheduling models rarely reach plants.
- Méndez, C. A. et al. "State-of-the-art review of optimization methods for short-term scheduling of batch processes." *CACE*, 2006.

**Flow lines and buffers**

- Hopp, W. & Spearman, M. *Factory Physics.* — Line rate, blocking, starvation, the WIP/throughput/cycle-time relationships the net must reproduce as a sanity check.
- Li, J. & Meerkov, S. M. *Production Systems Engineering.* Springer, 2009. — Buffer allocation and bottleneck identification in serial lines.

**Petri nets**

- Lee, D. Y. & DiCesare, F. "Scheduling flexible manufacturing systems using Petri nets and heuristic search." *IEEE T-RA*, 1994.
- Zhou, M. & Venkatesh, K. *Modeling, Simulation and Control of Flexible Manufacturing Systems: A Petri Net Approach.* World Scientific, 1999.
- van der Aalst, W. M. P. "Interval timed coloured Petri nets and their analysis." 1993. — Timed CPN semantics.
- Jensen, K. & Kristensen, L. M. *Coloured Petri Nets.* Springer, 2009.
- Everdij, M. H. C. & Blom, H. A. P. — DCPN/SDCPN and the PDMP correspondence; the foundation for evaluation mode.

**Method**

- Laborie, P. et al. "IBM ILOG CP Optimizer for scheduling." *Constraints*, 2018. — The incumbent to benchmark against.
- Akiba, T. et al. "Optuna: A Next-generation Hyperparameter Optimization Framework." KDD 2019.
- Deb, K. et al. "NSGA-II." *IEEE TEC*, 2002.
