# Examples

Petrinaut includes several built-in example nets accessible from the **hamburger menu** (top-left) under **Load example**. The SIR model is the simplest starting point; the Supply Chain with Disruption net is the most complex.

## SIR Epidemic Model

The classic Susceptible-Infected-Recovered compartmental model from epidemiology, implemented as a stochastic Petri net.

**Demonstrates:**

- **Stochastic firing rates** controlled by [global parameters](petri-net-extensions.md#global-parameters) (`infection_rate`, `recovery_rate`).
- **Arc weight > 1** -- the Infection transition consumes 1 Susceptible + 1 Infected and produces 2 Infected tokens, modelling the S+I -> 2I mass-action dynamics.
- Simple parameter-driven lambdas: `parameters.infection_rate` and `parameters.recovery_rate`.
- An **Infected fraction** [metric](simulation.md) plotting the share of the population currently infected.
- Four **scenarios** spanning the epidemic threshold: _Seasonal Flu_ (R₀ ≈ 1.9), _High Virulence Outbreak_ (R₀ ≈ 12), _Contained Outbreak_ (R₀ < 1, dies out), and _Pandemic Wave_ (large population, R₀ ≈ 5).

**Suggested initial state:** pick a scenario and press Play -- each one seeds the Susceptible/Infected/Recovered populations from a configurable `population` and `infected_ratio`. To set it up by hand instead, all places are untyped, so just enter token counts (e.g. Susceptible **100**, Infected **1**, Recovered **0**) and watch the epidemic curve in the timeline.

**Bundled extras:** two scenarios -- **Seasonal Flu** (R₀ ≈ 1.5) and **High Virulence Outbreak** (R₀ ≈ 6) -- driven by `population` and `infected_ratio` scenario parameters. One metric, **Infected Fraction**, plots the share of the population currently infected.

**Key concepts:** [stochastic firing](petri-net-extensions.md#stochastic-rate), [parameters](petri-net-extensions.md#global-parameters), [arc weight](useful-patterns.md#arc-weight-for-multi-token-operations), [scenarios](scenarios.md).

<img width="1104" height="412" alt="SIR" src="https://github.com/user-attachments/assets/b8ad69cb-687c-452a-8394-d5100db3e198" />

## Supply Chain with Disruption

An end-to-end manufacturing and distribution network (loaded from the **Probabilistic Supply Chain** menu item). Raw materials are sourced from two suppliers with different cost/reliability trade-offs, converted into finished goods by a factory machine that wears down over time, then sold to customers whose orders age, back-order, get fulfilled, or are cancelled.

**Demonstrates:**

- **Multiple typed places** -- `Shipment` (`eta`, `risk_score`, `source`, `cost`), `Customer order` (`age`, `priority`, `promised_lead_time`), `Production batch` (`processing_left`, `quality`, `source_mix`, `cost`), and `Factory machine` (`health`, `wear`).
- **Supplier disruption and recovery** -- each supplier toggles between `Available` and `Down` places via stochastic disruption/recovery transitions, so sourcing capacity changes over the run.
- **Continuous dynamics on several places** -- shipment ETA countdown, order aging, batch processing countdown, and machine health/wear drift all advance via [differential equations](petri-net-extensions.md#differential-equations-dynamics).
- **Distributions for sampling** -- `Distribution.Gaussian` for lead times, processing times, and quality, and `Distribution.Uniform` for risk scores and VIP/priority draws, often combined with `.map()` to clamp or derive values.
- **Competing predicate transitions** -- inbound shipments are received vs. damaged, production batches pass vs. fail quality, and outbound shipments are delivered vs. lost.
- **Backorder loop with an inhibitor arc** -- aging open orders convert to backorders, which are fulfilled from replenished stock or cancelled.
- **Custom SVG [visualizers](petri-net-extensions.md#visualizer)** on five places: inbound lanes, factory work-in-process, the customer queue, backorder heat, and last-mile deliveries.
- **[Metrics](simulation.md)** -- service level, customer pressure, stock position, inbound pipeline size, average inbound risk, factory availability, scrap fraction, suppliers down, and average waiting order age.
- **Five built-in scenarios** -- _Balanced dual source_ (baseline), _Demand surge and port congestion_, _Reliable supplier outage_, _Low-cost sourcing strategy_, and _Resilience investment_.

**Suggested initial state:** pick a scenario from the scenario panel and press Play -- each scenario seeds initial raw materials and finished goods and wires the relevant parameters, so no manual token placement is needed. Start with _Balanced dual source_, then try _Demand surge and port congestion_ to watch the customer queue and backorder visualizers fill up.

**Key concepts:** [types](petri-net-extensions.md#typed-vs-untyped-places), [distributions](petri-net-extensions.md#distributions), [competing transitions](useful-patterns.md#competing-transitions--routing), [inhibitor arcs](petri-net-extensions.md#inhibitor-arcs), [visualizers](petri-net-extensions.md#visualizer).

<img width="1264" height="267" alt="probabilitic-supply-chain" src="https://github.com/user-attachments/assets/3823a252-33ec-4d22-b220-c8aa337698bf" />

## Deployment Pipeline

A software release process with a safety gate and an incident feedback loop. Deployments and incidents arrive at stochastic rates; deployments may only start when no incident is open and no other deployment is running, and risky releases can themselves cause incidents that close the gate.

**Demonstrates:**

- **Inhibitor arcs** -- "Start Deployment" has inhibitor arcs from "IncidentBeingInvestigated" and "DeploymentInProgress", preventing new deployments while an incident is open or another deployment is running (single-deployment safety gate).
- **Source transitions** -- "Create Deployment" and "Incident Raised" have no input arcs, modelling Poisson arrivals at configurable rates.
- **Typed deployments and incidents** -- `Deployment` carries `size`, `risk`, and `age`; `Incident` carries `severity` and `age`, with both ages advanced by `age = 1` dynamics.
- **Distributions at creation** -- deployment `size` is `Distribution.Lognormal` and `risk`/`severity` are `Distribution.Gaussian`, clamped via `.map()` into sensible ranges.
- **State-dependent stochastic rates** -- larger and riskier deployments finish more slowly and fail more often; higher-severity incidents resolve more slowly.
- **Failure feedback loop** -- "Deployment Causes Incident" consumes the in-progress deployment, records it in FailedDeployments, and opens a new incident that then blocks the gate.
- **Custom SVG [visualizers](petri-net-extensions.md#visualizer)** on every place: release queue, incident bridge, deployment lane progress, and the completed/resolved/failed piles.
- **[Metrics](simulation.md)** -- successful deployments, failed deployments, release queue length, active incidents, a deployment-gate-blocked flag, and failure share.
- **Four built-in scenarios** -- _Baseline operations_, _Incident surge_, _High deployment velocity_, and _Risky large releases_.

**Suggested initial state:** no initial tokens needed -- all places can start empty. Pick a scenario (start with _Baseline operations_) and press Play; the source transitions generate deployments and incidents at the scenario's stochastic rates. Try _Risky large releases_ to watch the inhibitor gate close repeatedly as failures spawn incidents.

**Key concepts:** [inhibitor arcs](petri-net-extensions.md#inhibitor-arcs), [source transitions](useful-patterns.md#source-transitions-exogenous-arrivals), [mutual exclusion](useful-patterns.md#mutual-exclusion-with-inhibitor-arcs), [distributions](petri-net-extensions.md#distributions), [visualizers](petri-net-extensions.md#visualizer).

<img width="1272" height="584" alt="deployment-pipeline" src="https://github.com/user-attachments/assets/9777d44c-75cf-4398-858d-f58952af9dd3" />

## Production with Machine Failure

A manufacturing system where machines produce goods, accumulate damage, break down, and are repaired by travelling technicians.

**Demonstrates:**

- **Multiple typed places** with three different types: Machine (`machine_damage_ratio`), MachineProducingProduct (`machine_damage_ratio`, `transformation_progress`), and Technician (`distance_to_site`).
- **Differential equations** on three places: production progress advancing, damage being repaired, and technicians travelling to the repair site.
- **Predicate guards** based on continuous state -- production completes when `transformation_progress >= 1`, repair finishes when `machine_damage_ratio <= 0`, technician arrives when `distance_to_site <= 0`.
- **Competing outcomes** -- "Production Success" (predicate) vs "Machine Fail" (stochastic with rate `machine_damage_ratio ** 100`, increasing sharply with accumulated damage).
- **[Metrics](simulation.md)** -- good products, defective products, yield, machines down, and average machine damage.
- A **Default Production** scenario with configurable raw material, machine count, and initial machine damage.

**Suggested initial state:** load the _Default Production_ scenario and press Play; it seeds the raw material and machine pool for you. To set it up by hand instead:

| Place             | Tokens | Values                         |
| ----------------- | ------ | ------------------------------ |
| RawMaterial       | 100    | (untyped)                      |
| AvailableMachines | 3      | `machine_damage_ratio: 0` each |

All other places start empty. "Start Production" will immediately consume a raw material and an available machine to begin.

**Bundled extras:** one scenario, **Default Production**, with scenario parameters `raw_material`, `machines_count`, and `initial_machine_damage`. Use it to compare runs without retyping the initial marking.

**Key concepts:** [dynamics](petri-net-extensions.md#differential-equations-dynamics), [resource pools](useful-patterns.md#resource-pools), predicate vs stochastic on competing transitions, [scenarios](scenarios.md).

<img width="1223" height="611" alt="production-machines" src="https://github.com/user-attachments/assets/f9b058a2-6eef-4b0f-880b-09ae45921729" />

## Probabilistic Satellites Launcher

An orbital mechanics simulation: satellites are continuously launched into orbit around a central body and can collide with each other or crash into the planet, becoming debris.

**Demonstrates:**

- **Continuous dynamics** -- a gravitational ODE computes acceleration and updates each satellite's position (`x`, `y`) and motion (`direction`, `velocity`) every step.
- **Custom place visualization** -- an SVG [visualizer](petri-net-extensions.md#visualizer) renders the planet, satellite positions, and velocity vectors in the properties panel.
- **Source transition with stochastic rate** -- "LaunchSatellite" has no inputs and fires at `launch_rate`, injecting new satellites into orbit.
- **`Distribution.Uniform` and `Distribution.Gaussian`** in the launch kernel for randomized initial conditions.
- **`Distribution.map()` for coordinate conversion** -- a uniform launch angle is sampled once, then `.map()` derives both `x` (cosine) and `y` (sine) from the same underlying sample for a coherent polar-to-cartesian position.
- **Predicate transitions based on geometry** -- "Collision" checks the distance between two satellites and "Crash" checks distance from the planet's surface, routing tokens to the Debris place.
- **Arc weight 2** on the "Collision" transition -- it consumes two satellites from the Space place at once to evaluate pairwise proximity.
- **Scenarios** -- _Moon Orbit_ (low gravity, gentle arcs) and _Earth Orbit_ (high orbital velocities, frequent launches) preconfigure the gravitational constant, planet radius, and launch parameters.
- **[Metrics](simulation.md)** -- satellites in orbit, debris objects, average orbital radius, and average orbital speed.

**Suggested initial state:** no initial tokens needed -- pick a scenario (e.g. _Earth Orbit_) and press Play. The "LaunchSatellite" source transition creates satellites with randomized orbital positions and velocities. Select the Space place and open the visualizer preview to watch the orbits fill up. The velocity for a roughly circular orbit at radius `r` is approximately `sqrt(gravitational_constant / r)`.

**Bundled extras:** four scenarios -- **Moon Orbit**, **Earth Orbit**, **Mars Orbit**, and **Solar Orbit** -- that tune the physical constants for very different orbital regimes. Switch between them in Simulation Settings to compare.

**Key concepts:** [dynamics](petri-net-extensions.md#differential-equations-dynamics), [visualizers](petri-net-extensions.md#visualizer), [source transitions](useful-patterns.md#source-transitions-exogenous-arrivals), [distributions and `.map()`](petri-net-extensions.md#distributions), [arc weight](useful-patterns.md#arc-weight-for-multi-token-operations), [scenarios](scenarios.md).

<img width="1106" height="320" alt="probabilistic-satellites" src="https://github.com/user-attachments/assets/e696a4f7-f61a-4b8b-9b34-1598a7190376" />
