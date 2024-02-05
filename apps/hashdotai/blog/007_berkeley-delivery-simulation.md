---
title: "Berkeley Delivery Simulation"
date: "2020-12-11"
categories: 
  - "uncategorised"
---

_Simulation-based digital twin for complex real-world traffic modeling_

Using HASH, students from the University of California, Berkeley, have built a [traffic simulation of delivery-cars](https://hash.ai/@jacksonle/demandtest) in the city of Berkeley to predict the efficiency of delivery services and the impact on street congestion.

![img](https://lh5.googleusercontent.com/9p0bqUKWtV0X5QPkJGkD6ymx1NY6QX_7moZ90Hmku2bPxFk4S77-wYbwu4r8atN8LcyfDjSEgKn_xmSCq0_vvCVl4T1fdINkVrpVoDiFYb0XtCvIi3kTSiCld3TOgGonhLJkESBM)

_Visualization of the simulation - delivery cars (in blue) go from the restaurant and stores (in red), to the households (in yellow), according to a Poisson distribution of needs._

The model simulates deliveries in the Berkeley area through a combination of real world data and customizable agents:

- Store locations are scrapped from Yelp
- Home locations are generated from a random distribution with family sizes pulled from the census data. 

Delivery agents move between locations, responding to requests from homes and stores. This results in increased traffic, the costs of which are captured and displayed. The scalability and flexibility of the model allows for simulations to be generated for different cities easily.

https://www.youtube.com/watch?v=iGzDB5-Ub-8&feature=emb\_logo

Simulation driven modeling of traffic congestion and navigation routing is a promising approach to more robust traffic prediction, and a potentially high leverage tool for city planners and companies to model what-if scenarios.

Check out their [website](http://hashaiproject.pythonanywhere.com) for more details. Credit: Anton Bosneaga, Jackson Le, Malo Le Magueresse, and Peter Zhu.
