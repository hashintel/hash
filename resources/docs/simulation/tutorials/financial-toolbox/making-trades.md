---
title: Making Trades
slug: simulation/tutorials/financial-toolbox/making-trades
description: "Write trading behaviors"
---

# Making Trades

## Random Strategies

In the simulation, every agent decides whether to trade at every time step. We can write a script to use a strategy to compute a trade, where trade and the price at which the trade is made are set by the script.

[strategy_random.js excerpt]

In the simplest case, we can trade according to a completely random strategy, as shown above. To make a trade, we simply set the parameters **trade**, **price** and **trade_partner** as part of the state. The underlying simulation code will make the trade between our agent and its trade partner, and update both agents' portfolios.

## Rational Strategies

We can make a slight modification to the random strategy by only making the trades that are rational from each agent's point of view.

[strategy_rational.js excerpt]

The trades are still generated at random, but we only make the trade if the **neighbor’s stored_price** is less than our agent’s portfolio **stored_price** for a particular security. In short, this trading strategy only makes rational trades.

## Options Trading Strategies

Alternatively, we can trade by making use of the Black-Scholes equation. We can make trades on options that have a maturity **time** that is set at some point in the future. In our example, for simplicity, we are still setting most of the parameters randomly.

[strategy_options.js excerpt]

We use the Black-Scholes equation to value the options based on parameters including their strike price, current underlying price, maturity date, volatility and the real rate of interest. We only make the trade if the Black-Scholes price is less than the other agent’s price.

## Write your own strategy

To write your own strategy, all you have to do is write a new behavior file in JavaScript, modeled on the strategies written above. The agent’s behavior should take in a **state** and **context** as input, and use **context.neighbors()** to view the agent’s neighbors which will be its trading partners.

The agent can only modify its own **state**. To learn more about how behaviors work, we recommend you check out the [docs](https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent).

To make a trade, simply set the parameters **trade**, **price** and **trade_partner** using your own code, and add it to the array **state.trades**.

[globals.json excerpt]

To use the strategy, include it in the globals.json file in the array strategies. You should also use the strategy_colors array to set a color to view the strategy as its adopted in the 3D viewer.