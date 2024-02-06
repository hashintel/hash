---
title: "Financial Simulation Toolbox"
date: "2021-08-05"
cover: https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/57eb9197-0ec1-4ad2-b54e-b795f75e9a00/public
categories: 
  - "Simulation"
  - "Topic > Finance"
---

HASH makes agent-based modeling accessible through our high-performance simulation engine ([hEngine](https://hash.ai/platform/engine)) and browser-based editor ([hCore](https://hash.ai/platform/core)).

A large number of our users are interested in finance (both traditional and crypto), so we've decided to open-source a _financial toolbox_ that makes it easier for anybody to get started using HASH for financial modeling.

Finance jobs are infamous for their copious use of spreadsheets. However, there are a large number of problems that spreadsheet-style applications are fundamentally bad at modeling, like emergent phenomena and systemic risks, as seen in the financial crisis of ‘07/08 and more recently in COVID-related supply chain disruptions. HASH makes it easier to use agent-based modeling in financial decision-making, and running probabilistic simulations (Monte Carlo-style and more!)

This tutorial is aimed at people with only a basic understanding of financial terms and conventions, such as options, pricing and trading, and will take you on a guided tour of HASH’s _financial toolbox_ simulation. By the end you should be able to code your own simple trading strategies, as well as understand how the HASH platform works in practice. The tutorial will be all in JavaScript, although HASH allows for Python code as well.

This financial toolbox is an extension of the HASH [Prisoner’s Dilemma simulation](https://hash.ai/@hash/prisoners-dilemma). This game theory simulation has agents using strategies to play a scored game with each other at each time-step, with the strategies which result in the higher scores being adopted by neighbouring agents. Our simulation operates similarly, except instead of being trapped in a Prisoner’s Dilemma, the game we’re playing is trading a portfolio of assets, and the score is the value of the portfolio.

We simulate a grid array of agents, each with their own portfolio of assets. At every time step, the agents make trades with their neighbours based on a trading strategy. If a neighbour’s strategy is successful, that is - it makes the neighbouring agent’s portfolio more valuable, it will be adopted by other agents. We can track the prevalence of strategies over time to see which ones are more successful.

We use agent-based modeling to model both the behavior of individual agents, and the system of trades as a whole. This allows us to understand which strategies fare the best, and we can also draw insights about systemic risk.

## Modeling a Portfolio

In our simulation, each agent holds a portfolio of securities, which are stored in an array. Each array entry stores a number of properties which make up the basic model.

```javascript
const behavior = (state, context) => {

  const items = context.globals()["trade_items"];
           
  if (!state.portfolio){

    // Initialize empty array
    state.portfolio = []
    for (item of items){
      var agent_portfolio_item = {"name": item.name};
      agent_portfolio_item["stored_price"] = Math.max(hstd.stats.normal.sample(item.mean_price, item.variance_price), 0);
      agent_portfolio_item["volatility"] = item.variance_price;
      agent_portfolio_item["quantity"] = Math.round(Math.max(Math.random() * 10,0));
      agent_portfolio_item["time"] = 0;
      agent_portfolio_item["strike_price"] = agent_portfolio_item["stored_price"];
      agent_portfolio_item["seller"] = null;

      state.portfolio.push(agent_portfolio_item);

    }

  }
```

The **name** of the security is just a label to identify the security to humans, such as “gold” or “altcoin”. The **quantity** represents how many items of the security are held by the agent at that time. The quantity can be negative, if we want to model a short position. We will explain next what the rest of the properties represent.

Our simulation models each security earning interest at each time step. The stored expected `risk_free_interest_rate` models the average rate of interest that each security earns over time. The stored `volatility` models, just like in real life, the variance of the price of the security as it changes over time. For example, a stock might have a higher expected volatility than a commodity.

At each time step, the `stored_price` of the security according to the agent changes according to the extra earned interest. Each agent updates the prices at every turn. This value does not store the true underlying price of the security, but merely each agent’s estimate of the price. 

In our model, some securities are European-style options which take time to reach maturity, represented by the variable `time`. During this period, when time > 0, the option does not earn any interest, and its `stored_price` according to the agent is fixed, though the underlying true price of the option may still change. The **strike price** of the security represents how much the security should be bought or sold for when it reaches maturity.

When options mature we exercise the option if the agent’s `stored_price` of the underlying security is greater than the option’s strike price. If it is, we exchange a quantity of the agent’s currency equal to the strike price to exercise the option. Otherwise, we discard the option. 

When exercising an option, our code does not need to directly deal with the original seller, as the simulation already models the seller as having made the reverse trade (as explained later).

## Initializing a Portfolio

We will start by initializing every agent with a randomized portfolio of assets. In our example, we choose a number of securities including commodities and ETF funds.

```javascript
/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {

  const items = context.globals()["trade_items"];
           
  if (!state.portfolio){

    // Initialize empty array
    state.portfolio = []
    for (item of items){
      var agent_portfolio_item = {"name": item.name};
      agent_portfolio_item["stored_price"] = Math.max(hstd.stats.normal.sample(item.mean_price, item.variance_price), 0);
      agent_portfolio_item["volatility"] = item.variance_price;
      agent_portfolio_item["quantity"] = Math.round(Math.max(Math.random() * 10,0));
      agent_portfolio_item["time"] = 0;
      agent_portfolio_item["strike_price"] = agent_portfolio_item["stored_price"];
      agent_portfolio_item["seller"] = null;

      state.portfolio.push(agent_portfolio_item);

    }


  }
};
```

We could also simulate trading of tokens or cryptocurrency using the same model.

Separately we store the basic properties of each security, such as volatility and time to maturity. As long as a security has reached maturity, we can increase its value at every time step according to the rate of return.

```javascript
// If security has reached maturity, start earning interest
    if (p.time == 0){
      p.stored_price = p.stored_price * risk_free_interest_rate;
      p.stored_price = hstd.stats.normal.sample(p.stored_price, p.volatility)
    }
```

Reflecting their real-world counterparts, stocks are modeled as having a higher volatility, and commodities as having a generally lower level of volatility.

At each time step for an agent, we increase the price of each security according to a random stochastic process based on the interest rate and volatility.

The value of a long-short portfolio can be easily calculated from the stored properties. We will use the Black-Scholes equation to calculate the total value of all securities at any particular moment.

```javascript
  // Excerpt to value the portfolio  
    state.value = 0;
    for (let i = 0; i < state.portfolio.length; i++){
      if (state.portfolio[i].time == 0){
        state.value += state.portfolio[i].stored_price;
      }
      else{
        // Calculate value using Black-Sholes
        let underlying_price = state.portfolio.filter(item => item.name == state.portfolio[i].name)[0].stored_price;
        state.value += BlackScholes(state.portfolio[i].quantity > 0, underlying_price, state.portfolio[i].stored_price, 
        state.portfolio[i].time, risk_free_interest_rate,state.portfolio[i].volatility);
      }
    }
```

## Trading

### Random Strategies

In the simulation, every agent decides whether to trade at every time step. We can write a script to use a strategy to compute a trade, where trade and the price at which the trade is made are set by the script.

```javascript
/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
        state.trades = []

  // Check each neighbour, and each item in the neighbours portfolio
  context.neighbors().map(n => {
    if (n.portfolio){
      for (p of n.portfolio){
          
        // Make trades completely at random
        if (Math.random() < 0.001){

          // Decide the trade quantity and trade direction at random
          var trade = p;
          trade.quantity = hstd.stats.normal.sample(0,1);
            
          var stored_price = trade.quantity * p.stored_price;
          var trade_partner = n.agent_id;

          state.trades.push({"trade": trade, "stored_price": stored_price, "trade_partner": trade_partner});
        }
      }
    }
  })
};
```

Agents are always willing to go short, so the quantity and agent may have of any security can be negative.

In the simplest case, we can trade according to a completely random strategy, as shown above. To make a trade, we simply set the parameters `trade`, `price` and `trade_partner` as part of the state. The underlying simulation code will make the trade between our agent and its trade partner, and update both agents portfolios.

```javascript
/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
function behavior(state, context) {
  if (state.checking_strategies) {
    state.curr_trades = {};
    return;
  }
  if (!state.trades){
      return
    }

  for (trade of state.trades){

    // If we don't have trades initialize for this agent yet, create an empy array
    if (!state.curr_trades[trade.trade_partner]){
      state.curr_trades[trade.trade_partner] = [];
    }

    // Update internal variables payment and total_price
    var payment = state.portfolio[0];
    payment.quantity = -state.stored_price/payment.stored_price;

    // Push the trade and the payment
    state.curr_trades[trade.trade_partner].push(trade.trade);
    state.curr_trades[trade.trade_partner].push(payment);

    // Set trade to null
    trade = null;
  }
};
```

### Rational Strategies

We can make a slight modification to the random strategy by only making the trades that are rational from each agent's point of view.

```javascript
/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.trades = []
  // Check each neighbour, and each item in the neighbours portfolio
  context.neighbors().map(n => {
    if (n.portfolio){
      for (p of n.portfolio){
          
      // Only trade if there is an arbitrage opportunity between our price and our neighbors
      let valuation = state.portfolio.filter(item => item.name == p.name)[0].stored_price;
      if (p.stored_price < valuation && Math.random() < 0.1){
          // Decide the trade quantity at random
          var trade = p;
          trade.quantity = hstd.stats.normal.sample(0,1);
            
          var stored_price = trade.quantity * p.stored_price;
          var trade_partner = n.agent_id;

          state.trades.push({"trade": trade, "stored_price": stored_price, "trade_partner": trade_partner});
        }
      }
    }
  })
};
```

The trades are still generated at random, but we only make the trade if the neighbour’s `stored_price` is less than our agent’s portfolio `stored_price` for a particular security. In short, this trading strategy only makes rational trades.

### Options Trading Strategies

Alternatively, we can trade by making use of the Black-Scholes equation. We can make trades on options that have a maturity time that is set at some point in the future. In our example, for simplicity, we are still setting most of the parameters randomly.

```javascript
const behavior = (state, context) => {
  const risk_free_interest_rate = context.globals()["risk_free_interest_rate"];
    
    state.trades = [];
  // Check each neighbour, and each item in the neighbours portfolio
  context.neighbors().map(n => {
    if (n.portfolio){
      for (p of n.portfolio){

      // This is how much we will pay for the security at time n
      // Let's just fix the current underlying price in place
      let underlying_price = state.portfolio.filter(item => item.name == p.name)[0].price;
      let strike_price = underlying_price; 

      // Randomly choose put or call options and time to maturity
      let timeToMaturtity = Math.round(Math.random()*10);
      let putCall = Math.random() < 0.5 ? true : false 
      
      // This is our estimate of the secutity's value right now
      let valuation = BlackScholes(putCall, underlying_price, strike_price, 
        timeToMaturtity, risk_free_interest_rate,p.volatility);

      // Make the trade if its a good deal
      if (p.stored_price < valuation  && Math.random() < 0.1){
          // Decide the trade quantity at random
          p.time = timeToMaturtity;
          p.strike_price = strike_price;
          p.quantity = Math.max(hstd.stats.normal.sample(0,1),0); 
          
          if (putCall == false){
            // Short positions are represented by negative quantitiy
            p.quantity *= -1;
          }
          var trade = p;
            
          var stored_price = state.trade.quantity * p.stored_price;
          var trade_partner = n.agent_id;

          state.trades.push({"trade": trade, "stored_price": stored_price, "trade_partner": trade_partner});
        }
      }
    }
  })
```

We use the Black-Scholes equation to value the options based on parameters including their strike price, current underlying price, maturity date, volatility and the real rate of interest. We only make the trade if the Black-Scholes price is less than the other agent’s price.

### Writing your own strategy

To write your own strategy, all you have to do is write a new behavior file in JavaScript, modeled on the strategies written above. The agent’s behavior should take in a **state** and **context** as input, and use the `context.neighbours` to view the agent’s neighbours which will be its trading partners. 

The agent can only modify its own state. To learn more about how behaviors work, we recommend you check out the [docs](https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent).

To make a trade, simply set the parameters `trade`, `price` and `trade_partner` using your own code, and add it to the array `state.trades`. 

To use the strategy, include it in the `globals.json` file in the array strategies. You should also use the `strategy.colors` array to set a color to view the strategy as its adopted in the 3D viewer.

## Simulation Analysis

### Winning Strategies

We can use HASH’s analysis tool to understand which strategies are most effective at increasing the value of a portfolio. We can define metrics to count how many agents are using each strategy, and then graph the output. Our metrics count the number of agents coded a certain color, which allows us to graph the result.

The first plot in our [financial toolbox example simulation](https://hash.ai/@hash/financial-toolbox-example) graphs the prevalence of each of the strategies we have coded. We can run the simulation and see if, for example, changing the real interest rate affects which strategies win and are adopted more often.

### Total Assets

Another way to use graphs to understand the simulation is to graph the total value of assets held by all the agents. We define a metric that sums the valuation of the portfolio for each agent, using the code we wrote earlier.

We can graph the results over time to show how securities gradually increase in value exponentially. We can again adjust the parameter for the real interest rate to change the rate of exponential growth. This graph can again be found in the financial toolbox [example simulation](https://hash.ai/@hash/financial-toolbox-example).

### Value at Risk

Value at Risk (VaR) is a statistic that quantifies the maximum extent of possible financial losses within a portfolio over a specific time frame. This metric is most commonly used by banks to determine the extent and probabilities of potential losses. There are multiple ways to calculate VaR. Here we use the “variance-covariance method”.

VaR is difficult to calculate when including nonlinear trades such as options. In such cases we would typically use another method, “Monte Carlo VaR”, to calculate VaR.

In the [financial toolbox example](https://hash.ai/@hash/financial-toolbox-example) we plot a histogram of the total portfolio value of all of the assets. This "Value Distribution" will allow us to understand the distribution of outcomes when trading with the tested strategies.
