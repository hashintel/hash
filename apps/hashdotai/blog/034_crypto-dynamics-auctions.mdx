---
title: "Crypto Dynamics: Auctions"
date: "2022-02-22"
cover: https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/33412e62-521a-4788-2cc8-e58be1922700/public
categories: 
  - "Simulation"
  - "Topic > Finance"
---

_Although HASH is not a 'crypto' product, as a platform for high-performance simulation it can be used to model many important dynamics within crypto. This is the first post in a series that explores applications of simulation within web3._

Non-fungible tokens (or NFTs) are one of the most visible parts of the crypto or 'web3' ecosystem today. Central to its function js a thriving, sophisticated series of auction markets. _Auction theory_ encompasses a number of topics within auction design, which has applications throughout crypto. New methods for running auctions can be implemented on-chain, and in this post we explore running auction simulations with HASH.

We'll be using the HASH platform to create an agent-based model containing both an auctioneer and a number of bidders. In this basic example, the auctioneer will apply the rules of the auction in a fashion similar to on-chain code, and the behavior of rational bidders will be simulated as they place their bids. You can follow along in [the simulation here](https://core.hash.ai/@saku/auctions-example/1.0.0).

## First-price sealed-bid auction

The most simple type of auction is a [first-price sealed-bid auction](https://en.wikipedia.org/wiki/First-price_sealed-bid_auction). This is when all participants submit their bids secretly, and the winner is the bidder who is willing to pay the highest price. This type of auction may make sense on the surface, but leads to buyer-wariness due to its vulnerability to the _winner’s curse_. This term describes the tendency for winners to overpay, because first-price sealed-bid auctions reward the largest overestimation of an auctioned item's value. To counteract this, bidders may attempt to ascertain not the 'true worth' or intrinsic value of an item, but the valuation at which others are likely to bid, adjusting their own bids accordingly in an attempt to only marginally outbid others (without exceeding one's own willingness to pay), rather than stating their own true preferences and willingness. Such tactical bidding may reduce the eventual sales price and prevent true willingness to pay from being captured.

```javascript
  const n = context.globals().n\_bidders;

  // Calculate the expected maximum of a (0, 1\] random distribution
  const expected\_max = n / (n + 1);

  // Determine agent's true preferences
  state.straight\_bid = Math.random();
```

Taking a look at our code, we see that the bid for each agent is set randomly, using a linear random function. Therefore, it is simple to calculate the expected maximum bid of the other bidders.[\[1\]](https://math.stackexchange.com/questions/150586/expected-value-of-max-of-iid-variables) We use this expected maximum bid in order to calculate tactical bids only if the internal valuation of a bidder is going to be higher.

```javascript
  // Determine the agent's tactical bid based on the expected max
  
  if (state.straight\_bid > expected\_max) {
    state.tactical\_bid = expected\_max;
  } else {
    state.tactical\_bid = state.straight\_bid;
  }
```

The math for calculating the maximum of a random distribution is sound. However, since the logic of the sim makes agents change their bid if it comes out above that maximum, it turns into a "guess 2/3rds of the average" game.

## Second-price sealed-bid auction 

A [second-price sealed-bid auction](https://en.wikipedia.org/wiki/Generalized_second-price_auction) attempts to solve the particular problem of tactical voting that first-price sealed-bid auctions are vulnerable to. This auction is one where participants vote secretly, and the winner is the bidder who is willing to pay the highest price, but ends up only having to pay the second-highest price.

This means bidders no longer have to worry about overpaying for an item or falling for the winner’s curse. 

```javascript
  // Gather agents' straight bids
  const agents = context.neighbors();
  const straight\_bids = agents.map(a => a.straight\_bid);

  // Remove max as we are looking for the second price
  const max = Math.max(...straight\_bids);
  const index = straight\_bids.indexOf(max);
  if (index > -1) {
    straight\_bids.splice(index, 1);
  }

  // Calculate the second-price winner
  state.second\_auction\_winner = Math.max(...straight\_bids);
```

Taking a look at our code, we see that for this auction, agents are able to make a straight bid in accordance with their direct preferences.

## Revenue Equivalence

Aside from the two auction types we have considered, there are a host of other ways to hold an auction, including an [English-style auction](https://en.wikipedia.org/wiki/English_auction), which is the one often used at real life auction houses, where an auctioneer increases the price up from a reserve and agents can bid multiple times. 

[Dutch-style auctions](https://en.wikipedia.org/wiki/Dutch_auction), where an auctioneer starts with a high asking price and descends to find the highest bid are also sometimes used. The Dutch-style auction is somewhat similar to the first-price sealed-bid auction insofar as both are vulnerable to the winner’s curse.

Due to its use on eBay and other popular online auction houses, many individuals are also familiar with Vickery auctions, also known (catchily) as "fixed-time semi-sealed-bid modified second-price" auctions. In this model, bidders privately state the maximum bid they are willing to make. The highest bidder always wins, but only ever pays one 'bid increment' more than the second-highest bidder. Auctions have a predetermined end time, and when users submit bids that are less than the current leader's maximum bid, they are immediately shown to be outbid and become the new underbidder, with the "current minimum bid" recalculated one bid increment higher than their failed previous bid.

The [revenue equivalence](https://en.wikipedia.org/wiki/Revenue_equivalence) theorem states that given certain mathematical conditions (which are beyond the scope of this tutorial), every auction design will end up generating the same revenue for the auctioneer.

![](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/398aa421-bc14-4f80-ace1-b6b757a62f00/public)

In our example, we can see that the difference in winning bid price for the two types of auction ends up close to zero. 

![](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/103338c9-2105-44d0-85e3-061cd180f600/public)

If we run the Revenue Equivalence experiment and take a look at the resulting graph, we see that the difference between the two types of auction fluctuates close to zero. As we increase the number of agents bidding, the difference approaches zero.

## Conclusion

We have explored a small number of different types of auctions, simulated them, and demonstrated a degree of revenue equivalence in practice. However, we have not accounted for the irrationality of buyers during an auction.

For NFTs, most online sales use variants of English-style auctions, as these are generally considered most effective at maximizing revenue for auctioneers when _real_ human behavior is properly accounted for. To understand the current prices of NFTs, consider a Keynesian beauty contest held under a high degree of uncertainty, without a long-run of historical data to inform bidders. While some bidders may be assessing beauty, for others it is a game of speculation in which they seek to determine the mean preferences of others - both now and in the future.

If you’re interested in developing your own auction models and running simulations, check out HASH’s simulation tools, or our [Simulation School](https://simulation.school/) tutorials.

_This communication is provided for informational purposes only, and is not intended to constitute, nor should be construed as, investment advice, investment recommendations, investment research, or an offer or solicitation with respect to the purchase or sale of any security or interest. Although the information in this communication is believed to be materially correct as at the date of issue, no representation or warranty is given as to the accuracy of any of the information provided. Potential investors should seek their own independent financial, tax, legal and other advice._
