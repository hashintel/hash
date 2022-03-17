# Introduction

## What is a "financial toolbox"?

HASH makes agent-based modeling accessible through our browser-based editor ([hCore](https://hash.ai/platform/core)), and simulation platform ([hCloud](https://hash.ai/platform/cloud)). A large number of our users are interested in finance and crypto, so we decided to build a *financial toolbox* that makes it easier for anybody to get started using HASH for financial and economic modeling.

Finance jobs are infamous for their copious use of spreadsheets. However, there are a large number of problems that spreadsheets are bad at modeling, like emergent phenomena and systemic risks, as seen in the financial crisis of ‘07/08 and more recently in COVID-related supply chain disruptions. We hope that HASH can help, by making it easier to use agent-based modeling in financial decision-making, and running probabilistic simulations (Monte Carlo-style and more!)

## Target Audience

This tutorial is aimed at people with only a basic understanding of financial terms and conventions, such as options, pricing and trading.

This tutorial will take you on a guided tour of HASH’s *financial toolbox* simulation, and by the end you should be able to code your own trading strategies, as well as understand how the HASH platform works in practice. The tutorial will be all in JavaScript, although HASH allows for Python code as well.

## Overview

This financial toolbox is modeled on the HASH [Prisoner’s Dilemma simulation](https://hash.ai/@hash/prisoners-dilemma). This game theory simulation has agents using strategies to play a scored game with each other at each time-step, with the strategies which result in the higher scores being adopted by neighboring agents. Our simulation operates similarly, except instead of being trapped in a Prisoner’s Dilemma, the game we’re playing is trading a portfolio of assets, and the score is the value of the portfolio.

We simulate a grid array of agents, each with their own portfolio of assets. At every time step, the agents make trades with their neighbours based on a trading strategy. If a neighbour’s strategy is successful, that is - it makes the neighbouring agent’s portfolio more valuable, it will be adopted by other agents. We can track the prevalence of strategies over time to see which ones are more successful.

We use agent-based modeling to model both the behavior of individual agents, and the system of trades as a whole. This allows us to understand which strategies fare the best, and we can also draw insights about systemic risk.

# Modeling a Portfolio

## The Basic Model

In our simulation, each agent holds a portfolio of securities, which are stored in an array. Each array entry stores a number of properties which make up the basic model.

[portfolio_init.js excerpt]

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

[portfolio_init.js excerpt]

We could also simulate trading of tokens or cryptocurrency using the same model.

## Earning Interest

We also store basic properties of each security, such as volatility and time to maturity. As long as a security has reached maturity, we can increase its value at every time step according to the rate of return.

[portfolio_value.js excerpt]

Stocks are modeled as having a higher volatility, and commodities as having a low volatility. At each time step for an agent, we increase the price of each security according to a random stochastic process based on the interest rate and volatility.

## Valuation

The value of the long-short portfolio can be easily calculated from the stored properties. We will use the Black-Scholes equation to calculate the total value of all securities at any particular moment.

[portfolio_value.js excerpt]

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

# Simulation Analysis

## Winning Strategies

We can use HASH’s analysis tool to understand which strategies are most effective at increasing the value of a portfolio. We can define metrics to count how many agents are using each strategy, and then graph the output. Our metrics count the number of agents coded a certain color, which allows us to graph the result.

[analysis.json excerpt]

Our first plot graphs the prevalence of each of the strategies we have coded. We can run the simulation and see if, for example, changing the real interest rate affects which strategies win and are adopted more often.

## Total Assets

Another way to use graphs to understand the simulation is to graph the total value of assets held by all the agents. We define a metric that sums the valuation of the portfolio for each agent, using the code we wrote earlier.

[analysis.json excerpt]

We can graph the results over time to show how securities gradually increase in value exponentially. We can again adjust the parameter for the real interest rate to change the rate of exponential growth.

## Value at Risk

Value at Risk (VaR) is a statistic that quantifies the maximum extent of possible financial losses within a portfolio over a specific time frame. This metric is most commonly used by banks to determine the extent and probabilities of potential losses. There are multiple ways to calculate VaR. Here we use the “variance-covariance method”.

VaR is difficult to calculate when including nonlinear trades such as options. In such cases we would typically use another method (“Monte Carlo VaR”) to calculate VaR. We will cover this separately later.

[analysis.json excerpt]

In our example, we will plot a histogram of the total portfolio value of all of the assets. This will allow us to understand the distribution of outcomes when trading with the tested strategies.

## Monte Carlo VaR

Because our agents’ portfolios can contain options (which may be nonlinear in nature), we can use a technique called **Monte Carlo simulation** to calculate the expected Value at Risk (VaR). By ‘nonlinear’ we mean that a change in something’s input is not necessarily proportional to a change in its output. This is true of most options.

In addition to running single simulation runs, HASH enables simultaneous simulation runs with different parameters, called [experiments](https://hash.ai/docs/simulation/creating-simulations/experiments), that collate the graphed output over different runs. We can run an experiment by clicking the experiment button at the bottom of the screen.

To use the Monte Carlo method, we start by creating a Monte Carlo experiment, varying the interest rate as a normally distributed variable that represents market conditions. We can take a look at the trend lines of the total portfolio value, and see how the distribution looks. We can see that the value of the portfolio varies widely according to interest rate. In the worst case scenarios, the value of the portfolio drops by around 1/3rd, suggesting this is our value at risk.

![Results of the Monte Carlo Experiment](https://cdn-us1.hash.ai/site/docs/fin-toolbox-mc.png)

# Conclusion

## Further Reading

Congratulations! You have completed this tutorial of our financial toolbox. If you want to take the ideas mentioned in the course further, please check out some of the simulations on the HASH platform. You can also check out the HASH docs in order to deepen your understanding of any of the topics mentioned. Thank you for learning and we hope to see you on the platform!
