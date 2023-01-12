This model contains two types of agents: shops and buyers. It also [available in Python](https://hash.ai/index/5e9cd7078e9aa038b135397a/model-market).

Shops have three possible state: closed (white), open but no recent sales (blue), and open with recent sales (green). Shops adjust their price if there has been no recent sales and close when their cost is greater than their price.

Buyers window shop at a certain number of shops before they buy. Once they can buy from a shop they search for a shop with a price equal to or lower than the lowest price found window shopping.

http://ccl.northwestern.edu/netlogo/models/community/ModelMarket

\*Added the create_agents behavior to prepare for the initial state revamp

```video
https://cdn-us1.hash.ai/site/Model_Market.mp4
```
