# Safeguarded AI – ‘Final Exam’

**End-of-programme demonstration for Safeguarded AI: Cyberphysical – Draft Notes**

*\~Nora*

# Why a final exam

As we enter the last phase of the programme, I want to decide on a small set of demonstrations (‘exams’) against which the capabilities will be tested by programme end. What motivates this: 

1. **A Schelling point.** One concrete target focuses attention across teams, and helps answer design questions and make informed trade-offs.  
2. **Capabilities we can't demonstrate are not enough.** If we build genuine breakthrough capabilities, but we don’t demonstrate it, we haven’t succeeded: the tools won't get used, they won't shift the discourse on what's possible, and we fail to position Creator teams for follow up funding or commercial engagements to carry the work forward. As we push into the unexplored frontier, there are no existing benchmarks we can test our tools against; we have to create them ourselves.

In true ARIA manner, our final exam should be more ambitious than what we're confident we can achieve, while being structured in such a way that capabilities are demonstrated in degrees, not as a pass/fail.

*We are separately aiming for demonstrations in cyber/secure code, but here we focus exclusively on TA2b – Cyberphysical.* 

# What are we evaluating / demonstrating

**The Safeguarded AI pipeline:** 

| domain context (docs, data, logs, experts) *(natural language)*  |  →  |  model ℳ \+ spec φ |  |  → | policy π , certificate C  |
| :---: | :---: | :---: | :---: | :---: | :---: |
| *Phase A* |  |  | *Phase B* |  |  |

* **Phase A — modelling.** Have a problem brief and raw artifacts (process docs, event logs, synthetic ERP data); produce a formal model (SDCPN) and specifications.   
  * *Squarely the concern of TA1.3 and TA1.1, with some overlap with efforts in TA1.0.*   
* **Phase B — certification.** Have a formal model and spec; produce a policy and a machine-checkable certificate.   
  * *Squarely the concern of TA1.2 and TA1.1, with some overlap with efforts in TA1.0.* 


Our modelling formalism of choice for cyberphysical is **SDCPNs**, due to them being equivalent in expressivity to General Stochastic Hybrid Systems (GSHS). 

# Supply Chain Problem Curriculum Design

Our domain of choice for the final exam is Supply Chains.

*(This will be the central, but not necessarily only demonstration domain for SgAI Cyberphysical; for now I’m looking to focus the discussion on this.)* 

**Why Supply Chains?** 

* They allow us to demonstrate (and vary gradually) the full range of semantic expressivity (up to fully fledged SDCPNs) and size which we’d like to claim.   
* They are economically and societally important.   
* We have established access to domain experts/end users through HASH. 

**Why a Problem Curriculum?** 

* Instances in the problem curriculum span from simple to complex across complexity dimensions (see Section 2.). They thus let us evaluate the *degree* to which we have been able to push the reach of our toolsuite, rather than providing only a binary assessment.   
* The semifab testbeds serve as loose inspiration for the curriculum design (MiniFab → MIMAC → SMT2020/SMAT2022).   
  * Though note that semifab testbeds are simulators plus KPI definitions; a declarative model must be lifted out of the code. Coverage wise, the semifab testbeds are only discrete-event models, but pushed to very large size. 

What does the problem curriculum/exam look like, schematically? The curriculum consists of instances representing end-to-end runs of the Safeguarded AI pipeline. Each instance is generated according to the schema described in the following Section. 

1. ## Curriculum instance (dataset) schema

The curriculum specifies the different types of data associated with each instance and phase. The blueprint defining the structure of each instance is the **instance schema**, which is split into two parts: one for Phase A outputs and one for Phase B outputs. 

### Phase A inputs

| Component | What it is | What it's for | Current form |
| :---- | :---- | :---- | :---- |
| Domain Context | Natural language and data artifacts about the problem domain (docs, event logs, synthetic ERP data, expert input).  | Basis on which formal model and specs are elicited and synthesised |  |

### Phase A outputs

| Component | What it is | What it's for | Current form |
| :---- | :---- | :---- | :---- |
| Domain Context | Natural language and data artifacts about the problem domain (docs, event logs, synthetic ERP data, expert input).  | Basis on which formal model and specs are elicited and synthesised |  |
| Model ℳ  | A formal/declarative Petri net model of the domain (e.g. SDCPNs) consisting of its structure (places, transitions, and the arcs between them) and its features (e.g. stochasticity, colouredness etc.).  | Defines the domain / problem for which a policy is found and certified |  |
| KPIs 𝒦 | Performance metrics, e.g P(stockout ≤ T), waste/expiry rate, holding+backlog cost, cold-chain excursion probability, recovery time after disruption. | Metrics against which the policy is evaluated |  |
| Specification **φ** (decision problem, constraint) | Close-ended (YES-or-NO) question over KPIs. This is a decision problem and can be interpreted as a constraint. A constraint is satisfied if a decision problem admits a YES answer and is violated otherwise. Format: {KPI, relational operator, threshold, time frame}, Examples: P(stockout ≤ T) ≤ δ in 99% of simulation time, same for service level, quality-on-delivery etc. | Defines the safety specifications against which the policy is certified |  |
| Baseline policies **π₀** (Ground truth) | Standard, specified policies from practice (where available). | Benchmarking other policies in Phase B |  |

### Phase B inputs

Every output of Phase A is also input in Phase B. Additionally:

| Component | What it is | What it's for | Current form |
| :---- | :---- | :---- | :---- |
| Model verification tool **𝒯** – specifically a model checker | Exact model checking (small); pre-registered statistical estimates (large) (where available) | Checks whether a certificate is valid for a specification or not conditioned on a policy – equivalent to whether a specification is certified or not. |  |

### Phase B outputs

| Component | What it is | What it's for | Current form |
| :---- | :---- | :---- | :---- |
| Policy **π** | A set of rules governing which Petri Net transitions are permitted at any time. This is an umbrella term for artifacts resolving  non-determinism. | Resolves Petri Net execution (runs) |  |
| Certificate **C** | Verifiable evidence that a given specification is *universally* satisfied (for all PN runs) conditioned on a choice of policy **π**. | Guarantees a specification \-conditioned on a policy- is satisfied |  |
| False certificate **C̄** (Mutant) | A corrupted (false) certificate is a purported certificate that claims a specification is satisfied when, in fact, it is not. Corrupted certificates that the model verification tools  must refuse.  | Ensures the model verification tools reject it as a certificate  |  |

Each instance varies by complexity dimension (see Section 2.), so grading reports complexity scaling curves rather than single points.

**Simulations** may appear as secondary artifact, with four potential purposes: generating the raw artifacts in context briefs; as source material from which declarative reference models are built; as pre-registered ground-truth estimator on instances too large for exact checking; and as the uncertified baseline that certified results are measured against.

2. ## Curriculum complexity dimensions 

Our curriculum, going from ‘simple’ to ‘complex’, has several dimensions each associated with an instance schema component: 

| Instance component | Complexity dimension | Ladder steps*(arrows indicate direction of increasing difficulty)* | Semantic expressivity dependence |
| :---- | :---- | :---- | :---- |
| Model ℳ | **Semantic expressivity** | **L0** (PN) → **L4** (SDC-PN) | *N/A* |
|  | **Node size**  (transition \+ place count)  x  **Time horizon** | **Small**: 1–3 products, 2–3 echelons, one node per echelon, time horizon of weeks. *(MiniFab-scale.)* → **Medium**: \~10–50 SKUs, 3–5 echelons with parallel nodes, shared resources and batching, time horizon of months. *(MIMAC-scale.)* → **Large**: Hundreds of SKUs, multi-region networks of tens of nodes, dynamic order/shipment fleets, time horizon of quarters. *(SMT2020-scale.)*  |  |
|  | **Marking graph size** (token count)  x **State space size** (size of space of token values/colouring) | **Finite** (finite token count, uncoloured tokens ) → **Countably infinite** (arbitrary token count, finitely coloured tokens) → **Continuous** (finite token count, dynamically coloured tokens) → **Variadic** (arbitrary token count, dynamically coloured tokens) (parameterised model checking)  | *Finite:* L0 \- L1c *Countably infinite:* L2a \- L2b *Continuous:* L3-L4 *Variadic:* L3-L4 |
|  | **Modularity / hierarchy** | **Monolithic** → **Compositional** (finite number of models joined together) → **Parameterised** (unbounded number of models) |  |
|  | **Determinism** | **Determinism** → **Non-determinism** |  |
|  | **Composition width** (models are joined along a fixed boundary of size k) | **k Small** → **k Large** | *Deterministic PNs (L0):*  this boundary will be a spatial glueing,*Stochastic PNs (L1-L4):* we will need assume-guarantee contracts whose size also depends on composition width |
|  | **Stochastic process** | **Ito process** (drift diffusion) →  **Feller process** →  **Continuous Markov Process** → **Continuous Stochastic Process**  | L4: By default we assume the SDE is a continuous Markov process |
| Specification **φ**  | **Verification objective** | **Safety** →  **Termination** → **Stability** →  **Quantitative Reach-Avoid Reactivity** (good infinitely often) |  |

In the Sections that follow, we elaborate on the ladder levels (steps) of semantic expressivity and hierarchy / modularity. 

1. ### Semantic expressivity levels

Semantic expressivity characterises the type of Petri net model ℳ, as determined by its treatment of: 

1. *Time* *(global clock):* discrete or continuous.  
2. *Arc type:* normal, read and inhibitor arcs.  
3. *Token colouredness*: uncoloured, statically coloured or dynamically coloured.  
4. *Transition delay distribution*: transition delay are samples from the Dirac distribution (deterministic delays), the exponential distribution or more general distributions (e.g. lognormal).  
5. *Transition kernel stochasticity*: transition-produced token counts and their colouring are either deterministically generated or randomly sampled.  
6. *Place dynamics:* no dynamics, ODE-governed or SDE-governed dynamics.

Full SDCPNs represent the North Star. For the ladder to degrade well, ideally: 

1. **Each step is a conservative extension of the former step.** Every level-k model is also a level-(k+1) model, so the levels strictly nest and capability is monotone up the ladder.  
2. **Each step crosses exactly one verification-technology boundary.** The feature added at each level is chosen because it breaks the certification methods that suffice at the level below.

*A preliminary sketch:*

| Level | Acronym | Formalism | Feature added | Supply-chain phenomenon (guesses) | Supply-chain specification (guesses) | Verification technology exercised |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| *L0* | PN | *Monolithic, Uncoloured, deterministic, untimed **PN** with only normal arcs* | *N/A* | *flow topology, routing, resource contention* |  | *structural analysis; coverability; sound reachability* |
| L1a | ST-PN | Uncoloured, **S**tochastic-**T**ransition, discrete-time **PN** with exponential delays (generates a DTMC) | Stochastic transition firings (randomly sampled transition delays), discrete global clock (time) | Environment.  |  | *Compositional / Modular probabilistic model checking (Prism/storm encodings).  Composition of Supermartingale certificates for LTL.* |
| L1b | ST-PN | Uncoloured, **S**tochastic-**T**ransition, continuous-time **PN** with exponential delays (generates a CTMC) | Continuous global clock (time) | Poisson order arrivals, machine & transport failures |  | exact/numerical probabilistic model checking; transient & steady-state analysis |
| L1c | ST-PN | Uncoloured, **S**tochastic-**T**ransition, continuous-time **PN** with general delay distributions (generates a GSMP, fixed dimension) | Transition delay distributions are arbitrary. | realistic (lognormal, Dirac) lead times, periodic review cycles, shelf-life clocks |  | Neural supermartingales |
| L2a | SC-PN | **S**tatically **C**oloured, **S**tochastic-**T**ransition, continuous-time **PN** (generates a GSMP over structured state) | Token colouring, transition guards & rates operate on discretely-coloured tokens (semantically enabled transitions), transition kernels probabilistically produce coloured tokens (both their colouring and count) | SKUs / product types, batching, age-class perishability, customer classes |  | neural supermartingales with plate notation (symmetry- and colour-exploiting model checking); statistical model checking |
| L2b | SC-PN | **S**tatically **C**oloured, **S**tochastic-**T**ransition, continuous-time **PN** with any arc type (generates a GSMP over structured state)  | Inhibitor, read arcs |  |  |  |
| L3 | DC-PN | ODE-evolving**C**olour **D**ynamics, **S**tochastic-**T**ransition, continuous-time **PN** (generates a PDMP with infinitely many discrete modes) | Continuous colouring, transition guards, rates & kernels behave as in L2 but on continuously-coloured tokens, deterministic place dynamics ( continuous ODE flows), boundary-hit (forced) jumps | cold-chain temperature, continuous degradation, tank & production levels |  | certificates over ℝⁿ — barrier / Lyapunov-style, certified abstractions; certified Morse graph |
| L4 | SDC-PN | **S**DE-evolving **C**olour **D**ynamics, **S**tochastic-**T**ransition, continuous-time **PN**  (generates a GSHS, variable dimension) | SDE is a Markov Process, Stochastic place dynamics (continuous SDE flows using Brownian motion and a colour-dependent diffusion coefficient) | dynamic fleets of orders/shipments, SKU churn, network reconfiguration, disruption cascades |  | neural supermartingales with or without plate notation (need to be once continuously differentiable and their additional certification conditions) |

### B. Modularity / hierarchy levels

Modularly structured PNs are Petri net models **ℳ** that are either:

* ***Monolithic***: PNs that cannot be non-decomposed further – these represent the lowest level of the hierarchy –,   
* ***Compositional***: PNs that can be decomposed into finitely many connected modules (either monolithic PNs or other compositional PNs), thereby introducing multiple but finitely many levels of abstraction, and  
* ***Parameterised***: compositional PNs that allow for an infinite number of nested PNs. 

This modular structure allows a complex PN to be represented in terms of simpler, interconnected components, with compositionality providing the mechanism through which these components are combined to form the overall PN. Although managing this modular structure requires additional theoretical developments, the hierarchy should ultimately enable more efficient model checking, rather than introduce additional computational burden.

1. ## Curriculum real-world validation

We want to be confident that the curriculum captures real-world problems of great socio-economic import. The curriculum is therefore validated through external domain experts/end users for real-world relevance, in a structured, legible and citable form.

2. ## Curriculum grading (evaluating) dimensions

Overall, in evaluating programme capabilities, we ask, for each level of the curriculum attempted (expressivity level × size), what is the strongest assurance class achieved, and at what costs. 

| Grading/Evaluation Dimension | What is it |
| :---- | :---- |
| Curriculum Coverage | Which levels of curriculum complexity was reached |
| Assurance strength | Uncertified estimate → anytime-valid statistical bound → certified abstraction → exact result |
| Cost | Formal model synthesis from domain context computation time (Phase A), human model review time, user experience scores (Phase A), model verification tool computation time (Phase B). |

**Phase A** capabilities seek to produce formal models ℳ, KPIs 𝒦 and their associated specifications **φ**. They are  graded against:

- a withheld reference model (where available), and/or   
- an expert review judging the quality of the elicited model and specifications, and/or   
- human review time spent and user experience (compared to incumbent tooling).  
- cost (formal model synthesis computation time)

**Phase B** capabilities seek to produce policy **π** \+certificate **C** pairs as well as model verification tools 𝒯 and their artefacts, which can be machine-graded for: 

- certificate validity (including refusing every false certificate)),   
- verification tool’s bound tightness (vs. baseline policies, incumbent or empirical estimates),   
- policy performance (measured in KPIs and compared against baseline policies derived from domain context), and   
- cost (verification tool computation time, human review time).

Notably, all capabilities (and the grading) need to be **reproducible** by an external examiner without trusting the solvers.

# Building the curriculum

## Who

I’m imagining **HASH** to lead on curriculum development. Building the curriculum is a meaningful (if time bound) piece of work and will come at the expense of other scope. 

HASH can draw on support, such as from **Coherence**, especially on mathematics and synthesis capabilities needed for the construction of the curriculum; as well as **other TA Creators**, as useful.

We should explore whether, in collaboration with the **Birmingham/AstraZeneca** team, we can create certain problems that involve biopharmaceutical manufacturing or degradation processes.

I also encourage engagement with **Zeroth** on Phase B-facing design choices; and **Topos** and **Ink & Switch** on Phase A.

## Synthesis of Models M

At some point, formal models become larger and more complex than can be meaningfully authored by hand. From there, the TA1.3 **agentic elicitation tooling** is needed to generate the curriculum problems themselves: agents propose a modular, declarative model from the domain context (domain experts, data, logs, reference materials); humans review and validate. The curriculum development thus becomes the testing ground for the TA1.3 tooling needed in Phase A.

In the longer term (likely beyond the horizon of curriculum development), further mechanisms become relevant:

1. **A validated (imprecise) model/hypothesis comparison procedure, where agents compete to best explain the data.** The trust anchor moves from the generation process into the selection processes: competing agents propose candidate models, a pre-validated procedure grades how well each explains the data (across imprecise and nondeterministic hypotheses), and adversarial review agents grade proposals against multi-objective rubrics and human validation.  
2. **Trust-webs of reusable signed component models (‘ModelLib’).** Model authoring becomes compositional across organisations: a principal imports component models from libraries signed by principals they trust, so large models are assembled from independently validated, reusable parts rather than built from scratch.

## Timeline 

Fixing the final exam as soon as possible is useful because it helps create clarity and shared north star across programme efforts. However, building the curriculum is a substantial effort. 

I currently envision something like the following timeline:

1. **\~Sep 15: Fix the framework/schema.**   
   1. Define the instance schema, the grading dimensions, and provide a few worked examples. The goal is that every team knows the exam's type signature.  
2. **\~Oct 15: Finish building V1.**   
   1. Have small size problems across the full semantic range, and medium size problems across the lower half of the semantic range. (indicative)  
3. **\~Feb 15: Finish building V2.**   
   1. Full matrix populated; domain-expert validation complete.

Freezing the schema by September already buys a lot in terms of clarity and focus across the Creator cohort. Creating especially large instances of models may require the development of more synthesis capabilities first, and is thus deferred to several months later. 

# Assorted comments

* **Independence.** We are building the exam, as well as the capabilities the exam seeks to grade. Mitigation: the curriculum and the baseline (incumbent tooling and performance)  are validated by external domain experts, in a legible and citable form, and logged before the (final) solving attempts begin. Several aspects of the evaluation design and execution need further refinement, and will involve external expert review/validation.   
* \<...\>

# (Touching on briefly) Building the capabilities the curriculum tests

Once the high-level design scheme for the exam is clarified, it may be worth reconsidering what team / coordination structures are most conducive to success. A few quick, preliminary thoughts: 

1. **Phase A taskforce** — brief and data to formal model and spec, plus the human ability to validate both.   
   1. Mainly TA1.3 teams, led by HASH; Topos and Ink & Switch core, and others TA1.0 teams as relevant (Cyrus/Andrew, etc.) (?)  
2. **Phase B taskforce** — model and spec to policy and certificate.   
   1. Zeroth, DJM+team and Coherence on theory, Zeroth on synthesis infrastructure.   
      1. Who (if anyone) to lead? Who to cover policy-training / ML capacity?  
3. **“Phase C” – SgAI Stack Integration.** Coln ↔ GAOIS ↔ {Tooling}, and Coln ↔ Zeroth Infra/Lean.   
   1. Coln \+ Ink\&Switch responsible for Coln:GAOIS integration (e.g. Coln to replace Automerge).  
   2. Ink\&Switch responsible for GAOIS maturity/stability, and for meeting all demands from ‘Tooling’ (HASH, Topos)   
   3. Coln \+ Zeroth responsible for Coln:Zeroth integration. 

I encourage something like an ‘open-problems’ list via which **other TA1 Creators** can be ‘recruited’ to the task.

# Appendix

# Nomenclature

**Nets (syntax):**

* **PN** — ‘Vanilla’ Petri net. Places, transitions, tokens; transitions fire by consuming/producing tokens. Transition kernels handle token production. This is the base model on top of which every other Petri net is built.  
* **SPN** — Stochastic Petri net. PN with random firing delays.  
* **CPN** — Coloured Petri net. Tokens carry discrete data ("colours"); guards and routing can read it. *(In the table: "coloured, timed stochastic PN".)*  
* **DCPN** — Dynamically Coloured Petri net. Colours are continuous and evolve by ODEs between firings; guards, rates and jumps can depend on them.  
* **SDCPN** — Stochastically and Dynamically Coloured Petri net. As DCPN, but colours evolve by SDEs (adds diffusion).

**Processes (semantics):**

* **CTMC** — Continuous-Time Markov Chain. Memoryless jump process; exponential holding times.  
* **GSMP** — Generalised Semi-Markov Process. Multiple concurrent clocks with general distributions; the future depends on clock ages, not just the discrete state.  
* **PDMP** — Piecewise-Deterministic (Markov) Process. Deterministic ODE flow punctuated by random and boundary-forced jumps; no diffusion.  
* **GSHS** — General Stochastic Hybrid System. Hybrid discrete \+ continuous state, SDE flows, random and forced jumps; the maximal class, and SDCPN's equivalent.

**Dynamics:**

* **ODE** — Ordinary Differential Equation. Deterministic continuous dynamics (drift only).  
* **SDE** — Stochastic Differential Equation. Drift plus Brownian diffusion.

**Transitions:**

- **Enablement time** – time it takes for a disabled transition to become enabled.  
- **Delay** – time it takes for a transition to fire from the moment it becomes enabled: a sample from the transition firing measure.  
- **Firing rate** – parameter associated with transition firing measure.  
- **Firing time** – time it takes for transition to become enabled and fire: equal to delay \+ enablement time.

**Colouring and token types:**

* **Token type** – a unique collection of token attributes (fields, properties) in coloured PNs.  
* **Colouring space** – space where all the token tuples (token attributes) of a given type lie.   
* **Discrete colouring** – Colouring space is a subset of the finite-dimensional integer lattice. Categorical token attributes are encoded (one-hot, ordinal etc.) to lie in this colouring space.  
* **Continuous colouring** – Colouring space is a subset of the n-dimensional real space (n is arbitrary).

**Model verification:**

- **Model checker \[1\] –** given a formal specification φ of “correctness” (desired behaviour) a model checker answers the question of whether the PN model ℳ satisfies the specification with mathematical certainty, for every possible run of the PN model. It is one model verification method. If specifications are constraints, then a model checker checks whether these constraints are always satisfied or not for every PN run**.**  
- **Witness w –** *One* example of a Petri Net run that provides verifiable evidence that a given specification is satisfied for a given choice of policy. It is a weaker form of certificate because it is *existential* and not *universal*.

## SemiFab Testbed

| Name | Machines | Products | Steps | Features |
| :---- | :---- | :---- | :---- | :---- |
| [MiniFab](https://aar.faculty.asu.edu/research/intel/papers/fabspec.html) (Kempf/Intel, 1994\) | 5 | 3 | 6 | With re-entrant flow, batching, setups |
| Harris fab (Kayton et al., 1997\) | 12 | 3 | 22 |  |
| MIMAC (SEMATECH, 1995; 6 datasets) | ≤260 | ≤21 | ≤280 |  |
| SEMATECH 300mm (Kiba et al., 2009\) | 275 | 1 | 364 | Adds automated material handling |
| [SMT2020](https://ieeexplore.ieee.org/document/9115710/) (Kopp et al., 2020\)	 | ≤1314 | 10 | ≤632 | Adds high/low volume/mix conditions |
| [SMAT2022](https://github.com/kwoo-lee/SMAT2022) (Lee et al., 2022\) | ≤1314 | 10 | ≤632 | Adds Automated Material Handling System (AMHS) |

## Speculative: The Field Exam

As a second potential ‘exam’ – designed less  to test the frontiers of SgAI capabilities, but to compellingly demonstrate real-world applicability – we could explore something along the lines of the following scheme:

In \~Summer 2027, send a small ‘forward-deployed’ Safeguarded AI contingent to a real semiconductor fab (or similar production line) for a 2-3 week sprint where, together with 1-2 fab-side engineers, the team runs the SgAI pipeline end-to-end on the fab's actual problem: from raw artifacts (process docs, MES/event logs, expert interviews) to formal model and specs (Phase A), to a certified dispatch/planning policy (Phase B). The exit artifact is a policy with a machine-checkable certificate against pre-registered specs, produced on-site, on real data, in bounded wall-clock time, and tested in the real fab.  
 

- Minimum: replay on withheld historical logs against the incumbent dispatcher's actual decisions.   
- Better: live shadow mode during the sprint's final days, with recommendations logged alongside incumbent decisions.   
- Stretch: a limited advisory or live window on a low-risk toolgroup, subject to fab sign-off. 

This demonstration would not test semantic expressivity, but the tooling’s ability to handle incomplete and messy data, tacit knowledge held by people rather than documents, and operations under time pressure with real end users. 

It also has a certain ‘retweetable’, demonstrative force that the benchmark cannot match.

## Site Candidates 

*Early search results:* 

| Site | What is it | Fit |
| :---- | :---- | :---- |
| [Pragmatic Semiconductor](http://pragmaticsemi.com) (Durham) | 300mm fab, flexible ICs; each line a fully automated 600 m² "fab-in-a-box", billions of chips/yr; up to nine lines. \~350 staff, PhD-heavy. Opened 2024\. | **Scale:** Harris-band; short flow, \<48h cycles (vs 600+ steps/months at leading edge), shallow re-entrancy. Short cycles; complete lot journeys observable within the sprint.  **Access:** Good. Research-native culture, no foreign-corporate approval chain. |
| [Vishay Newport](http://vishay.com/en/company/newport) (South Wales) | UK's largest fab: automotive-certified 200mm, 30k+ wafers/month; £250m SiC ramp underway  | **Scale**: MIMAC/SMT band; the only UK site with industrial-scale re-entrant flow.**Access**: hardest; US parent \+ standing national-security conditions; slow data negotiation. |
| [Diodes OFAB](http://diodes.com) (Oldham) | 150mm fab, multiple process families (discrete \+ analog IC), 200+ manufacturing staff, on-site process development team. Repeat NMI ‘Site of the Year’, recognising “outstanding operational efficiencies, technical success, new process development, and strategic market growth.” Wafer fabs in Oldham, England and Greenock, Scotland. | **Scale**: MIMAC band; real multi-process toolgroup contention.  **Access**: medium; US parent, but strong site identity. |
| [Clas-SiC](http://clas-sic.com) (Lochgelly) / [Semefab](http://semefab.co.uk) (Glenrothes) | Small independent Scottish open foundries: SiC power (Clas-SiC); MEMS/CMOS/discretes, 500M+ die/yr (Semefab). | **Scale**: MiniFab/Harris, but densest mix per machine; many customer processes on shared tools.  **Access**: easiest; small, independent, R\&D-native. |
| [CPI Medicines Manufacturing Innovation Centre](http://uk-cpi.com/work-with-us/medicines-manufacturing-innovation-centre) (Glasgow) | £88m pharma manufacturing testbed; digitally-twinned continuous direct compression line with AZ, GSK, Pfizer, Siemens | **Scale**: MiniFab-size, but exercises rungs a fab doesn't (shelf-life clocks, cold chain, degradation; L1b–L3a). Demonstrator, not a live commercial line. **Access**: good; built for trials; adjacent to AZ satellite.  |
| Commercial biopharma sites (AZ Macclesfield, GSK Barnard Castle, Fujifilm Diosynth Billingham) | Live fill-finish/secondary pharma manufacturing: multi-product campaigns, cold chain, expiry-dated inventory. | **Scale**: MIMAC-comparable campaign complexity \+ same L1b–L3a bonus, on a real line.  **Access**: medium; GMP data governance heavy; AZ is a warm door. |
| Catapult pilot lines ([AMRC](http://amrc.co.uk), [MTC](http://the-mtc.org)) | Research factories for aerospace/machining job-shop trials. | **Scale:** MiniFab job shops.   **Access:** easy but pure demonstrator; weakest exit artifact. |
| [IHP](http://ihp-open-pdk-docs.readthedocs.io) (Frankfurt/Oder, DE) | Leibniz research institute running a 130nm SiGe BiCMOS pilot line with MPW shuttle runs; the world's first open-source PDK — process specs, control parameters, reject criteria all public. | **Scale:** MiniFab/Harris band; pilot line, not volume fab; shuttle scheduling (batching designs onto shared runs) is its distinctive flavour. **Access:** unique; openness by institutional mission dissolves the NDA problem that constrains every commercial site. Not UK. |

Other domains: 

* Container ports

# The ladder from the point of view of a Petri net

~~Three~~ Two things you can globally count over a Petri net: ~~\#places,~~ \#transitions, \#tokens. Let’s consider tokens as first class citizens:

## Tokens

### State

* One colour  
* Finitely many colours  
* Countably many colours  
* Uncountably many colours

### Jump behaviour

* Reset to constant colour  
* Reset to deterministic expression (includes “no change”)  
* Reset to nondeterministic expression  
* Reset to probabilistic expression

(there is also the question of whether the expressions are linear or nonlinear)

### Delay behaviour

* Stay constant  
* Evolve deterministically (ODE)  
* Evolve nondeterministically (differential inclusion)  
* Evolve stochastically (SDE)

(there is also the question of whether the evolution is linear in time, or not)

## Transitions

State

* (are transitions memoryless?)

Delay behaviour

* Deterministic (includes timed and synchronous)  
* Nondeterministic (includes asynchronous)  
* Stochastic (includes Poisson)

Jump behaviour

* how many places/tokens does a transition interact with? Composition width\!

## Places

Aren’t places just a special case of colours? (sorry, I hope this does not take us down a rabbit hole. But it makes things simple. All we need to take care of are tokens and transitions). What I mean is: let color just be of type Place x TheActualColour and voila\! 

## References

\[1\]: 