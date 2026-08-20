

|  | Domain | Physical system | Cyber component | Pros | Cons |
| ----- | :---- | :---- | :---- | :---- | :---- |
| 1 | **Data Center Operation** | Electricity flow, cooling |  | Commercial |  |
| 2 | **Outpatient Care** |  |  | NHS opportunity/Dora’s partner; Human-centric CPS |  |
| 3 | **Warehouse Automation** | Robots, shelves, packages | Task allocation | Easy to visualize, 3D |  |
| 4 | **Air Defence System** | Aircraft trajectories | Air traffic control | Safety-critical concurrency |  |
| 5 | **Intelligent Cellular Network** |  |  |  |  |
| 6 | **Truck Fleet Predictive Maintenance** |  |  |  |  |
| 7 | **Production Scheduling *Optimization*** |  |  |  |  |
| 8 | **Stock Replenishment *Optimization*** |  |  |  |  |

Notes on each pasted from ChatGPT:

# Car/Truck Fleet Predictive Maintenance

Imagine a logistics company operating hundreds or thousands of delivery vans and trucks. Each vehicle continuously reports its condition, enabling maintenance to be scheduled before failures occur while minimizing disruption to deliveries.

### Physical layer

* Fleet vehicles (cars, vans, trucks)  
* Engines and drivetrains  
* Braking systems  
* Tyres  
* Batteries (electric or conventional)  
* Maintenance depots and repair facilities  
* Road network and operating environments

### Cyber layer

* Vehicle telematics  
* On-board diagnostics (OBD)  
* Predictive maintenance algorithms  
* Fleet management system  
* Maintenance scheduling  
* Route optimization  
* Parts inventory management  
* Driver reporting system

### Events

* Vehicle begins journey  
* Engine fault code detected  
* Brake wear threshold exceeded  
* Tyre pressure warning issued  
* Vehicle returns to depot  
* Maintenance scheduled  
* Replacement part unavailable  
* Unexpected component failure  
* Vehicle removed from service  
* Maintenance completed

### Continuous state

* Engine temperature  
* Oil condition  
* Battery state of health  
* Brake pad wear  
* Tyre tread depth and pressure  
* Fuel or battery consumption  
* Vehicle mileage  
* Component vibration  
* Predicted remaining useful life (RUL)

### Interesting emergent behaviour

* Vehicles operating on rough roads experience accelerated suspension and tyre wear compared with identical vehicles on urban routes.  
* A delivery vehicle develops abnormal vibration patterns, allowing bearing failure to be predicted weeks before a breakdown occurs.  
* Multiple vehicles require servicing simultaneously, forcing maintenance schedules to balance workshop capacity against delivery commitments.  
* Delaying maintenance on low-priority vehicles increases the probability of roadside failures, while performing maintenance too early wastes component life.  
* A shortage of replacement parts requires the fleet manager to dynamically reprioritize maintenance across the fleet.  
* Seasonal demand peaks reduce opportunities for maintenance, increasing operational risk until workloads decrease.  
* Real-time vehicle health data enables routes to be reassigned, preventing vehicles with emerging faults from being stranded far from maintenance facilities.

This demonstrates:

* continuous degradation of physical assets  
* condition-based and predictive maintenance  
* data-driven decision making  
* optimization under resource constraints  
* interaction between operational planning and maintenance scheduling  
* uncertainty in component failures  
* concurrent management of large vehicle fleets

---

This example is particularly effective because it combines physics (component wear and degradation), real-time sensing, predictive analytics, and operational decision-making. The cyber system must continuously estimate each vehicle's health, predict future failures, and coordinate maintenance without unnecessarily disrupting fleet operations. It showcases SDCPNs' ability to model systems where continuous degradation, stochastic failures, resource allocation, and logistics interact over long time horizons.

# Intelligent Cellular Network

Imagine a mobile network operator dynamically adapting its cellular infrastructure to meet changing demand as people move throughout a city. Cell towers are powered up, placed into low-power modes, or reconfigured in anticipation of demand, balancing quality of service against energy consumption.

### Physical layer

* Cellular base stations (macro cells and small cells)  
* User devices (phones, tablets, IoT devices)  
* Radio coverage areas  
* Data traffic over wireless channels  
* Electrical power supplied to base stations  
* Geographic distribution of users (homes, offices, transport hubs, stadiums)

### Cyber layer

* Network management and orchestration  
* Traffic demand forecasting  
* Mobility prediction  
* Load balancing  
* Cell activation/deactivation controller  
* Handover management  
* Energy optimization algorithms  
* Network performance monitoring

### Events

* Morning commute begins  
* Large public event starts  
* Train arrives at a station  
* Cell becomes overloaded  
* Additional cell activated  
* Cell enters sleep mode  
* Network fault detected  
* Backhaul link failure  
* Emergency demand surge  
* Major event concludes

### Continuous state

* Number and distribution of connected users  
* Data throughput  
* Cell utilization  
* Signal strength and interference  
* Base station power consumption  
* Network latency  
* User mobility patterns  
* Predicted traffic demand

### Interesting emergent behaviour

* Morning commuters create a moving corridor of high network demand, with capacity progressively shifting from residential areas to business districts.  
* A football match or concert causes thousands of users to concentrate within a single coverage area, requiring dormant small cells to be activated before congestion occurs.  
* As office workers leave for the evening, traffic shifts back toward residential suburbs, allowing underutilized city-centre base stations to enter low-power sleep modes.  
* An unexpected incident (such as severe weather or public transport disruption) causes large deviations from predicted movement patterns, forcing rapid network reconfiguration.  
* A base station failure causes neighbouring cells to expand their coverage, increasing load and triggering further adaptive resource allocation.  
* Temporary communication failures between controllers lead to localized optimization decisions that must later be reconciled across the wider network.

This demonstrates:

* human mobility driving physical system dynamics  
* predictive decision making under uncertainty  
* distributed resource allocation  
* continuous demand estimation  
* adaptive infrastructure management  
* energy-performance trade-offs  
* large-scale concurrent operation  
* resilience to failures and unexpected events

---

This is a particularly compelling SDCPN example because it couples human behaviour, communication infrastructure, continuous traffic dynamics, and discrete control decisions. Unlike many CPS examples where the physical dynamics arise from machines or vehicles, here the driving force is the stochastic movement and behaviour of large populations, making it an excellent demonstration that SDCPNs can model systems where cyber decisions adapt continuously to changing human activity. It also illustrates an important optimisation objective that is easy for a non-technical audience to grasp: *providing enough network capacity where and when people need it, while minimizing the energy consumed by thousands of cell towers.*

# Autonomous Warehouse

Imagine a fully automated fulfilment centre where robots retrieve products, conveyors transport packages, and software coordinates thousands of simultaneous tasks.

### Physical layer

* Mobile robots  
* Conveyor belts  
* Storage shelves  
* Packing stations  
* Charging docks  
* Inventory  
* Human maintenance staff

### Cyber layer

* Warehouse management system  
* Inventory database  
* Robot fleet scheduler  
* Route planner  
* Task allocation  
* Collision avoidance  
* Predictive maintenance

### Events

* Customer order received  
* Robot assigned task  
* Package picked  
* Conveyor jam detected  
* Robot battery low  
* Charging dock becomes available  
* Inventory replenished  
* Equipment failure

### Continuous state

* Robot position and velocity  
* Battery charge  
* Queue lengths  
* Conveyor speed  
* Inventory levels  
* Order completion times

### Interesting emergent behaviour

* Several robots converge on the same aisle, creating congestion.  
* Charging stations become a bottleneck during peak demand.  
* A conveyor failure causes robots to dynamically redistribute work.  
* High-priority orders interrupt normal scheduling.  
* Inventory shortages require alternative fulfilment strategies.  
* Robot failures trigger automatic task reassignment to maintain throughput.

This demonstrates:

* multi-agent coordination  
* continuous robot motion  
* concurrent task execution  
* dynamic scheduling  
* resource contention  
* fault-tolerant operation

# Smart Hospital (ChatGPT-original, superseded by Outpatient Care)

Imagine a large hospital where patients, staff, medical equipment, and digital systems continuously coordinate to deliver care.

### Physical layer

* Patients  
* Doctors and nurses  
* Ambulances  
* ICU beds  
* Operating theatres  
* Medical equipment  
* Pharmacy inventory

### Cyber layer

* Electronic health records  
* Patient monitoring systems  
* Triage decision support  
* Operating theatre scheduling  
* Bed management  
* Medication dispensing  
* Hospital communications

### Events

* Patient admitted  
* Emergency ambulance arrives  
* Surgery completed  
* ICU bed becomes available  
* Laboratory result received  
* Medical device failure  
* Patient deterioration detected  
* Staff shift changes

### Continuous state

* Heart rate  
* Blood pressure  
* Oxygen saturation  
* Medication concentration  
* Bed occupancy  
* Waiting times  
* Staff workload

### Interesting emergent behaviour

* Multiple emergency patients arrive simultaneously.  
* ICU capacity becomes exhausted.  
* A ventilator failure requires rapid patient transfer.  
* Delayed laboratory results postpone treatment.  
* Staff shortages increase waiting times across multiple departments.  
* Hospital systems reprioritize surgeries following a major incident.

This demonstrates:

* human-in-the-loop decision making  
* stochastic arrivals  
* resource allocation  
* interacting workflows  
* safety-critical monitoring  
* adaptive scheduling

# Smart Power Grid

Imagine a modern electrical grid integrating renewable generation, battery storage, conventional power plants, and millions of intelligent consumers.

### Physical layer

* Transmission and distribution lines  
* Solar farms  
* Wind turbines  
* Conventional generators  
* Battery energy storage systems  
* Consumer and industrial loads

### Cyber layer

* Grid monitoring (SCADA)  
* State estimation  
* Demand forecasting  
* Generation scheduling  
* Automatic protection systems  
* Distributed energy management  
* Market and pricing systems

### Events

* Sudden increase in electricity demand  
* Renewable generation drops unexpectedly  
* Transmission line fault  
* Generator trips offline  
* Battery storage activated  
* Protective relay disconnects equipment  
* Demand-response programme initiated  
* Cyber communication failure

### Continuous state

* Power flow  
* Voltage  
* Frequency  
* Generator output  
* Battery state of charge  
* Consumer demand

### Interesting emergent behaviour

* Cloud cover causes a rapid reduction in solar generation.  
* Batteries coordinate to stabilize frequency.  
* Multiple faults isolate part of the network.  
* Demand-response reduces peak loading without interrupting service.  
* Communication delays cause distributed controllers to make conflicting decisions.  
* Equipment failures propagate into cascading outages unless protective systems intervene.

This demonstrates:

* hybrid physical dynamics  
* distributed optimization  
* fault detection and recovery  
* concurrent infrastructure operation  
* stochastic renewable generation  
* resilience under failures

# Autonomous Vehicle Fleet

Imagine a city-wide fleet of autonomous taxis transporting passengers while coordinating with one another and the surrounding transport infrastructure.

### Physical layer

* Vehicle motion (position, speed, acceleration)  
* Road network and intersections  
* Traffic flow  
* Pedestrians and cyclists  
* Battery charge and charging stations  
* Weather and road conditions

### Cyber layer

* Vehicle perception (camera, lidar, radar)  
* Localization and mapping  
* Route planning  
* Collision avoidance  
* Fleet management system  
* Vehicle-to-vehicle (V2V) and vehicle-to-infrastructure (V2I) communication

### Events

* Passenger requests ride  
* Obstacle detected  
* Traffic accident reported  
* Charging station becomes available  
* Vehicle enters autonomous/manual mode  
* Sensor fault detected  
* Communication link lost  
* Emergency vehicle approaches

### Continuous state

* Vehicle position and velocity  
* Battery state of charge  
* Sensor confidence  
* Traffic density  
* Estimated arrival times

### Interesting emergent behaviour

* Several vehicles compete for the same charging station.  
* Traffic congestion causes fleet-wide rerouting.  
* Sensor degradation forces reduced-speed operation.  
* Temporary communication loss causes vehicles to operate independently.  
* Road closures trigger dynamic replanning across the fleet.  
* Emergency vehicles receive priority through coordinated routing.

This demonstrates:

* continuous vehicle dynamics  
* distributed decision making  
* probabilistic perception  
* adaptive planning  
* networked coordination  
* resource allocation

# Air Defence Network

Imagine defending a city or military base from multiple incoming aircraft or drones.

### Physical layer

* Aircraft and drone trajectories  
* Radar line-of-sight  
* Missile or interceptor flight  
* Weather affecting sensors

### Cyber layer

* Radar processing  
* Target tracking  
* Threat classification  
* Interceptor assignment  
* Communication between radar sites  
* Human authorization

### Events

* Radar detects object  
* Target disappears  
* Sensor failure  
* Communication outage  
* Interceptor launched  
* Target intercepted

### Continuous state

* Position  
* Velocity  
* Fuel  
* Radar confidence

### Interesting emergent behaviour

* Two radars disagree.  
* Communications fail.  
* Several drones appear simultaneously.  
* Resources become exhausted.  
* A false alarm wastes an interceptor.  
* Human approval delays engagement.

This demonstrates:

* distributed sensing  
* decision fusion  
* probabilistic uncertainty  
* real-time control  
* human-in-the-loop decisions

