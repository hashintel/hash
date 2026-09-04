### Chemicals batch production optimisation

- **Scenario:** batch production plant
    - Tokens = raw material, workers, production equipment, batches
    - Transitions = process steps with stochastic durations, changeovers (switching production from one to another), breakdown/repairs.
- **Objective**: maximise profit (output revenue − notional cost of provisioned tokens); optimiser finds the allocation that maximises output without over-provisioning idle resources.
- **Experiment questions:**
    - What's the best setup? Find me the number of workers, machines, and materials that makes the most profit
    - If I run with this setup, what does my output look like hour by hour, and how much half-finished work piles up along the way?
    - What's the chance I get all my orders out the door by Friday?
    - How bad does the backlog get at its worst, and what time of day does that happen?
    - What changes if I have 3 machines vs. 4 vs. 5? And does machine count actually matter more than changeover time?
    - Scenario A or B, which one is genuinely better, given the same seed / randomness?

### Logistics shipment orchestration / Pharma cold chain

- **Scenario:** multi-party shipment flow with customs clearance, carrier handoffs, transport legs, proof of delivery.
    - Tokens = shipments (colour: SLA clock, temperature history for the cold-chain variant), vehicles
    - Transitions = handoffs, legs, clearance
    - Parameters = lane lead-time distributions, SLA hours.
- **Objective:** maximise on-time delivery while minimising spoilage/write-offs and expediting cost
- **Experiment questions:**
    - What's the chance a shipment on this lane misses its SLA?
    - How long does delivery take on each route, typically and on a bad day?
    - When one leg runs late, how far does the delay ripple down the chain?
    - A shipment is trending towards spoilage (e.g. temperature increasing, stuck at customs), is it better to reroute or hold it?
    - Which matters more: customs clearance delay variability or transit time?
    - (Cold-chain) What's the chance this batch has a temperature excursion before delivery, and how much potency does it lose on the way?
    - Show me the worst delivery in the whole experiment,wh what actually went wrong on that run?

### **Supply chain disruption response (reactive / acute)**

- **Scenario:** supply network under disruption
    - Tokens = stock/batches, outstanding orders, transport capacity
    - Transitions = production, transport legs, allocation to markets; a disruption = a lane or supplier's rate dropping to zero; each response (expedite, reallocate, switch source, do nothing) = a scenario variant of the same net
- **Objective:** pick the response action that minimises stock-outs and total cost, without shifting the problem onto other products sharing the same resources.
- **Experiment questions:**
    - If I do nothing, what's the chance each market runs out of stock and when?
    - How long until the network recovers under each response option?
    - Expedite vs. reallocate vs. switch supplier, which action gives best outcome?
    - Does fixing this product's supply make things worse for the other products that share the same lines and lanes?
    - Show me the run behind that recommendation so I can sanity-check it.

### **Proactive supplier management**

- **Scenario:** supplier network with worsening/improving performance
    - Tokens = suppliers (health as colour), purchase orders, material batches, demand
    - Transitions = place order, ship (speed depends on supplier health), inspect, degrade/improve, remediate, qualify backup supplier
- **Objective:** keep supply stable and quality acceptable at the lowest cost, acting before a degrading supplier becomes a crisis.
- **Experiment questions:**
    - If this supplier keeps deteriorating at the current rate, when does it start hurting my production?
    - If I switch volume to the backup supplier, what's the chance the switch itself interrupts critical supply?
    - How much does switching cost, and how long does it take to complete?
    - Stick and remediate vs. switch, which is better?
    - [Live mode] Watch the supplier's delivery and quality data and flag them before they become a problem, then feed the learned rates into the net.

### **Airport ground operations**

- **Scenario:** aircraft turnaround
    - Tokens  flights, stands, gates, fuel trucks, baggage crews
    - Transitions = turnaround steps, stochastic arrival delays propagate through shared resources (e.g. stands, gates etc)
- **Objective:** minimise knock-on delays with the fewest crews and stands.
- **Experiment questions:**
    - How do delays build up over the day, and what's the range between a good day and a bad one?
    - If a flight lands 30 minutes late, what's the chance it causes a knock-on delay of more than 15 minutes?
    - How full do the stands get at peak, and when does this happen?
    - What changes with 5 baggage crews vs. 6 vs. 7?
    - What's the best crew allocation across the day's schedule?
    - The flight is half way through turnaround, predict when it will leave the stand / depart

### **Energy & utilities maintenance scheduling**

- **Scenario:** maintenance scheduling on a shared crew pool
    - Tokens = maintenance jobs, crews, assets
    - Transitions = dispatch, travel, repair (stochastic durations); outage windows gate when work can run; backlog queues when crews are busy
- **Objective:** clear the maintenance backlog without overrunning into peak-demand windows.
- **Experiment questions:**
    - How does the maintenance backlog evolve over the season with this crew count?
    - What's the chance a job overruns into a peak-demand window?
    - What changes with 4 crews vs. 5 vs. 6 etc?
    - What's the best allocation of crews to regions for this quarter's plan?

### **Process mining + conformance checking**

- **Scenario:** the customer has event logs but no model. Learn the net structure from the logs, then learn the rates, then check live traces against the learned net on an ongoing basis.
- **Objective:** model an accurate and simulatable net from observed data
- **Live mode / observed data questions:**
    - Here are six months of event logs, what does our process look like?
    - How fast does each step really run (vs. what the planning system assumes)?
    - Is the live process still behaving like the model, or has it drifted?
    - Which real traces deviate from the discovered process, and where?
