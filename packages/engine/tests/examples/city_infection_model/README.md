This model simulates how a virus spreads through a human population.

Green agents (healthy people) have a chance of becoming sick if they are within the search radius of a red agent (sick person). Each step, sick agents have a chance to recover or a chance of dying. If an agent dies it's removed from the map. If an agent recovers they are rendered grey and are immune to the disease until their immunity wears out at which point they become green, healthy agents again.

If an agent is infected, after time_to_symptoms the agent will request a test from the Hospital. If the test catches a true positive, the agent learns they are sick and, depending on properties of the simulation run, will with some likelihood stay home. If it's a severe case and the hospital has capacity, they will stay at the hospital.

Agents move around the map, clustering near homes, grocery stores, and offices. The map loosely reflects the population density of San Francisco, in that Census GIS data informed the distribution of homes around the map.

```video
https://cdn-us1.hash.ai/site/City_Infection_Model.mp4
```
