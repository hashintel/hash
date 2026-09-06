# One-liner

Fleet operators use this model to decide when and where to service each truck. The service must occur early enough to prevent a breakdown on the road, and late enough not to waste maintenance capacity. The number of trucks in the depots must not cause a missed delivery.

# Problem & context

- **Which real-world system does the model show?**
    
    A truck fleet running delivery routes while its components wear out. Trucks stream telematics data as they drive; maintenance happens at depots with a limited number of bays, technicians and spare parts. The operator has to sequence servicing across the whole fleet, because you can never service every truck at once and pulling the wrong truck off the road at the wrong time costs deliveries.
    
- **Who has this problem now, and what do they do?**
    
    Fleet operations planners. Servicing is mostly at fixed intervals (mileage or time) plus reactive repair when something breaks. Telematics products flag faults and increasingly predict failures. These products tell the planner which truck has a high risk but not the optimised scheduling e.g. which truck to service on Tuesday given there are 3 free bays and a delivery contract.
    
- **Which decisions become better with this model?**
    - The maintenance policy: what wear level should trigger a service
    - The sequence of the maintenance tasks for each week.
    - Depot capacity and placement: number of bays at a depot; the location of a new depot
    - The model gives a breakdown risk and a delivery risk for each decision.

# System sketch

**Physical part.** The trucks move along the routes, with position of each truck changing continuously. The wear and tear increases with distance and load. The depots have fixed locations, each with bays, technicians and spare parts. A truck can break down on the road then a recovery vehicle must move the truck to a depot.

**Cyber part.** The telematics system sends engine hours, brake wear, fault codes and GPS position, which feeds the predictive software / layer. The fleet management software dispatches the trucks and books the service slots. The data moves in two directions: sensor data updates the state of the model, the model sends a maintenance schedule to the dispatch software.

# Why a Petri net?

- Continuous degradation combined with discrete, resource-constrained maintenance is a good fit for SDCPNs. Specifically:
    - **Dynamically coloured tokens.** Each truck token has a wear/health value. The value evolves continuously while the truck operates.
    - **State-dependent stochastic rates.** The breakdown rate is a function of the wear value. So the rate increases as the truck degrades.
    - **Resource contention.** Each depot has a limited number of bays, technicians and spare parts. This limit causes the scheduling problem.
    - **Cycles.** A truck operates, deteriorates, gets maintenance, then operates again. This cycle continues for the life of the truck.
    - **Spatial dynamics.** The tokens carry coordinates and the travel time is a result of the dynamics. The model does not use an assumed constant.
- There is established Petri net literature for this domain (see References below): coloured Petri nets for aircraft fleet maintenance with multi-level repair, limited spare parts and cannibalisation; hierarchical coloured Petri nets for land-vehicle fleets. The literature splits into 2 main approaches:
    - one approach shows the repair system in detail, including queues, bays, crews and spare parts. But it shows the wear as a small number of discrete states with constant rates.
    - second approach uses machine learning on real sensor data. It predicts the failure risk of one truck with good accuracy but stops at that risk value. If three trucks are flagged with high risks and only one bay is free, the second group doesn’t give any recommendation on scheduling.
- A simple model loses necessary information:
    - A reliability model gives a failure probability for each truck but has no depot, no queue and no scheduling.
    - A queueing model shows the depot but does not show the wear that sends the trucks to the depot.
    - A scheduling model assigns the work to the bays but it must assume the time of each future service, which is uncertain.

# Model outline

- **Places:** in service, on the way to a depot, depot queue, in a bay, ready for dispatch, broken down on the road. Resource places: bays, technicians, spare parts.
- **Transitions:**
    - Dispatch: sends a truck to a route.
    - Drive: updates the coordinates of the token and accumulates the wear value.
    - Telematics alert: live data fires this transition in twin mode.
    - Schedule a service
    - Travel to a depot
    - Repair: duration is stochastic, the transition uses one bay, one technician and spare parts
    - Return to service
    - Breakdown: the rate increases with the wear value of the token.
    - Roadside recovery
- **Tokens and colours:** trucks (coordinates, mileage, per-component wear/health with ODE dynamics), technicians (skill), spare parts, delivery jobs.
- **Parameters:** the wear rates; the breakdown rate curve; repair duration distributions; the number of bays and technicians; the wear value threshold that starts a service; depot locations

# Questions the model answers

| Question                                                                                                                 | Task type                                         | Output                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| What is the probability of a missed delivery target in one month with this maintenance schedule?                         | Model verification (probabilistic model checking) | The probability of a missed delivery target         |
| What wear threshold should trigger a service, to minimise total downtime + maintenance cost?                             | Parameter optimization                            | Optimal threshold policy + cost vs risk curve       |
| Which trucks should be pulled for service this week, and in which order, given we can't service the whole fleet at once? | Simulation / schedule comparison                  | A list of maintenance schedules in order of quality |
| How does each component degrade, given telematics logs?                                                                  | Learning place dynamics                           | A learned wear ODE equation for each component      |
| What breakdown hazard rates best explain our historical failure data?                                                    | Parameter inverse problem                         | Calibrated breakdown rates                          |
| Would a new depot at location X reduce fleet downtime more than an extra bay at an existing depot?                       | Spatial what-if / sensitivity analysis            | Downtime comparison across configurations           |
| How many trucks will be off the road at once, at worst, over the next quarter?                                           | Simulation / what-if scenarios                    | A distribution of the number of unavailable trucks  |

# Data requirements for real-world application

- **Telematics data:** mileage, engine hours, fault codes and GPS position. Fleet operators have this data at high resolution and forms the basis of the products that they buy now.
- **Maintenance records and breakdown records** for each truck and each component.
- **Depot locations, the number of bays, the technician rosters, and the delivery schedule.**
- **Public data is available if the client data is not available.** SCANIA released the Component X data set in *Scientific Data* in 2025. The data set contains real measurements from a truck fleet. It also contains repair records and truck specifications. SCANIA released it as a public benchmark for predictive maintenance. Volvo released data from more than 10,000 heavy trucks for the ECML-PKDD 2024 challenge. We can calibrate the wear part of the model with this data with any real client telematic data first.

# Commercial angle

- **Buyer:** fleet operators; **User:** fleet operations planners.
- **Monetary value is easy to calculate.** A breakdown on the road causes recovery costs, a missed delivery and lost driver hours; a service done too early wastes a slot and a part with life left in it. Both scenarios can be quantified with money.
- **The competition.** Truck manufacturers and telematics companies sell failure prediction now. Volvo and SCANIA have large machine learning programs and they publish the results. We should not compete on failure prediction as they have more data and better access to trucks We will add value after the predictions, turning a set of risk values into an optimised maintenance schedule which conforms to the limits on bays, technicians, spare parts, travel time and delivery contracts. The IDA 2024 paper on SCANIA trucks writes about cost and context in the maintenance decision without mentions on how to derive the maintenance schedule.

# Model limitations

- Route optimisation is considered out of scope. Routes are taken as given and maintenance is optimised around them.
- The fleet size sets the model size (e.g. 300 trucks generate 300 tokens). Each token carries its own dynamics, then multiplied by Monte Carlo runs and optimisation trials. The limit at which Petrinaut can handle this is unknown.

# **Petrinaut feature requests**

- **Priority-based resource resolution.** More than 1 trucks can request the same free bay. Right now Petrinaut will just pick one arbitrarily, but we want to be able to define some kind of priority rules like "most worn first" or "nearest first”.
- **Controllable transitions.** Existing transitions fire by themselves based on defined rates / stochasticity. We need a way to define transition firing based on a decision e.g. when the scheduling chooses to pull a truck into maintenance.
- **Time-to-event results in Experiments.** Two example questions: when did this truck break down first, and for how long was the fleet below N available trucks. A user can calculate these values with UUID tokens and metric code. Petrinaut has no built-in result for them. The calculation across the runs must also count the runs with no event. The data centre use case requests the same feature.
- **Injection of a marking from live telematics.** The digital twin needs the current fleet state as an initial marking. The state includes the positions, the wear values and the depot occupancy. The data centre use case requests the same feature.

# Pros / Cons rationale

**Pros**

- **Events are frequent.** A fleet has hundreds of similar trucks, and breakdowns occur every week. This is beneficial in 3 ways: Monte Carlo runs converge quickly; we can fit one wear model to hundreds of trucks ; the failure data is not rare unlike some other use cases (e.g. data centre operations)
- **Real public data is available.** The SCANIA data set and the Volvo data set contain real wear data from real fleets.
- **Can easily express the value of the model in monetary terms.** Prevented breakdowns and safe delays of a service convert to money directly.

**Cons**

- **Wear has more than one dimension.** The brakes, the engine, the transmission and the tyres wear at different rates and also interact with each other. One wear value for each truck is an over-simplification.
- **Many fleets already have a prediction product.** These fleets must add our tool to an existing system, which reduces urgency / need for purchase.
- **The competition controls the data.** The telematics companies hold the sensor data and the truck manufacturers build the same function internally.
- **The scale is not known.** Hundreds of tokens each have their own equation. Monte Carlo runs and optimisation trials multiply the cost.

# Open questions

- [ ]  How best to model the truck’s degradation, per-component or per-truck?
- [ ]  Should the model include supply of spare parts?
- [ ]  How many trucks can the simulation run before it becomes too slow?

# References

### Petri nets for fleet maintenance

1. *A coloured Petri net framework for modelling aircraft fleet maintenance*, Reliability Engineering & System Safety (2018)
    - This is the nearest published example. It is a coloured Petri net model of fleet maintenance with more than one level of repair. The model includes limited spare parts, limited resources and cannibalisation. Cannibalisation is the removal of a good part from an unserviceable asset to repair a different asset. The reference list in this paper is also a good map of the earlier work.
2. *Intra-City Call-Taxi Fleet Sizing using Petri Net Embedded Simulation Optimization* (2022)
    - A Petri net simulation with an optimisation layer above it.

### Petri nets for condition-based maintenance

1. *Modelling wind turbine degradation and maintenance*, University of Nottingham
    - A Petri net for wear, inspection and condition monitoring. The model includes dependent wear between the subsystems. This is the nearest example to our model, but in a different industry.

### Machine learning for truck predictive maintenance

1. Kharazian et al., *SCANIA Component X dataset: a real-world multivariate time series dataset for predictive maintenance*, Scientific Data 12:493 (2025)
    - Real measurements, repair records and specifications from a SCANIA truck fleet. SCANIA released the data as a public benchmark. The data set supports survival analysis. This is the most useful reference here. We can use this data now.
2. *Volvo Discovery Challenge at ECML-PKDD 2024*
    - Failure risk prediction for more than 10,000 Volvo heavy trucks. 52 teams sent 791 entries. This shows that the data is available. It also shows how much attention the prediction problem gets.
3. Carpentier et al., *Towards contextual, cost-efficient predictive maintenance in heavy-duty trucks*, IDA 2024
    - SCANIA trucks and survival analysis. The authors write about cost and context in the maintenance decision. This is the nearest work to our scheduling question.
4. *Achieving Predictive Precision: LSTM and Pseudo Labeling for Volvo's Discovery Challenge* (2024)
    - The second-place method. It has a macro-average F1 score of 0.879. This number shows the accuracy of failure prediction today. It also shows why we must not compete in that area.
