---
title: Modeling a Portfolio
slug: simulation/tutorials/financial-toolbox/modeling-a-portfolio
description: "Design and build a portfolio"
---

# Modeling a Portfolio

## The Basic Model

In our simulation, each agent holds a portfolio of securities, which are stored in an array. Each array entry stores a number of heteregenous properties which make up the basic model.

```javascript
const items = context.globals()["trade_items"];

if (!state.portfolio) {
  state.portfolio = [];

  for (item of items) {
    // Create security
  }
}
```

The **name** of the security is just a label to identify the security to humans, such as “gold” or “altcoin”. The **quantity** represents how many items of the security are held by the agent at that time. The quantity can be negative, if we want to model a short position. We will explain next what the rest of the properties represent.

## Trading and Prices

During the simulation, the agent will buy and sell securities to other agents. Our simulation does not include an overall market price, just individual pricing of particular securities. When agents buy and sell, they use their own internal valuations to make a trade.

The **stored_price** of each security is the agent’s valuation. The agent will never make a trade to sell the security for less than its pricing. When buying from other agents, the price of the trade will be the other agent’s pricing. The price is set by the agent and represents an internal valuation.

## Earning Interest

Our simulation models each security earning interest at each time step. The stored expected **risk_free_interest_rate** models the average rate of interest that each security earns over time. The stored **volatility** models, just like in real life, the variance of the price of the security as it changes over time. For example, a stock might have a higher expected **volatility** than a commodity.

At each time step, the **stored_price** of the security according to the agent changes according to the extra earned interest. Each agent updates the prices at every turn. This value does not store the true underlying price of the security, but merely each agent’s estimate of the price.

## Trading Options

In our model, some securities are European-style options which take **time** to reach maturity, represented by the variable **time**. During this time, when time > 0, the option does not earn any interest, and its **stored_price** according to the agent is fixed, though the underlying true price of the option may still change.The **strike price** of the security represents how much the security should be bought or sold for when it reaches maturity.

In our model, when options mature, we exercise the option if the agent’s **stored_price** of the underlying security is greater than the option’s **strike price**. If it is, we exchange a quantity of the agent’s currency equal to the **strike price** to exercise the option. Otherwise, we discard the option.

When exercising an option, our code does not need to directly deal with the original seller, as the simulation already models the seller as having made the reverse trade (as explained later).

# Simulation Components

## Initializing the Portfolio

We will start by initializing every agent with a randomized portfolio of assets. In our example, we choose a number of securities including commodities and ETF funds.

```javascript
const stored_price = Math.max(
  hstd.stats.normal.sample(item.mean_price, item.variance_price),
  0,
);

const agent_portfolio_item = {
  name: item.name,
  stored_price: stored_price,
  volatility: item.variance_price,
  quantity: Math.round(Math.max(Math.random() * 10, 0)),
  time: 0,
  strike_price: stored_price,
  seller: null,
};
```

We could also simulate trading of tokens or cryptocurrency using the same model.

## Earning Interest

We also store basic properties of each security, such as volatility and time to maturity. As long as a security has reached maturity, we can increase its value at every time step according to the rate of return.

Stocks are modeled as having a higher volatility, and commodities as having a low volatility. At each time step for an agent, we increase the price of each security according to a random stochastic process based on the interest rate and volatility.

## Valuation

The value of the long-short portfolio can be easily calculated from the stored properties. We will use the Black-Scholes equation to calculate the total value of all securities at any particular moment.
