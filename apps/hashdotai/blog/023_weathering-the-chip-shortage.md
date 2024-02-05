---
title: "Surviving a Chip Shortage"
date: "2021-06-16"
categories: 
  - "Simulation"
---

The COVID-19 pandemic has been a source of exogenous shocks to supply and demand in many industries across the market. One specific market currently experiencing shortages is the semiconductor industry. This has far-reaching consequences, because “chips” have become ubiquitous as raw components for many different industries

The auto and consumer electronics industry are both experiencing unprecedented disruptions from the chip shortage. The auto industry is currently suffering chip shortages as they attempt to recover to pre-pandemic levels of production, and consumer electronics demand has risen due to the boom in work-from-home, and people who spent much more time indoors over the past year.

[Despite these industry level disruptions, Toyota has not been struggling](https://www.bloomberg.com/news/articles/2021-04-07/how-toyota-s-supply-chain-helped-it-weather-the-chip-shortage). Toyota has a particular set of stockpile practices that set them apart from other automotive companies, which has helped them weather the COVID-19 supply chain disruptions. Ever since the Fukushima disaster in 2011, they’ve kept a 2-6 month stockpile of raw materials on hand, to ensure continuity of operations regardless of external shocks.

Let’s use a HASH supply chain model to try and understand the situation. We’ll start from [this model of a flexible supply chain](https://hash.ai/@hash/flexible-supply-chain), and replace the generic agents with more specific ones. Our model will have three different firms represented by agents:

- Toyota
- A competing automotive firm
- A consumer electronics manufacturer

The three firms all have a corresponding customer demand agent, which sends them orders each time step. All three are supplied by a chip producer agent, which the firms send their orders to. The three firms and the chip supplier all adjust their production rates to attempt to match their average delivery rate. This is handled by the `produce.js` behavior, which checks if the production rate needs to increase or decrease, and adjusts at a predetermined rate.

```javascript
// Adjust production rate
const desired = hstd.stats.max([state.avg_order, state.avg_delivery]);

if (state.production_rate < desired) {
    state.production_rate *= 1.001;
} else if (state.production_rate > desired) {
    state.production_rate *= 0.999;
}
```

The three firms determine order quantities based on the amount of raw stock. If the amount drops below a certain threshold, then they place an order. This is controlled by the `producer_calculate_order.js` behavior.

Most firms will attempt to keep one months worth of raw materials on hand, and reorder to that amount. Toyota, however, has different reorder limits and targets. Since they are attempting to maintain a more substantial stockpile, they will place an order whenever raw stock drops below two month’s worth of supplies, and place an order to attempt to bring the amount up to 6 months’ worth.

```javascript
if (state.agent_name === "toyota") {
    if (state.raw_stock < 8*state.avg_delivery) {
        state.order_quantity = 26*state.avg_delivery - state.raw_stock;
        return
    }
} else {
    if (state.raw_stock < 4*state.avg_delivery) {
        state.order_quantity = 4*state.avg_delivery - state.raw_stock;
        return
    }
}
```

By running this simulation at a stable state we can mimic the market before severe disruptions.

![](https://lh5.googleusercontent.com/-5HPAj8tOAjAcbXWXtGhihzyhUrhdBT8hrDf7Ge3u2w2BkpUleet93-w_nyKR62OD2DF7_F_90THrdD21sqHGLc1zuxY5zYfgwZiebeb0qQ-IMtsPoq720ahxlyMF6Zk1sm58xgu)

When we start off, fulfillment times stabilize quickly, pointing to a system that has found equilibrium in production rates.

We’ll now add an `exogenous_shocks.js` behavior to simulate the effects of the pandemic. The behavior will read from `globals.json` to determine when it should change demand. Our scenario will mimic the effects of the pandemic with the following steps:

- Demand for cars drops around step 500
- Demand for electronics rises around step 500
- Demand for cars goes back up around step 1000

In `globals.json`, that looks like this:

```json
{
    ...
    "auto_demand": {
        "500": 90,
        "510": 80,
        "520": 70,
        "530": 60,
        "970": 70,
        "980": 80,
        "990": 90,
        "1000": 100
    },
    "consumer_electronics_demand": {
        "500": 105,
        "510": 110,
        "520": 115,
        "530": 120
    }
}
```

Here are the resulting effects on the fulfillment times of the various firms:

![](https://lh5.googleusercontent.com/Y5_gpNzOwE73xKKN95_XnambbXQQny0U6a4mox_CYgWcye29kgQrMnlAUpCkMOjm3Zscr1ap1rQDZf2vPH_4C8tImW6lKYite32sVeSSzPKR1IIFNxQjJanPi9BLmdpAHI08leeE)

Toyota is managing to weather the shocks because of its stockpiling practices. While the other firms experience a “bullwhip effect”, where they need to rapidly attempt to increase production to meet the change in demand, but then overshoot, Toyota can gradually and carefully adjust its production rates since it can use its stockpile to weather the beginning of the demand increase.

Toyota’s current stockpiling strategy exists in contrast with the popularized “just-in-time” manufacturing strategy, which attempts to reduce costs by making supply chains as lean as possible, ordering just enough components, and producing just enough inventory to meet demand. Funnily enough, lean manufacturing’s initial principles were based on Toyota Motor Corporation’s operating model from the 1930’s.

Our model shows how “just-in-time” manufacturing can leave firms unprepared for exogenous shocks in supply or demand. The losses from an inability to meet demand, and increased fulfillment times, can offset the cost-saving benefits of an overly lean supply chain.
