---
title: Economic Analysis
slug: simulation/tutorials/financial-toolbox/economic-analysis
description: "Analyze the results of your financial simulation"
---

# Simulation Analysis

## Winning Strategies

We can use HASH’s analysis tool to understand which strategies are most effective at increasing the value of a portfolio. We can define metrics to count how many agents are using each strategy, and then graph the output. Our metrics count the number of agents coded a certain color, which allows us to graph the result.

![Number of agents trading using each strategy](https://cdn-us1.hash.ai/site/docs/fin_strategy_presence.png)

Our first plot graphs the prevalence of each of the strategies we have coded. We can run the simulation and see if, for example, changing the real interest rate affects which strategies win and are adopted more often.

## Total Assets

Another way to use graphs to understand the simulation is to graph the total value of assets held by all the agents. We define a metric that sums the valuation of the portfolio for each agent, using the code we wrote earlier.

![Total assets of agents in the simulation](https://cdn-us1.hash.ai/site/docs/fin_assets.png)

We can graph the results over time to show how securities gradually increase in value exponentially. We can again adjust the parameter for the real interest rate to change the rate of exponential growth.

## Value at Risk

Value at Risk (VaR) is a statistic that quantifies the maximum extent of possible financial losses within a portfolio over a specific time frame. This metric is most commonly used by banks to determine the extent and probabilities of potential losses. There are multiple ways to calculate VaR. Here we use the “variance-covariance method”.

VaR is difficult to calculate when including nonlinear trades such as options. In such cases we would typically use another method (“Monte Carlo VaR”) to calculate VaR. We will cover this separately later.

![Distribution of portfolio value among agents](https://cdn-us1.hash.ai/site/docs/fin_distribution.png)

In our example, we will plot a histogram of the total portfolio value of all of the assets. This will allow us to understand the distribution of outcomes when trading with the tested strategies.

## Monte Carlo VaR

Because our agents’ portfolios can contain options (which may be nonlinear in nature), we can use a technique called **Monte Carlo simulation** to calculate the expected Value at Risk (VaR). By ‘nonlinear’ we mean that a change in something’s input is not necessarily proportional to a change in its output. This is true of most options.

In addition to running single simulation runs, HASH enables simultaneous simulation runs with different parameters, called [experiments](https://hash.ai/docs/simulation/creating-simulations/experiments), that collate the graphed output over different runs. We can run an experiment by clicking the experiment button at the bottom of the screen.

To use the Monte Carlo method, we start by creating a Monte Carlo experiment, varying the interest rate as a normally distributed variable that represents market conditions. We can take a look at the trend lines of the total portfolio value, and see how the distribution looks. We can see that the value of the portfolio varies widely according to interest rate. In the worst case scenarios, the value of the portfolio drops by around 1/3rd, suggesting this is our value at risk.

![Results of the Monte Carlo Experiment](https://cdn-us1.hash.ai/site/docs/fin-toolbox-mc.png)

# Conclusion

## Further Reading

Congratulations! You have completed this tutorial of our financial toolbox. If you want to take the ideas mentioned in the course further, please check out some of the simulations on the HASH platform. You can also check out the HASH docs in order to deepen your understanding of any of the topics mentioned. Thank you for learning and we hope to see you on the platform!
