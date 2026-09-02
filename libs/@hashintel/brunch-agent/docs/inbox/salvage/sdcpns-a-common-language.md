# SDCPNs: A Common Language for Complex Systems

We want to provide formal guarantees of AI safety across a wide range of domains and applications. That creates a modelling problem before it creates an AI problem: if we want to reason rigorously about whether an AI-controlled system is safe, we first need a mathematical representation of that system and the potential consequences of action within it.

There are many established mathematical languages for describing the world. Differential equations describe quantities that evolve continuously over time, such as temperature or motion. State machines and automata describe systems that move between discrete modes. Markov decision processes capture decision-making under uncertainty. Petri nets represent concurrency and competition for shared resources. Each of these formalisms help model different sorts of behaviours that we find in the real world.

Hybrid-system formalisms are designed to bring multiple of these lenses together. We are investing in *Stochastic Dynamic Coloured Petri Nets* (SDCPNs), a Petri net variant that provides a way to represent continuous and discrete behaviour, multiple interacting entities, structured state, data-dependent decisions, concurrency and randomness within a single framework.

That combination is particularly useful for *cyber-physical* systems: where a physical process is monitored and even controlled by digital elements. A physical change may enable or block a decision; a decision in cyberspace can alter a physical trajectory; and failures often emerge not from either side independently, but from their interaction.

In this post we'll build up an SDCPN from an ordinary Petri net, explain what each extension adds, and then use several cyber-physical examples to show the range of systems the resulting formalism can represent.

# What is an SDCPN?

A [Petri net](https://petrinaut.org/) is a directed bipartite graph where **places** (circles) and **transitions** (rectangles) are connected by **arcs** (edges/arrows), in totality representing a process. Places can represent conditions or resource buckets and are *marked* by **tokens**, with the markings recording the state of the process at any given moment. Transitions are enabled by the presence of tokens in their input places, and when they *fire* they consume tokens from their input places and produce tokens in their output places, thereby changing the state of the process.

For example, a very simple Petri Net modelling a pedestrian traffic light might look like this:

![][image1]

The above Petri net includes two places, Red and Green, connected by two transitions. The net starts with one token in Red, when “Switch to Green” fires, it moves to Green; when “Switch to Red” fires, it moves back to Red. This illustrates the logic of switching between green and red on a traffic light. In practice the firings would all be near-instantaneous, the animation above was slowed down to illustrate the switch clearly.

A plain Petri net records what can happen and in what order, but without modelling durations, likelihoods, or what distinguishes one token from another, and it cannot answer "how often" or "how likely" questions about a given scenario.

An SDCPN extends a plain Petri net with 4 features:

* **Colour**. Each place is associated with a *colour set* $C$, which defines the type and structure of data that tokens in that place may carry. A token residing in the place has a particular *colouring* $x\ \epsilon \ C$: that is, a specific assignment of values to the attributes defined by the place’s colour set. Colouring therefore makes otherwise identical tokens distinguishable. For example, if a place represents stored food products, its colour set might specify the tuple *(product ID, production date, expiry date, …)*, while an individual token could have colouring **x** \= *(P123, 01/06/2026, 01/09/2026, …)*. Token values can be used to influence net behaviour, for example the introduction of a transition guard function $G(x)$*G*(**x**), which evaluates the colouring x of the tokens available to a transition. The transition is enabled when $G(x)=1$ and disabled when $G(x)=0$. For instance, a transition representing “ship to customer” could have a guard G(x) \= 1 if the product’s expiry\_date \> today \+ 365 days, and G(x) \= 0 otherwise, so that only products that have a sufficient shelf life are eligible for shipment.

* **Stochastic firing.** Rather than firing immediately once enabled, each enabled transition *i* independently draws a random firing delay from a probability distribution whose parameters can depend on the token's colouring **x**. In the common exponential case, P(fire in dt) ≈ λi(**x**) dt, where λi is the firing rate of transition *i*. When multiple transitions are enabled, the one with the shortest sampled delay fires first. A higher λ means a shorter expected delay, so faster processes tend to fire before slower ones but a slower transition can still occasionally go first. For example, if a delivery has a firing rate of 0.2 per hour and a van breakdown has a rate of 0.01 per hour, deliveries fire far more often but a breakdown can still happen first on any given run.

* **Deterministic dynamics (ordinary differential equations \- ODEs).** While a token sits in a place, its colouring $x$ (e.g. fluid level, machine’s wear) evolves continuously through

$dx=f(x,\ p)dt$

where $f(x,\ p)$ is the deterministic drift term which dictates the trend of the colouring evolution and $p$ is the set of fixed constants such as flow rates or degradation coefficients. This evolution replaces the assumption of static token colouring: a token’s data changes continuously while it remains in a place, according to differential equations that can represent processes such as material consumption, fluid-level changes, or progressive equipment degradation. Whether a token enables a transition or at what rate the enabled transition will fire can therefore evolve over time depending on the evolution of token data. We can use this to model the freshness of food decreasing over time at a rate of $dx=-k{e}^{(-T/20)}dt$, where k is a base decay rate and T is the storage temperature, so warmer conditions accelerate the loss of freshness and the product becomes unsellable when its freshness crosses a threshold.

* **Stochastic dynamics (stochastic differential equations \- SDEs).** The differential equations can include random noise, so continuous evolution can be perturbed by random noise. This is represented as a stochastic differential equation (SDE):

$dx=f(x,\ p)dt+\sigma (x,\ p)dB$

where $B$ denotes a stochastic process such as the Weiner process through which randomness enters and $\sigma (x,\ p)$ is the diffusion term acting as the scaling factor of randomness. The first term $f(x,\ p)$ is the same drift term appearing in deterministic dynamics. Examples of stochastic dynamics are demand rates or ambient temperature drifting randomly.

The four features together allow SDCPNs to represent all aspects of a cyber-physical system in the same state and clock: its physical process (a tank emptying, a machine wearing), control logic (when to dispatch, when to service), and the randomness that affects both (a breakdown, a demand spike).

## The origin of SDCPNs

While ordinary Petri Nets date back to the 1960s, SDCPNs were developed by [Mariken Everdij and Henk Blom](https://link.springer.com/chapter/10.1007/11587392_10) at the National Aerospace Laboratory (NLR) in the Netherlands, in the early 2000s. The problem they were trying to solve was quantifying the probability of a mid-air collision, an event too rare to observe in testing, and requires modelling many aircraft moving continuously, controlled by different humans and automated systems. Everdij and Blom extended the Dynamically Coloured Petri Net (DCPN) by adding Brownian motion to the equations governing how token data evolves between firings, and defined the result as a formal 12-component specification ([P, T, A, N, S, C, V, W, G, D, F, I](https://old.sf.bg.ac.rs/downloads/katedre/apatc/ICRAT2010.pdf)).

The formalism was designed to support a safety case, expressed in probabilistic terms: a defensible and quantitative statement about how often something bad happens in a system too complex to test exhaustively. With a view to enabling the same kind of guarantees to be made regarding the behavior of frontier AI models, the ARIA [Safeguarded AI](https://aria.org.uk/opportunity-spaces/trust-everything-everywhere/safeguarded-ai) (SgAI) programme is also building on SDCPNs. Our goal is to enable the development of world models expressive enough to represent both complex physical systems and the AI that control them, with a safety specification over both. The air traffic problem, with continuous dynamics, multiple agents, human and automated controllers, rare catastrophic events is exactly the class of system SgAI is building for. The only difference is the controller: the original use case modelled human operators and procedural automation, while SgAI focuses on neural networks.

# Modelling the real world with SDCPNs

The following sections demonstrate how we can model real world systems using SDCPNs with three examples: an industrial supply chain process progressively, truck fleet maintenance and semiconductor fabrication. We built the first example (industrial gas supply chain) progressively, adding one feature of the formalism at a timeat each level until the model is a full SDCPN. To illustrate the expressivity of SDCPNs, we model two further domains as full SDCPNs: truck fleet maintenance and semiconductor fabrication.

## Industrial gas supply chain

Taking an industrial gases supply chain as an example use case: a gas supplier delivers liquid gases (e.g. nitrogen, oxygen) to customer sites by road tankers. The supply chain operates in a standard practice where the supplier owns the liquid in each customer's tank, reads the level by telemetry, and decides when to send a refill. The customer draws product as needed and only pays for what they consume, but does not place orders.

Each tank empties from two sources: the customer's consumption and heat leaking through the walls, which boils liquid gas off continuously. A delivery that arrives before enough space exists risks overfilling. The supplier must keep every tank within a safe range:

* **Too low**: the customer's production line stops (stockout).

* **Too full**: boil-off gas has nowhere to go, pressure rises, and the relief valve vents the gases into the atmosphere, creating wastage and potential safety concerns.

The reorder point, load size, consumption rate, boil-off rate, and delivery lead time are all coupled. A tanker dispatched to one site is unavailable to other customer sites until it returns.

### Plain Petri net

First we model the system using a [plain Petri net](https://drive.google.com/file/d/1gm8SxdDZUYbn4GMkaoOOJqGpt38V685U/view?usp=drive_link) with only places, transitions, tokens (without colours) and different arcs and arc weights.

The net consists of just 1 customer site to illustrate the core concepts. To start, there is a tank of nitrogen on site holding 42 out of 54 units of liquid gas; one tanker at the depot and up to 2 loads may be on order at once. The customer’s production line is running.

As the customer consumes the nitrogen and some boils off, the level drops. When the level drops to 15 (representing the telemetry-based sensor in the tank), an order is placed. A tanker dispatches, arrives and delivers 12 units (only if 12 units of space exist in the tank). The permit and tanker return on delivery and cycle repeats.

Stockout happens if the tank hits zero and the production line stops. It restarts when at least 1 unit arrives.

If the tank is completely full, a relief valve opens and reduces the level of gas (by 1 unit). Under this level trigger order policy, venting is unreachable since the maths of the reorder point and load size prevent it (gas only refills by 12 units when at or below 15 units). In later timed-extensions of the model, we introduce pressure-driven venting since in practice, venting is required when pressure gradually builds as the liquid warms.

[\[Here\]](https://drive.google.com/file/d/177jPqinyVje7RDLYGzZGaIYqYFVSE5sK/view?usp=drive_link) shows the net for a variant of the order policy based on consumption-trigger. Instead of reordering when the level drops below a threshold, the system reorders after every 8 units are drawn by the customer without accounting for any evaporation. This results in a failure mode whereby, If enough nitrogen boils off, the tank empties without the consumption counter ever reaching 8\. The system reaches a deadlock: the tank is at zero, fewer than 8 units have been drawn since the last order, and nothing in the model can change the state in the system so the production line stops and never restarts.

Without time accounted for in the model, the net picks any enabled transition to fire without any rules on ordering. There can be a scenario where the transition for consuming nitrogen is fired repeatedly and empties the contents without dispatching the tanker for refill. Adding durations fixes this so events happen according to rates rather than random choice, which we explore in the next progression where stochastic firing rates are added.

This basic Petri net is useful for checking the logic of the system, such as finding deadlocks (consumption-trigger variant), checking conservation laws (liquid \+ ullage \= 54 always) etc. Without the additional features, it falls short on answering the more interesting timing questions like whether the tank runs dry before the tanker arrives, or what load size and reorder point minimise stockouts.

### Add time

\[[The following](https://drive.google.com/file/d/1qi8AlNVYZJ7I4goj9ym8726Bj9EmMmnQ/view?usp=drive_link)\] shows a Stochastic Petri net (SPN), based on the same structure as the basic Petri net with the addition of rates on each transition and a second site (SlowNitrogen) to represent a low-consumption customer.

Each enabled transition now independently draws a random delay time from a general family of distributions. One prominent distribution in this family is the exponential distribution, where each transition has a random delay t (0 to ∞) drawn from:

$P(t\ |\ \lambda )=\lambda {e}^{(-\lambda t)}$

Where $\lambda $ is the average delay per hour (firing rate) for that transition. So whichever transition is delayed the least fires first. For example, when the customer’s (SteadyNitrogen) tank is half full, three transitions are enabled at once: the customer drawing product (rate 0.80/h), boil-off (0.16/h), and the tanker arriving (rate 1/6 ≈ 0.17/h). The runtime engine rolls a random delay time for each: 0.45 hours for product draw, 3.1 hours for boil-off, and 2.8 hours for the arrival. The nitrogen draw transition fires first so one unit leaves the tank, the clock advances 0.45 hours, and all three roll again from scratch.

A limitation of modelling journey time as a stochastic rate on the arrival transition (1/6 or 1/9 per hour, giving mean journeys of 6 and 9 hours) is that the exponential distribution allows a delivery to arrive almost immediately or take far longer than its mean. Realistic journey times need a minimum and a bounded spread, which requires clocks counted down by dynamics.

With the addition of a second customer, the one supplier tanker serves both sites with a new "returning" state to represent the time the tanker spends driving home after each delivery, introducing a risk of stockout if one customer is left waiting whilst the tanker delivers for another. For example, if the SteadyNitrogen tank crosses its reorder threshold (16 units) while the tanker is mid-journey to the SlowNitrogen site, it must wait for the delivery to complete (up to 9 hours remaining), the return trip (\~4 hours) plus its own journey (\~6 hours) before receiving the product. At a combined drain of \~0.96 units/hour, 16 units of buffer lasts roughly 17 hours, so on some runs can result in a stockout for the high consumption customer (SteadyNitrogen).

This stochastic net introduces time and contention with transitions competing to fire next and additional customers that can lock out delivery for each other. It answers questions on stockout frequency, the cost of sharing a tanker and the effect of slower routes. It falls short on the realism of timing (a 6-hour journey is exponentially distributed, so it sometimes arrives in minutes and sometimes takes a day), distinguishing between different products, and continuous processes like boil-off are still modelled as discrete random events rather than a steady flow.

### Add data types (colours)

To distinguish which product a tanker is holding, we can add colours so each tanker token now has a data field identifying its gas type. In [this example](https://drive.google.com/file/d/17nHeK4cmA9MX5q2vfYYifbQzJB2vZq0R/view?usp=drive_link), the timing mechanism stays stochastic but the network grows to three customers and three tankers.

The third customer requires a different type of gas, oxygen with a draw rate of 0.60/h and average delivery journey time of 12 hours. The depot now holds 3 tankers (2 nitrogen, 1 oxygen) and a transition guard checks the correct product is dispatched. If a nitrogen order is placed and only the oxygen tanker is idle, the order waits.The cycle for drawing, boiling-off and ordering works as before.

With product identity added to the fleet, the SPN with colours can answer questions on whether fleet composition matters more than fleet count and by how much. For example, the same three tankers re-specified from one to two oxygen tankers can eliminate the oxygen stockout completely if they are the most critical customer from a business perspective. The colour features also allows for modelling of tanker spot hires. For example if 3 or more orders are waiting and no tanker is idle, a hire transition fires: its kernel writes a new tanker token into the depot with a rental flag, and a release transition destroys it when the demand clears. (This is included in the next progression where the colours are evolving (dynamics).)

This model still has the same timing limitations as the SPN: exponential journey times and discrete boil-off events.

### Add continuous evolution

\[[This model](https://drive.google.com/file/d/1wV2aqplN35FruUVtgkJKzD17FjbTBCyC/view?usp=drive_link)\] adds dynamic colours and replaces the stack of unit tokens with a single token governed by differential equations, to model the level of gas and pressure as real numbers that can fall or grow continuously. With the inclusion of dynamics, the net can now model scenarios that simpler nets couldn’t:

* **Pressure building in a tank with relief valve cycling.** Boil-off gas fills the empty space above the liquid, the reduced space raises the pressure more so a fuller tank pressurises faster. When pressure reaches the relief setpoint (8 units), the valve opens, 0.4 units of liquid escape as gas and the pressure drops just below 8\. If the tank is still nearly full, pressure climbs back to 8 and the valve opens again. This reveals a trade-off where a fuller tank means fewer stockouts but more wastage through vented product, resulting in higher supplier costs.

* **Realistic durations from lognormal distributions.** The dispatch kernel samples a journey time from a lognormal distribution and writes it onto the tanker token. Place dynamics counts the remaining time down by 1 per hour, and the arrival transition fires when it reaches 0\. This gives each journey a reasonable minimum, a mode near the nominal hours, and a long tail for delays.

To add further realism, the net models outages in supplier’s own liquid production as discrete events. The production plant can experience an outage, on average every 90 hours (frequency exaggerated for visibility in simulation) and takes 24 hours to restart. While it is down, deliveries are dispatched from a more distant plant and increases each journey time by almost double.

This model captures the physical behaviour that the simpler nets cannot: tanks drain smoothly, pressure builds and vents in cycles, and journey times have realistic distributions rather than memoryless exponentials. What it does not capture is variability in the environment: customers always draw products at a constant contracted rate, and pressure boil-off does not vary with temperature.

## Truck fleet maintenance

SDCPNs can be used for truck fleet operators to solve their maintenance problem, in deciding when and where they should service each vehicle. The service must occur early enough to prevent a breakdown on the road, and late enough not to waste maintenance capacity. The maintenance schedule must ensure deliveries are still completed within the agreed window.

[In this example](https://drive.google.com/file/d/1hZnao98az5AYhOKSX1mf332PkxV-wwDn/view?usp=drive_link), the fleet operator has 8 trucks over three route classes: motorway (420 km, flat), urban (180 km, stop-start), and mountain (260 km, steep gradients). Loads are posted to a freight board at stochastic rates; if no truck collects one within 10 hours, it goes to a competitor. Each delivery has a time window (2.2× driving time): missing the window incurs a 30% revenue penalty, missing it entirely (breakdown mid-route) means losing the load and paying for recovery.

The depot has 2 service bays, 2 technicians, and a stock of spare parts. A truck that reaches a wear threshold is serviced (5 hours, resets to new). A truck that breaks down at the roadside needs a recovery vehicle, a tow, and a longer repair (12 hours, only partially restores condition). Both compete for the same bays, technicians, and parts.

Each truck is modelled as a coloured token carrying 19 fields of continuous and discrete colouring. The key mechanisms are:

* **Evolution of three wear components per truck governed by deterministic dynamics.** Brakes, engine, and tyres each degrade at different rates depending on the route. Brake wear accumulates 2.5× faster on mountain descents (heavy braking on gradients); engine wear increases when carrying load; tyre wear rises with road roughness and weather severity.

* **Breakdown as stochastic firing driven by the weakest component.** The roadside failure rate is set by whichever component is the most degraded. As degradation increases, the firing rate λ increases, so a truck with fresh brakes and fresh tyres but a worn engine fails at the engine's rate.

* **Road condition evolution governed by stochastic dynamics.** The same diffusion mechanism that models ambient temperature in the industrial gas supply chain is also used here to model the variations in driving conditions that a truck encounters on any given trip. Two state variables on each truck token represent this road conditions: road severity which multiplies all wear rates and fuel consumption and speed factor which impacts travel speed and therefore journey time.

* **Driver hours enforced through colour and guard.** Each truck token carries a running hours field, and a guard that prevents dispatch once it exceeds the legal limit. EU Regulation ([561/2006](https://eur-lex.europa.eu/eli/reg/2006/561/oj/eng)) limits drivers to 9 hours of continuous driving, so the model includes a compulsory rest stop at the depot for 11 hours before it can be dispatched again.

The model helps the operator understand the interactions between servicing policy, workshop capacity and dispatch rules in relation to fleet profitability whilst accounting for variability in weather and roads. The main simplification is that it models one depot with identical trucks and generic parts. A real operator has multiple depots, mixed-age vehicles, component-specific spares, and demand that varies with season.

## Semiconductor wafer fabrication

A semiconductor foundry processes batches of wafers (wafer lots) through 28 steps using shared machines. The same machine group handles multiple steps in the sequence, for example the same lithography group is visited at layers 0, 4, 9, 12, 16, 20, and 24, so wafer lots at different stages compete for the same machines.

The main trade-off is between throughput and yield. Machines degrade as they work, but taking one offline for maintenance backs up the production. Deferring maintenance increases the risk for breakdown or slow accumulation of defects that only becomes visible at final inspection.

For [this use case](https://drive.google.com/file/d/1EBTDhy2ffXbIaLOuozMas-sTVhOMYTOr/view?usp=drive_link) we modelled 16 chambers across 4 machine groups (4 lithography, 6 etch, 4 furnace, 2 inspection), 3 product types (logic, memory, analog) arriving stochastically, a capacity limit of 50 lots in progress, and 3 technicians shared between planned and unplanned work.

Each lot token carries its product type, current layer, cumulative defects, age, and a customer due date. Each machine token holds data on its condition, particle count, hours since maintenance, machine group, qualification level, and batch counter. The degradation mechanisms use the following SDCPN features:

* **Machine degradation is modelled as deterministic dynamics** that accelerate with contamination. When the machine crosses a threshold (default 0.85) it triggers preventive maintenance. The breakdown rate grows exponentially with condition, so a machine at 0.9 fails 8 times faster than a fresh one.

* **Microscopic particle contamination as stochastic dynamics.** Contamination fluctuates randomly but trends upward the longer a machine runs without maintenance.

* **Per-chamber process drift as stochastic dynamics.** Each chamber's process accuracy varies independently via a second diffusion process. Drift in either direction from zero increases defect rates. Maintenance recalibrates the chamber, but calibration is imperfect and each reset samples a small residual error. This means two chambers on the same tool can produce different defect rates even at identical condition and particle levels.

* **Defects at each step are sampled from a distribution when the processing transition fires.** The mean depends on the machine’s current condition, its particle count and process drift. A clean, well-calibrated chamber deposits few defects; a degraded, contaminated or drifted chamber deposits many. Defects accumulate across all 28 layers but the number of defects is only checked at final inspection.

To model the dispatch mechanism as close to the real world fabrications as possible, the net enforces all four of the below constraints simultaneously:

* **Machine-specific qualification.** Not every machine can run every product. Each machine carries a bitmask encoding which product types it is certified for.

* **Chamber-level recipes.** Processing time depends on the product being made. For example, a furnace step takes 5 hours at baseline; analog lots take 15% longer, memory lots 15% shorter. The same applies to lithography and etch steps.

* **Batch processing for furnaces.** Furnace steps require loading multiple lots before the chamber fires. Lots destined for a furnace layer enter a batch queue and are loaded one at a time into an available furnace chamber. In the model the furnace only starts when the batch reaches 4 lots, or after 3 hours if fewer are available.

* **Dynamic priority from customer due dates.** Each lot arrives with a due date. Between dispatch events, the lot's priority escalates continuously via dynamics. Priority is recalculated every 2 hours based on remaining time to deadline. A lot close to its due date is dispatched ahead of a lot with time in hand. Lots that exceed their due date by 30 hours trigger a deadline renegotiation, and the due date extends by one full cycle time and priority resets, representing the real-world practice of agreeing a new delivery window with the customer.

The model can help fabrication managers understand the interaction between maintenance policy,chamber calibration, batch sizing and in progress capacity in relation to yield and on-time delivery. The main simplifications are that each chamber processes one lot at a time and lots cannot be split for partial rework (lot-splitting). This means the model's absolute throughput figures are lower than a real foundry's , but relative comparisons between scenarios remain valid because all scenarios share the same simplification. Modelling lot-splitting would reduce the cost of contamination events by allowing partial recovery as a secondary effect, but does not change the fundamental question of when to maintain.

# BeyondEnsuring realistic simulations: guarantees and probabilistic claims

Running a simulation shows what’s expected to happen under a specific set of conditions. However, simulations don’t show what happens under untested conditions, nor is it guaranteed that simulations which are run are in any way representative of the real world. This section covers two kinds of claims that go beyond individual runs: structural guarantees that follow from the net's topology alone, and probabilistic claims built on sampling. Other parts of the SgAI programme are developing methods for reasoning formally about complex, compositional SDCPN models at scale; here we focus on what the net structure and simulation-based methods already provide.With these constraints in mind, Petri nets provide us with the ability to make certain additional claims.

## Structural guarantees

These come from the net's topology, arc weights and connections:

* **Reachability**. Can the system ever reach a specific state? For example: "is there any sequence of events that results in the tank being empty with no order on its way?" The check works by building the full graph of every state the net can reach from its starting state by firing every enabled transition and recording each new state. If the target state appears in that graph, it is reachable. If it does not appear , it is proven unreachable from the given starting state regardless of timing or ordering.

* **Coverability**. Reachability asks whether the net can reach a specified marking: the exact number and types of tokens in every place. Coverability asks whether the net can reach a marking that contains at least what you specify, while allowing additional tokens in any place. For example it answers the question, “Can there be at least 10 failed machines?", without specifying token counts for the other places.

* **Boundedness**. For any place in the net, you can determine the highest number of tokens it can ever hold by scanning every state in the full state graph and recording the maximum token count seen at each place. If the graph is finite, that maximum is the proven bound and can never be exceeded in any execution. If the graph cannot be completed (because some place grows without limit), the net is unbounded at that place, which usually signals a modelling error or a missing constraint. Conservation is a special case, where if a set of places always sums to the same total (e.g. items in storage \+ items in transit \= total inventory), then each place in that set is bounded

* **Liveness**. Can every transition fire at least once? A transition that never appears in the state graph is dead, either from a modelling error or a mechanism that is unreachable by design. Deadlock is the extreme case: no transition can fire and the system freezes.

These checks require a finite state space. Once tokens carry real-valued data (continuous levels, pressures, temperatures), the state graph cannot be exhaustively checked and these proofs do not apply directly. Extending formal guarantees to models with continuous state and stochastic dynamics is an open research problem, and one of the reasons the ARIA Safeguarded AI programme is investing in this formalism.

## Probabilistic claims

Once the model includes randomness, it produces distributions rather than single answers. An SDCPN produces probabilistic results differently from a conventional simulator in two ways:

* **The randomness is formal and inspectable.** Firing rates, lognormal durations, diffusion terms etc. are explicit components of the model specification. They can be inspected so a reviewer can read exactly what distribution governs each event. In a conventional simulator, stochastic behaviour typically lives in code scattered across event handlers.

* **Rare-event probabilities can be quantified.**  Some failures are too rare to observe in ordinary Monte Carlo, estimating a probability of 10⁻⁹ would need billions of runs. SDCPNs support acceleration methods ([importance sampling](https://doi.org/10.1109/acc.2011.5991305), [interacting particle systems](https://doi.org/10.1201/9781420008548.ch10)) that exploit the net's structure (strong Markov property) to estimate these probabilities efficiently.

## Tooling for scalable oversight

[HASH](https://hash.ai/) leads the “Interaction Paradigms” technical area (TA1.3) of the [SgAI programme](https://aria.org.uk/opportunity-spaces/trust-everything-everywhere/safeguarded-ai/). As part of this work, we’ve developed tooling to enable not only the modeling and simulation of complex systems as SDCPNs, but also AI that assists users in capturing their understanding of a domain while ensuring information relevant to a model or experiment isn’t missed or misrepresented. The same AI is also usable to help users understand complicated models developed by other people (or AI), and enables the precision editing, customization, and hierarchical use of existing models. This open-source tooling is available at [petrinaut.org](https://petrinaut.org), as well as integrated into HASH’s semantic graph platform ([app.hash.ai](https://app.hash.ai)). All of the interactive examples embedded in this post were built and run from [Petrinaut](https://petrinaut.org).

# Conclusion

As we’ve shown in this post, SDCPNs can be applied to virtually any cyber-physical domain: from industrial gas supply and truck fleet maintenance through to semiconductor fabrication, and the other use-cases we’re exploring as part of SgAI — with our own work predominantly focused on biopharmaceutical and chemicals manufacturing and logistics.

Each feature from the SDCPN formalism adds something new:

* A plain Petri net finds logical and structural failures like deadlocks

* Stochastic firing adds timing, so the model can quantify how often events like stockouts occur.

* Colour makes identity visible so fleet composition or product routing can be modelled.

* Continuous dynamics replace discrete approximations with differential equations for flows like gas levels, machine degradation and contamination.

* Stochastic dynamics helps to add the necessary real world noise, like environmental variability to the model.

Not only can SDCPNs represent these various interactions, but it can quantify the frequency, costs and conditions that trigger them, too. This kind of quantification is what will enable us to move away from a world of weak evals and assumptions to one in which AI can be used as a real-time decision maker in safety-critical, cyber-physical systems, backed by evidence and verification.
