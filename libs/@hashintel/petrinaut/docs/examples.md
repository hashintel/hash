# Examples

Petrinaut includes several built-in example nets accessible from the **hamburger menu** (top-left) under **Load example**. They are listed below from simplest to most complex.

## SIR Epidemic Model

The classic Susceptible-Infected-Recovered compartmental model from epidemiology, implemented as a stochastic Petri net.

**Demonstrates:**

- **Stochastic firing rates** controlled by [global parameters](petri-net-extensions.md#global-parameters) (`infection_rate`, `recovery_rate`).
- **Arc weight > 1** -- the Infection transition consumes 1 Susceptible + 1 Infected and produces 2 Infected tokens, modelling the S+I -> 2I mass-action dynamics.
- Simple parameter-driven lambdas: `parameters.infection_rate` and `parameters.recovery_rate`.

**Suggested initial state:** set Susceptible to **100** tokens, Infected to **1**, Recovered to **0**. All places are untyped, so you just set token counts. Press Play and watch the epidemic curve in the timeline.

**Key concepts:** [stochastic firing](petri-net-extensions.md#stochastic-rate), [parameters](petri-net-extensions.md#global-parameters), [arc weight](useful-patterns.md#arc-weight-for-multi-token-operations).

<img width="1104" height="412" alt="SIR" src="https://github.com/user-attachments/assets/b8ad69cb-687c-452a-8394-d5100db3e198" />

## Supply Chain (Stochastic)

A manufacturing pipeline from raw material suppliers through manufacturing, quality assurance, and shipping to a hospital. Products have a random `quality` attribute that determines whether they pass QA.

**Demonstrates:**

- **Typed place** -- QAQueue has a "Product" type with a `quality` dimension.
- **`Distribution.Uniform`** in a transition kernel to sample random quality at manufacturing time.
- **Competing predicate transitions** -- "Dispatch" fires when `quality >= threshold`, "Dispose" fires when `quality < threshold`, routing tokens to different output places.
- **Parameter-driven guard** -- the `quality_threshold` parameter controls the pass/fail boundary.

**Suggested initial state:** set PlantASupply and PlantBSupply to **10** tokens each. Everything else starts empty. The stochastic "Deliver to Plant" transition will begin consuming from both suppliers once the simulation starts.

**Key concepts:** [types](petri-net-extensions.md#typed-vs-untyped-places), [distributions](petri-net-extensions.md#distributions), [competing transitions](useful-patterns.md#competing-transitions--routing).

<img width="1264" height="267" alt="probabilitic-supply-chain" src="https://github.com/user-attachments/assets/3823a252-33ec-4d22-b220-c8aa337698bf" />

## Deployment Pipeline

A software deployment process with incident handling. Deployments are created at a stochastic rate and proceed through a pipeline, but are blocked by incidents.

**Demonstrates:**

- **Inhibitor arcs** -- "Start Deployment" has inhibitor arcs from "IncidentBeingInvestigated" and "DeploymentInProgress", preventing new deployments while an incident is open or another deployment is running.
- **Source transitions** -- "Create Deployment" and "Incident Raised" have no input arcs, modelling Poisson arrivals at configurable rates.
- **Stochastic rates from parameters** -- `deployment_creation_rate`, `incident_rate`, `incident_resolution_rate`.

**Suggested initial state:** no initial tokens needed -- all places can start empty. The source transitions "Create Deployment" and "Incident Raised" generate tokens at their stochastic rates. Just press Play.

**Key concepts:** [inhibitor arcs](petri-net-extensions.md#inhibitor-arcs), [source transitions](useful-patterns.md#source-transitions-exogenous-arrivals), [mutual exclusion](useful-patterns.md#mutual-exclusion-with-inhibitor-arcs).

<img width="1272" height="584" alt="deployment-pipeline" src="https://github.com/user-attachments/assets/9777d44c-75cf-4398-858d-f58952af9dd3" />

## Production Machines

A manufacturing system where machines produce goods, accumulate damage, break down, and are repaired by travelling technicians.

**Demonstrates:**

- **Multiple typed places** with three different types: Machine (`machine_damage_ratio`), MachineProducingProduct (`machine_damage_ratio`, `transformation_progress`), and Technician (`distance_to_site`).
- **Differential equations** on three places: production progress advancing, damage being repaired, and technicians travelling to the repair site.
- **Predicate guards** based on continuous state -- production completes when `transformation_progress >= 1`, repair finishes when `machine_damage_ratio <= 0`, technician arrives when `distance_to_site <= 0`.
- **Competing outcomes** -- "Production Success" (predicate) vs "Machine Fail" (stochastic with rate `machine_damage_ratio ** 100`, increasing sharply with accumulated damage).

**Suggested initial state:**

| Place             | Tokens | Values                         |
| ----------------- | ------ | ------------------------------ |
| RawMaterial       | 100    | (untyped)                      |
| AvailableMachines | 3      | `machine_damage_ratio: 0` each |

All other places start empty. "Start Production" will immediately consume a raw material and an available machine to begin.

**Key concepts:** [dynamics](petri-net-extensions.md#differential-equations-dynamics), [resource pools](useful-patterns.md#resource-pools), predicate vs stochastic on competing transitions.

<img width="1223" height="611" alt="production-machines" src="https://github.com/user-attachments/assets/f9b058a2-6eef-4b0f-880b-09ae45921729" />

## Satellites in Orbit

An orbital mechanics simulation with satellites orbiting Earth, subject to collision and crash events.

**Demonstrates:**

- **Continuous dynamics** -- gravitational ODE computes acceleration, updating satellite position (`x`, `y`) and motion (`direction`, `velocity`) each step.
- **Custom place visualization** -- an SVG visualizer renders Earth, satellite positions, and velocity vectors in the properties panel.
- **Predicate transitions based on geometry** -- "Collision" checks distance between two satellites, "Crash" checks distance from Earth's surface.
- **Arc weight 2** on the "Collision" transition -- requires two satellites from the same place to evaluate pairwise proximity.
- **Parameters** for physical constants: `earth_radius`, `satellite_radius`, `gravitational_constant`, `crash_threshold`.

**Suggested initial state:** add 3--5 satellite tokens to the Space place. Position them in a rough orbit around the origin (Earth is at 0,0). For example:

| x   | y    | direction | velocity |
| --- | ---- | --------- | -------- |
| 80  | 0    | 1.57      | 70       |
| 0   | 100  | 3.14      | 55       |
| -60 | -60  | 0.78      | 80       |

The velocity needed for a roughly circular orbit at radius `r` is approximately `sqrt(gravitational_constant / r)`. With the default `gravitational_constant` of 400000, that's about 71 at radius 80. Select the Space place and open the visualizer preview to watch the orbits.

**Key concepts:** [dynamics](petri-net-extensions.md#differential-equations-dynamics), [visualizers](petri-net-extensions.md#visualizer), [arc weight](useful-patterns.md#arc-weight-for-multi-token-operations).

<img width="845" height="313" alt="satellites" src="https://github.com/user-attachments/assets/917b7300-9542-43ba-a07f-98f3e2885542" />

## Probabilistic Satellites Launcher

Extends the Satellites example with ongoing satellite launches at a stochastic rate.

**Demonstrates:**

- **Source transition** with stochastic rate -- "LaunchSatellite" has no inputs and fires at a constant rate, injecting new satellites into orbit.
- **`Distribution.Uniform` and `Distribution.Gaussian`** in the launch kernel for randomized initial conditions.
- **`Distribution.map()`** for coordinate conversion -- a uniform angle is sampled once, then `.map()` derives both `x` (cosine) and `y` (sine) from the same underlying sample for coherent polar-to-cartesian conversion.

**Suggested initial state:** no initial tokens needed -- start with all places empty. The "LaunchSatellite" source transition fires at a rate of 1 per second, creating satellites with randomized orbital positions and velocities. Just press Play and watch the Space visualizer fill up.

**Key concepts:** [source transitions](useful-patterns.md#source-transitions-exogenous-arrivals), [distributions and `.map()`](petri-net-extensions.md#distributions).

<img width="1106" height="320" alt="probabilistic-satellites" src="https://github.com/user-attachments/assets/e696a4f7-f61a-4b8b-9b34-1598a7190376" />
