---
title: Making Trades
slug: simulation/tutorials/financial-toolbox/making-trades
description: "Write trading behaviors"
---

# Making Trades

## Random Strategies

In the simulation, every agent decides whether to trade at every time step. We can write a script to use a strategy to compute a trade, where trade and the price at which the trade is made are set by the script.

```javascript
for (p of n.portfolio) {
  //Make trades completely at random
  if (Math.random() < 0.001) {
    //Decide the trade quantity and trade direction at random
    let trade = p;
    trade.quantity = hstd.stats.normal.sample(0, 1);

    const stored_price = trade.quantity * p.stored_price;
    const trade_partner = n.agent_id;

    state.trades.push({
      trade: trade,
      stored_price: stored_price,
      trade_partner: trade_partner,
    });
  }
}
```

In the simplest case, we can trade according to a completely random strategy, as shown above. To make a trade, we simply set the parameters **trade**, **price** and **trade_partner** as part of the state. The underlying simulation code will make the trade between our agent and its trade partner, and update both agents' portfolios.

## Rational Strategies

We can make a slight modification to the random strategy by only making the trades that are rational from each agent's point of view.

```javascript
for (p of n.portfolio) {
  //Only trade if there is an arbitrage opportunity between our price and our neighbour's
  let valuation = state.portfolio.filter((item) => item.name == p.name)[0]
    .stored_price;

  if (p.stored_price < valuation) {
    //Decide the trade quantity at random
    let trade = p;
    trade.quantity = hstd.stats.normal.sample(0, 1);

    const stored_price = trade.quantity * p.stored_price;
    const trade_partner = n.agent_id;

    state.trades.push({
      trade: trade,
      stored_price: stored_price,
      trade_partner: trade_partner,
    });
  }
}
```

The trades are still generated at random, but we only make the trade if the **neighbor’s stored_price** is less than our agent’s portfolio **stored_price** for a particular security. In short, this trading strategy only makes rational trades.

## Options Trading Strategies

Alternatively, we can trade by making use of the Black-Scholes equation. We can make trades on options that have a maturity **time** that is set at some point in the future. In our example, for simplicity, we are still setting most of the parameters randomly.

```javascript
//This is our estimate of the secutity's value right now
let valuation = BlackScholes(
  putCall,
  underlying_price,
  strike_price,
  timeToMaturtity,
  risk_free_interest_rate,
  p.volatility,
);

//Make the trade if its a good deal
if (p.stored_price < valuation) {
  //Decide the trade quantity at random
  p.time = timeToMaturtity;
  p.strike_price = strike_price;
  p.quantity = Math.max(hstd.stats.normal.sample(0, 1), 0);

  if (putCall == false) {
    //Short positions are represented by negative quantitiy
    p.quantity *= -1;
  }
  var trade = p;

  var stored_price = state.trade.quantity * p.stored_price;
  var trade_partner = n.agent_id;

  state.trades.push({
    trade: trade,
    stored_price: stored_price,
    trade_partner: trade_partner,
  });
}
```

We use the Black-Scholes equation to value the options based on parameters including their strike price, current underlying price, maturity date, volatility and the real rate of interest. We only make the trade if the Black-Scholes price is less than the other agent’s price.

## Write your own strategy

To write your own strategy, all you have to do is write a new behavior file in JavaScript, modeled on the strategies written above. The agent’s behavior should take in a **state** and **context** as input, and use **context.neighbors()** to view the agent’s neighbors which will be its trading partners.

The agent can only modify its own **state**. To learn more about how behaviors work, we recommend you check out the [docs](https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent).

To make a trade, simply set the parameters **trade**, **price** and **trade_partner** using your own code, and add it to the array **state.trades**.

To use the strategy, include it in the globals.json file in the array strategies. You should also use the strategy_colors array to set a color to view the strategy as its adopted in the 3D viewer.

```javascript
{
    "strategies": [
        "strategy_random_trades.js",
        "strategy_rational.js",
        "strategy_options.js"
    ]
}
```
