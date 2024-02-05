---
title: "Extending the Uniswap Simulation"
date: "2021-04-21"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/8a80ac7b-3beb-49d2-2dfe-36555b0d2100/public
categories: 
  - "Simulation"
  - "Topic > Finance"
---

_We've modified the [Uniswap simulation](https://hash.ai/blog/uniswap) to account for more use cases, more complex logic, and more trading partners._

One of the benefits of building a HASH simulation is maintainability and extensibility. You can add and modify behaviors over time, giving your agents new abilities and simulating new situations.

In the [initial release of our Uniswap simulation](https://hash.ai/@b/uniswap), we kept it simple and only modeled two exchanges with a set pair of tokens, A and B. The Arbitrageur would check both exchanges, getting the best buy and sell prices for the two tokens, and place an order if there was an arbitrage opportunity.

However, we really want to understand what happens when there are multiple token pairs across multiple exchanges. Maybe there isn't a straightforward arb from exchange foo to exchange baz for tokens A and B, but there is one from foo -> baz -> bar for tokens A/B, B/C, C/A. In essence, we need to find the best path that can net us a profit.

This is a great use case for simulations - we can model different scenarios and see what the end profit is for the agent.

## Modifications

The most significant change was in `arbitrage.py`, where we've added in a graph datastructure to organize the pricing information. The Arbitrageur asks for price info from all the exchanges and token pairs it's tracking, and then builds a multi-directed graph where the tokens are the nodes and the weighted edges represent prices per exchange.

To go into more detail, when the arbitrageur agent receives buy and sell orders from each exchange (ex. Buying 1 B costs 2 A on exchange foo) and treats the price as a directed edge from node A to node B. We could set the weight of the edge as the price, so in the example above setting the weight as 2, however conversion rates are multiplicative (if I buy 3 B it costs me 6 A) and most graph search algorithms expect addition, so instead we can take the log of the price, and set that as the weight. Finally because we want to actually find the highest weighted path through the graph, which will give us the most profitable trade, we'll take the negative logarithm of the price and set that as the weight.

Once we've built the graph, we then use an [implementation](https://github.com/nelsonuhan/bellmanford) of [Bellman-Ford graph search](https://en.wikipedia.org/wiki/Bellman%E2%80%93Ford_algorithm) to check for negative cycles in the graph. If there is a cycle, this means that that there's an arbitrage opportunity, and executing that path as a series of trades will lead to a profit for the arbitrageur.

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/d22fcab2-102d-435c-52d8-f95c073ab500/public)

Other changes include adding an optional "stochastic" exchange that doesn't follow the uniswap model and instead provides token prices which change every timestep. The prices are drawn from a triangluar distribution that can be set in globals.json.

Hopefully you'll find this to be a useful generalization of the original Uniswap model. Many of the ideas were inspired by users adding suggestions to the issues page; if you have ideas share them!

* * *

_This communication is provided for informational purposes only, and is not intended to constitute, nor should be construed as, investment advice, investment recommendations, investment research, or an offer or solicitation with respect to the purchase or sale of any security or interest. Although the information in this communication is believed to be materially correct as at the date of issue, no representation or warranty is given as to the accuracy of any of the information provided. Potential investors should seek their own independent financial, tax, legal and other advice._
