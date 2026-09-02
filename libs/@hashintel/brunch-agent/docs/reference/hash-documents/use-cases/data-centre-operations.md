# One-liner

Data centre operators use this model to simulate the electricity and cooling flows of a facility, so they can keep servers within thermal limits and minimise energy cost under stochastic workload demand and equipment failures.

# Problem & context

- **What real-world system or process is being modelled?**
    
    A data centre's power and cooling infrastructure: power grid + batteries/uninterruptible power supply (UPS) deliver power to server racks, whose heat must be extracted by cooling units / chilled water loops. The workload placed on servers drives both power draw and heat generation.
    
- **Who feels the pain today, and how do they currently handle it?**
    
    Data centre operations/facilities teams. Capacity and redundancy decisions are typically made with static spreadsheet heat/power budgets or expensive CFD studies; incident response is largely driven by step-by-step procedures. 
    
- **What decision or outcome would improve if this model existed?**
    - Target temperature at which the cooling system to hold (low temperature will consume too much electricity; high temperature reduces safety margins)
    - Redundancy sizing - how many space cooling/power units to install beyond what is needed for full load
    - Safe maintenance windows for cooling/power units, ranked by risk
    - Quantified thermal risk under peak load or equipment-failure scenarios or live estimates during incidents (e.g. how long before the servers overheat?)

# System sketch

**Physical side:** electricity grid → uninterruptible power supply (UPS)/battery → Power distribution units → racks (server cabinets); racks generate heat as a function of load; computer room air conditions / handler units and the chilled-water loop extract heat; diesel generators as backup if the grid fails.

**Cyber side:** the workload scheduler decides where compute jobs land (and therefore where heat appears); Data centre infrastructure management monitors rack temperatures and power draw; control logic sets cooling target temperature and triggers failover. This is a digital-twin setup where live sensor data can drive transitions rather than assumed stochastic rates.

# Why a Petri net?

- Discrete stochastic events (equipment failure/repair, failover switching, workload arrival) combined with continuous quantities (rack temperature, power draw) is a good fit for SDCPN modelling. Specifically SDCPNs support the following:
    - **stochastic timing** - equipment break at random times, or how long a repair will take
    - **concurrency and resource contention** - the servers share finite cooling and power so if one unit fails, it propagates the load to the rest of the system. The model has to capture the ripple effect
    - **deterministic guards** - there are some strict rules that data centre operations implements for failover switching e.g. if the power cuts out, start the backup generator
    - **cycles** - to model equipments lifecycle / loops e.g. working → failed → under-repair → working
- There is established formalism in literature for this domain (see References)
- There are 2 main branches of research in the existing literature, each solving one half of the problem: the Petri net papers (SPN) model *what breaks and what takes over* (failures, backups, repairs) but treat it all as on/off events with no temperatures anywhere in the model, while the Google/Meta-style machine learning work models *how heat and temperatures evolve* but has no concept of equipment failing or spares kicking in. SDCPNs can model both because tokens carry data that changes continuously over time: a token representing a server rack can have a temperature that physically rises and falls (following an equation) while the discrete machinery of failures and failover switches goes on around it.
- A simpler formalism or model would miss aspects of the system: a queueing model handles jobs lining up for servers but has no concept of equipment breaking and backups taking over; system dynamics handles smooth trends like heat building up but can't do abrupt on/off events like a generator kicking in; a reliability block diagram (the traditional uptime-calculation tool) assumes components fail independently, so it can’t capture one unit's failure overloading the survivors, or two broken units waiting on the same repair crew; and CFD simulates airflow very accurately but takes so long to run that it's a one-time design study, not a live model you can re-run thousands of times or optimise against.

# Model outline

- **Places:** power grid supply, uninterruptible power supply/battery charge, generator (off/starting/on), power distribution unit capacity, racks, cooling units (working/failed/in-maintenance), chilled-water loop, alert queue
- **Transitions:** workload arrival (stochastic); power draw / heat generation (deterministic, proportional to load); heat extraction (rate depends on target temperature and units available); equipment failure & repair (stochastic); failover switch (deterministic guard with delay); maintenance start/finish
- **Tokens / colours:** compute jobs (load in kW); server rack state tokens carrying temperature (ODE dynamics: heat in from load, out from cooling); cooling-unit tokens (capacity, health)
- **Key parameters:** workload arrival distribution; cooling capacity & target temperatures; failure/repair rates; thermal coefficients; redundancy level (N+x); failover delays

# Questions the model answers

| Question                                                                                                                  | Task type                                         | Output                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| If a cooling unit fails at peak load, what is the probability any rack exceeds its thermal limit before repair completes? | Model verification (probabilistic model checking) | Probability of overheating + time-to-excursion distribution + location (which zone) |
| What cooling setpoints minimise energy cost (PUE) without thermal excursions?                                             | Constrained parameter optimization                | Optimal temperatures + energy saving vs risk curve                                  |
| Is N+1 cooling redundancy enough for this load profile, or do we need N+2?                                                | Parameter sensitivity analysis                    | Risk comparison across redundancy levels                                            |
| When is the safest window to take a cooling unit out for maintenance?                                                     | Simulation / what-if scenarios                    | Ranked windows with breach risk                                                     |
| Which component most drives thermal/availability risk?                                                                    | Parameter sensitivity analysis                    | Criticality ranking                                                                 |
| What are the true thermal dynamics of this room, given sensor logs?                                                       | Learning place dynamics                           | Learned ODE for token temperature evolution                                         |
| With 30 more GPU racks next quarter, can cooling hold at peak with all units running?                                     | Simulation / what-if scenarios                    | Monthly excursion probability + which local constraint binds                        |

# Data requirements for real-world application

- **Rack-level power draw and temperature telemetry:** standard data exports from data centre infrastructure management at minute resolution.
- **Equipment failure/repair history** for cooling and power units. Where the data is sparse, the SPN literature provides published rates by architecture tier (TIA-942, Table 3), so the initial model doesn't require client data.
- **Facility topology:** which racks are served by which power distribution units and cooling units.
- **Workload traces** (optional, for the scheduler coupling): job arrival and placement logs.

# Commercial angle

- **Buyer**: data centre operator; **user**: facilities & capacity planning engineers.
- **Extremely topical:** operators cannot easily build more data centre during this AI-era, so the biggest lever they still control is getting more out of the buildings they already have because of the following:
    - **Getting new capacity connected takes years.** A new facility has to join the utility's interconnection queue. In the UK, contracted demand connection applications jumped from 41 GW to 125 GW between November 2024 and June 2025, with at least 80 GW of it data centres. DESNZ reports this has contributed to waits of up to 15 years, and in the FLAP-D hubs (Frankfurt, London, Amsterdam, Paris, Dublin) new facilities wait 7–10 years on average for a grid connection, up to 13 in the most congested markets.
    - **Existing facilities’ power needs are increasing.** A site is connected at a fixed contracted capacity sized for 5–10 kW racks, but AI racks draw 50–100+ kW, so operators hit their power ceiling quickly and expanding the connection means rejoining the grid connection queue. Gartner (Nov 2024) predicts 40% of existing AI data centres will be operationally constrained by power availability by 2027, with AI-optimised servers drawing 500 TWh a year (2.6× their 2023 level).
    - **There is proven headroom in cooling.** Cooling is commonly put at roughly 30–40% of a facility's energy use, and DeepMind's ML control cut Google's cooling energy by ~40% at sites already among the most efficient in the world. If that much was available for optimisation, an ordinary facility has more.
- **Value of a better decision:** avoided thermal incidents (downtime costs), deferred capital (proving N+1 suffices avoids buying redundant chillers), energy savings from less conservative setpoints.
- This is a much **narrower scope than a “smart power grid”**, involving only 1 facility and own who can sign without a regulator or multiple parties. In the future this can be used as a proof of concept and scale up to a national power grid, which tends to be more risk-averse of a sector so proving the dynamic power management work on a smaller scale will be assuring.

# Model limitations

- Realism depends on calibrating thermal coefficients; without client telemetry / sensors the first version would be based on synthetic data / estimates.
- Using the Petri net as a digital-twin by feeding in sensor data to fire transitions in actual mode is not yet a Petrinaut capability.
- State-space growth: data centres likely to have 150+ racks which explodes the marking space if each is modelled individually.
- Thermal behaviour is continuous and spatial, abstractions applied by the SDCPN is justifiable for planning questions, but not as a CFD (computational fluid dynamics) study replacement.

# **Petrinaut feature requests**

- [in development] **Constrained optimisation:** the objective is a single metric, a constraint like "no thermal excursions" must be fed into the optimiser as a penalty term.
- [on roadmap] **Actual mode (live execution view):** petri net transitions fired according to sensor data as a digital twin of the data centre system
- **Built-in time-to-event outputs in Experiments:** "when did zone B first exceed its limit" is derivable via UUID tokens + metric engineering, but there is no built-in time-to-event experiment output for convenience and proper aggregation across runs.
- **Cross-place references in place dynamics:** a place's ODE sees only the tokens in that place, but thermal zones are physically coupled: hot exhaust from one zone reaches its neighbour's intake, so zone *z*'s equation needs zone *z*′'s current temperature. Currently that must be routed through parameters, read arcs, or by collapsing every zone into one shared place as a workaround. The feature request is a way for a place's dynamics to reference another place's token values, or an aggregate over them.

# Pros / Cons rationale

**Pros**

- **Thermal risk can be simulated:** existing approach consists of static heat/power budget spreadsheets where a safety margin is calculated (e.g. add up the heat from racks, with sum of cooling to check headroom). With SDCPNs the probability of thermal risks, such as how often units fail, how long repairs take, how fast a zone heats without cooling can be simulated to derive excursion probabilities.
- **The marking maps directly to the state of data centre:** infrastructure management sensors data map directly onto a marking as a digital twin: rack temperatures are token colours, equipment status is token position. Incident-time "time-to-excursion" is therefore a re-run from the current state without the need to build/maintain a separate model.
- **Small, physically-bounded decision vectors**: cooling target temperatures (a small range), redundancy level N+x (small integer), maintenance window (bounded time) are a handful of box-constrained variables. Unlike the scheduling case's 3|D| growth, this sits comfortably inside Optuna's range which makes optimisation straight forward with the challenge lies in building a high fidelity model.
- **The data to calibrate and validate already exists.** **Every serious data centre runs an infrastructure management with centralised sensor data of servers power draw and temperatures at minute resolution. Where access to data is not possible, we can draw on the literature and established synthetic data (e.g. failure/repair rates using TIA-942 tier).

**Cons**

- **We have to prove the temperatures are right, and CFD(computational fluid dynamics) is the benchmark we're measured against.** One averaged temperature per zone is a reasonable simplification for planning questions, but the buyer's reference point is typically a Cadence CFD twin that simulates airflow in detail.
- **The failures that matter most are the ones with the least data.** A chiller dying at peak load is what we want to model, and exactly what a client has rarely or possibly never recorded.
- **Coupled zones are unproven Petrinaut.** Place dynamics see only their own place's tokens, so inter-zone heat transfer must be routed through parameters, read arcs, or shared places. No documented precedent for tens of coupled thermal zones; scale limits are an empirical unknown.
- **The buyer may not value what makes us different.** Cadence CFD already answers "what happens if chiller 2 fails" and data centre infrastructure management already has alarms on temperature, so an operator can reasonably ask what a probability adds.

# Open questions

- [ ]  Instead of modelling individual server racks, can we group them as zones?
- [ ]  Should the SDCPN model decide where compute jobs run, or just take the load as given?
- [ ]  Can Petrinaut express coupled thermal equations? At how many coupled thermal zones does simulation or optimisation become too challenging to run with respect to time and in memory?

# References

### Petri nets (SPN) as formalism for data centre operations

1. Gomes et al., *Temperature variation impact on estimating costs and most critical components in a cloud data centre*, IJCAT (2020)
    - SPN models of the cooling subsystem coupled to IT availability, failure scenarios, downtime cost, and sensitivity analysis
2. Callou et al., *An Integrated Modeling Approach to Evaluate and Optimize Data Center Sustainability, Dependability and Cost*, Energies (2014) 
    - SPN + reliability block diagrams + energy-flow models in one tool (Mercury), evaluating availability, cost, and sustainability. (Essentially what SDCPN unifies).
3. Callou & Maciel et al., *A Petri Net-Based Approach to the Quantification of Data Center Dependability* (2012)

### Simulation-driven cooling optimisation

1. Meta Engineering, *Simulator-Based Reinforcement Learning for Data Center Cooling Optimization* (2024) 
    - industry use case: a hyperscaler running a simulate-then-optimise loop in production since 2021 with measured results.
2. Zhang et al., *Deep reinforcement learning towards real-world dynamic thermal management of data centers*, Applied Energy (2023) 
    - a recent academic survey of the field

### Digital-twin

1. Milojicic et al., *Digital Twins for Data Centers*, IEEE Computer (2024)
    - digital twins as the management layer for AI-era data centre efficiency
