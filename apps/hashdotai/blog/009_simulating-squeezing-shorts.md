---
title: "Simulating Short Squeezes"
date: "2021-01-29"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/745d008d-68cf-4f68-86ee-ca02e79ced00/public
categories: 
  - "Simulation"
  - "Topic > Finance"
---

We wanted to demonstrate the dynamics of the Battle of GameStop™ so we [put together a simualtion](https://hash.ai/@hash/short-squeeze) of the sharp escalation of price that can occur when an irresistible force (legally needing to cover your shorts) meets an immovable object (the combined will of thousands of Redditors). 

## About this simulation

Our simulation is made up of a mix of different agents - shorts that need to cover their positions before expiration, shareholders who are long the stock in question and will sell at normally-distributed prices, and diamond-hand-never-fold traders who won’t sell until the squeeze is done (at/or near an expiry data for a high price).

In the first scenario the shorts are buying from a relatively liquid market. They can offer low starting prices and gradually increase/decrease their price to match the desired price of shareholders, who slightly adjust their prices based on market conditions. Most of those shareholders don't want to miss out on an opportunity to sell, so once a certain portion of the shorts are covered, they will try lowering their price to ensure a trade. Due to this lowering of prices, the shorts can easily collect the shares they need.

Open [the simualtion](https://hash.ai/@hash/short-squeeze) in hCore, and the "Run" icon in the simulation (the runner at the bottom). The simulation will automatically stop after 100 steps. **You'll see a plot of the current selling and asking prices and the number of uncovered shorts.**

However, if there is a large enough percentage of agents who won’t sell, and the market, losing liquidity, forces the shorts to bid the price up, you can see the price skyrocketing to the desired reserve price of the traders, successfully squeezing the shorts.

## A Collective Action Problem

In the next scenario, we've designated a certain portion of agents, determined by the `hold_out_ratio` parameter, that won't ever lower their sell limit. In this simulation, the price initially drops as low-priced shares are purchased, but then eventually goes parabolic when faced with a large number of traders that won't sell.

Raising and lowering the `hold_out_ratio` parameter can manipulate the likelihood and intensity of a squeeze.

Experimenting with different compositions of agents can create dramatically different outcomes. You can [open the full model in HASH](https://hash.ai/@hash/short-squeeze) and run one of the pre-built experiments to see, or try tinkering yourself.

An interesting aspect of all of this is the collective action problem facing the shareholders, highlighting how strange and difficult this type of distributed short squeeze is to pull off. At the end of the day this boils down to a game theory problem like [the Prisoner's dilemma](https://hash.ai/@hash/prisoners-dilemma) (another fun model to simulate). Shareholders and traders both benefit from working together and not selling shares until the shorts legally are forced to cover, because they can each sell back one share at a very high price, more than they might gain by selling normally. However, if some of them defect, and sell back early, those traders will profit but the rest will be left out in the cold. By selling early and  'locking in the gains' they leave the rest of the shareholders holding nothing but the bag.

In our simulation we model this as different preferences for the selling point. If they are tightly grouped together at the top, or set such that they won't sell, the price goes vertical, representing the shareholders coordinating and putting the squeeze on the short. If there are more normal shareholders, or if some percentage of traders change their preferences and sell early, the squeeze doesn’t happen and the price collapses.

## Extending the model

This is but one demonstration of the GameStop trading dynamic - there are a lot more aspects to model. Here’s hoping more incredibly-stupid-and-yet--maybe-not finance happens tomorrow.
