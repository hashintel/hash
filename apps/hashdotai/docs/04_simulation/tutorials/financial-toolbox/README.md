---
title: Financial Toolbox
slug: simulation/tutorials/financial-toolbox
description: "Explore financial modeling in HASH"
---

# What is a "financial toolbox"?

HASH makes agent-based modeling accessible through our browser-based editor ([hCore](https://hash.ai/platform/core)), and simulation platform ([hCloud](https://hash.ai/platform/cloud)). A large number of our users are interested in finance and crypto, so we decided to build a _financial toolbox_ that makes it easier for anybody to get started using HASH for financial and economic modeling.

Finance jobs are infamous for their copious use of spreadsheets. However, there are a large number of problems that spreadsheets are bad at modeling, like emergent phenomena and systemic risks, as seen in the financial crisis of ‘07/08 and more recently in COVID-related supply chain disruptions. We hope that HASH can help, by making it easier to use agent-based modeling in financial decision-making, and running probabilistic simulations (Monte Carlo-style and more!)

## Target Audience

This tutorial is aimed at people with only a basic understanding of financial terms and conventions, such as options, pricing and trading.

This tutorial will take you on a guided tour of HASH’s _financial toolbox_ simulation, and by the end you should be able to code your own trading strategies, as well as understand how the HASH platform works in practice. The tutorial will be all in JavaScript, although HASH allows for Python code as well.

## Overview

This financial toolbox is modeled on the HASH [Prisoner’s Dilemma simulation](https://hash.ai/@hash/prisoners-dilemma). This game theory simulation has agents using strategies to play a scored game with each other at each time-step, with the strategies which result in the higher scores being adopted by neighboring agents. Our simulation operates similarly, except instead of being trapped in a Prisoner’s Dilemma, the game we’re playing is trading a portfolio of assets, and the score is the value of the portfolio.

We simulate a grid array of agents, each with their own portfolio of assets. At every time step, the agents make trades with their neighbours based on a trading strategy. If a neighbour’s strategy is successful, that is - it makes the neighbouring agent’s portfolio more valuable, it will be adopted by other agents. We can track the prevalence of strategies over time to see which ones are more successful.

We use agent-based modeling to model both the behavior of individual agents, and the system of trades as a whole. This allows us to understand which strategies fare the best, and we can also draw insights about systemic risk.
