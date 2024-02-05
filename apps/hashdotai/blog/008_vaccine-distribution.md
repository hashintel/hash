---
title: "Modeling Vaccine Distribution"
date: "2020-12-18"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/9bafb530-164e-496c-62da-ae7b874c3400/public
categories: 
  - "Simulation"
  - "Topic > Public Health"
  - "Topic > Policy"
---

In a true feat of modern medicine, at least three working COVID-19 vaccines have now been announced by pharmaceutical giants. Multiple countries have approved them for use, and now that one challenge has been overcome, governments around the world will have to contend with new problems which exist outside of the laboratory:

1. With constraints on manufacturing and logistics, which demographic cohorts should be inoculated first?
2. Once the vaccine is being produced in large enough quantities, how will decision-makers solve the challenge of distributing it throughout both densely populated urban areas and rural communities? Since these vaccines are challenging (to differing degrees) to store, and distribution cannot only happen at locations where vaccines are stored, a multi-step supply chain is needed.
3. How will local communities maintain their supply chain when distribution and storage cannot occur most efficiently in the same locations?

![](images/banner.png)

We’ve constructed a HASH simulation to help understand these complexities. You can [find it on hIndex](https://hash.ai/@hash/vaccination-supply-coordination) and follow along. A simulation like this interactively allows community decision-makers explore multiple distribution plans and make quantitative decisions to preempt scenarios where not enough vaccines are delivered, or too many vaccines are perishing due to storage challenges.

<iframe style="position: absolute; top: 0; left: 0;" src="https://core.hash.ai/embed.html?project=%40hash%2Fvaccination-supply-coordination&amp;ref=stable" scrolling="auto" width="100%" height="100%" frameborder="0"></iframe>

# The Model

This [Vaccine Supply Coordination model](https://hash.ai/@hash/vaccination-supply-coordination) is an extension of our [Flexible Supply Chain model](https://hash.ai/@hash/flexible-supply-chain). It simulates the distribution of a vaccine on an hourly scale to a community through three different types of agents: distribution centers, medical facilities, and a vaccine source.

![](images/sim.png)

#### The Agents

There are three types of agents in the model. In our example  they are all initialized in random locations across the simulation grid. Real-world policymakers may choose to use actual location data in conjunction with HASH’s [geospatial](https://docs.hash.ai/core/views#geospatial) functionality. 

- Distribution centers represent locations at which vaccines are being regularly administered to the public, but which lack the ability to store vaccines at their required conditions. These locations may be schools, workplaces, and mobile vaccination clinics. Distribution centers are much more numerous and accessible to people in the community than medical facilities are.

![](images/distributor.png)

Distribution centers, with a green bar whose height represents the current stock of usable vaccines

- Medical facilities are locations which have the resources and capability to store large quantities of vaccines at the proper conditions. These facilities may include public pharmacies, hospitals, and other large healthcare organizations and clinics. These facilities are far less common and accessible to people in the community.

![](https://lh4.googleusercontent.com/qN6TMi8BID5ll8aKdyGsol7vYwYLncsppZqgYqjzzV7QdHxecF5tpazz2mOq2887ja9lvbubeDeIRVt_cKBTgX2BM0hQDGGhrKnkkZ_xMYNvrtD-obnYBxD-WPaiQZ9L3YlCizEa)

Medical facilities, with a blue bar whose height represents the current stock of stored vaccines

- The vaccine source represents the incoming supply. Since we’re interested in exploring the challenges of effective distribution even when supplies are not limited, the amount of vaccines available is not throttled.

![](https://lh6.googleusercontent.com/lQDHhzCSpzcCVrzZdBIf_Nas4nv3ZyDfHxnTXfZ20QLrIPIokc2z3kwQAmUkRHeI2PIlI3ZmWfJeGKcn8cQtSEq7MHkYtWziDvObhH9u1dhLo3deJ1wc3wKlEYz5L8FRrrgChjj6)

#### **The Supply Chain**

Because this simulation is based on the [Flexible Supply Chain](https://hash.ai/@hash/flexible-supply-chain) model, a key built-in feature is the ability for certain agents to source from and deliver to multiple different destinations.

Distributors place orders in an attempt to match the average demand for vaccines that they are observing. They track the number of patients that attempt to receive a vaccine each day and attempt to order an amount equal to that daily count multiplied by the `avg_order_ratio` scaling factor, located in the **globals.json** file. This factor represents how conservative the model is being, in an attempt to minimize unused vaccines perishing.

Distributors select a medical facility to source from based on two factors: minimizing the distance from its location, and maximizing the facility’s current level of stock. Agents will reassess these considerations each time they place an order.

![](https://lh6.googleusercontent.com/IIvmRX7xbu_EvV_d80r11642G_5tMp7yQVNWVJgRWyG093JXGNdKSSJPy_r869o8CTBb1FZwH9P0-ml5rwEJ_fbHzndKQFtBrzx1xJvrvgy-03458tHi4Mvy6iyRlLKIZpCgc8qT)

Global variables that determine simulation behavior

Medical facilities place orders in an attempt to maintain a certain level of stock, determined by the `desired_stock` global variable. They can only order in batches of 5000 doses. When they order they simply attempt to make up the difference between their current and desired stock.

In this simulation, we’ve increased the realism of the model by restricting the timing of ordering and delivering. Medical facilities may only place orders once every week, and receive their order at the beginning of the following week. Distribution centers must place their order before the afternoon, and only receive it at the beginning of the following day. We use the **@hash/counter/counter.rs** and **week\_counter.js** behaviors to track this timing, and the **calculate\_order.js** behavior to impose restrictions.

#### **Vaccination Behavior**

Demand is generated with a Poisson distribution representing patient arrivals. Each distribution center is generated with a different arrival rate, based on a lognormal distribution to better approximate typical population patterns.

The **vaccination.js** and **perish.js** behaviors reduce the stock of vaccines at distribution centers. The perish behavior causes a distributor to lose all unused vaccines at the end of the day, while the vaccination behavior handles the vaccination and patient throughput, which is determined based on the staffing of the location. Understaffed locations request personnel transfers from locations that are able to meet and exceed their current patient demand levels. Overstaffed locations always comply with these requests.

## Experimenting With Our Model

For this simulation, we’re going to use experiments to understand the effects of certain distribution choices. We’ll try to understand the tradeoff between maintaining larger amounts of stock in order to ensure that the rate of vaccinations can remain as high as possible, and attempting to minimize costs, storage needs, and perished vaccines.

![](https://lh5.googleusercontent.com/myiyb8oCMt6r1jFJG5F7XSkJjEXOnIkgAN2c8Vaz6Y78rx0vxnQ-dRY5e8BX4NYWScJS2OOpXWM841sG5LQb6hFkUHX8-SodoxtaIgNpOn10PQYd6Sv7GlPMG3_EagfECovoihhh)

Experiment definitions in hCore

#### **Distributor Ordering Decisions**

The first question we’d like to answer is how conservative the distribution centers should be when placing their daily orders for vaccines. This is determined by the value of the `avg_order_ratio` global variable. A value of 1.0 would mean that the location orders enough vaccines to exactly match the average demand it sees. Lower values would represent a more conservative choice, since it attempts to ensure that no vaccines go to waste at the end of the day. 

We’ll define an experiment that runs our simulation for 1000 steps (or roughly 100 days) that sweeps that value from 0.8 to 1.2, and attempt to find an optimal value. We’ll attempt to minimize two negative metrics: the number of vaccines that perish and the number of people who attempt to receive a vaccine but are turned away. By plotting the two metrics against each other we can create a tradeoff curve.

![](https://lh4.googleusercontent.com/_KoOn4S4wWnNwQq3tzARlPGXwSWyVfLJBA1ST32H3mtq8096v5zOrQNkFihkDAZakUecchUlqU9ljZxoj2e-O_IUczt7juHDYxKdiTWkmo2ldXpabPlFQf6Z58vlL0pRgzPMErun "Chart")

Plotting the tradeoff between patients turned away and vaccines perished

There is no clear visual answer as to the best `avg_order_ratio` value, but our simulation clarifies  what quantitative tradeoffs exist in this scenario. If decision-makers decide to place a premium on letting very few vaccines go to waste, then they might choose to use a value of 0.8, accepting that vaccination will not necessarily proceed as quickly in this scenario.

If decision-makers are interested in coming to a more optimized solution, they might take a look at a different graph. By plotting each metric individually we can see that a value around 0.9 or 0.95 for `avg_order_ratio` ensures that it reduces both of our chosen metrics to around 25% of their maximum possible values, a huge improvement over some of the edge cases. We’ll set `avg_order_ratio` to 0.95 in our **globals.js** file, representing a slightly conservative answer to our original question, and continue with our next experiment.

![](https://lh4.googleusercontent.com/3wrvax7oj4JZLSBCeAuw0EidQH_xO_gHc029aCf_s4d93cb7hRVDb_Iv8qWfSKPeWG3eXuHFlDAIbWIdxLbYdj4IDb8HdGe4BachkLhPqmAOYtDAd9mFYpdsL1Bdl47b-Qn9NJfy "Chart")

#### **Medical Facility Ordering Decisions**

The second question we’d like to answer for this particular community is what level of stock medical facilities should try to maintain. To find an answer, we can run a sweep of the `desired_stock` global variable and see how it affects the negative metrics of our simulation.

Our sweep from 10,000 to 40,000 seems to show a distinct change in behavior in the very lowest value. Most of the runs produce a similar plot to the one below, which was generated with a desired stock of 15,000. We see constant rates of patients turned away and vaccines perishing.

![](https://lh6.googleusercontent.com/_TRh7X64_H14OU7oYCmm9Zum3G2W95yl3WeBcCZIaRYe9Z-DEPlQ3IfIDE13ibE4gWEhchVelDRGysVDsnEitPofzGTV8V4secdNCh_uX27qU_s221BqA-VPgbcfBi5TEgZbk3Y0)

Tracking the total number of patients turned away, and vaccines that have perished

However, when the desired stock is set to 10,000 the simulation hits an inflection point and the rate of patients being turned away increases drastically.

![](https://lh4.googleusercontent.com/K_ztwabFvfH-H4JNgfXQmen4WQLivPBOVe4SwsmhvVnWuLT5oUJnPoYgVIMmKXMHdtoZ_H1wSck9qABVSR3n10qvPMXz-40CsNLhsVrZDuX7Pq4Gg49EY21LgUFxAgPlwhr7hyez)

A distinct shift in behavior when desired stock is set to 10,000

To find the optimal value, we’d like to minimize the desired stock as much as possible to reduce the costs for vaccine transport and storage. Refining our experiment by zooming in on the range from 10,000 to 15,000 lets us see that we can even bring the desired stock down to 11,000 without seeing the sharp increase in undersupplied distribution centers.

We’ve managed to optimize two of the essential variables that determine the behavior of this system, and can influence planning and implementation of a vaccine roll-out in this community.

## Fork It

There are many other parameters that can be adjusted in this model. You can drastically change the outcome by adjusting the ratio of distribution centers to medical facilities, which could reflect the differences between affluent and poorer communities. If you want to try it out, simply [open up the model in hCore](https://core.hash.ai/@hash/vaccination-supply-coordination/stable), and fork the simulation by pressing `Cmd` + `S` (on Mac) or `Ctrl` + `S` (on PC).
