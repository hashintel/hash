This extends the [City Infection Model](https://hash.ai/index/5e863dcaeb2a7120ea2fe0b8/city-infection-model) to include an agent which introduces a vaccine at time step `vaccination_step` defined in `globals.json`.

People agents have a likelihood of `vaccine_uptake` to become vaccinated. By modifying the `vaccine_uptake` rate, we can demonstrate the effects "anti-vax" misinformation in reducing the impact a vaccine could have in stopping an infection.

When `vaccine_uptake` is 0.7, most of the susceptible population still contracts the disease.

Comparing a `vaccine_uptake` of 0.7 with 0.95, almost double the population becomes infected, from 7% to 15%. This is also dependent on the timestep at which the vaccine is introduced.

See also HASH user Ben Glotzer's [information spread](https://hash.ai/index/5edea2b620a158daa096feaa/information-spread) model and the [rumor mill (public health)](https://hash.ai/index/5e86a1e8eb2a71338b2fe112/rumor-mill-public-health-practices) simulation

Individual behaviors in this simulation have been published independently, including:

- [infection.js](https://hash.ai/index/5e9f12bc9498b772f70a6292/infection)
- [introduce_vaccine.js](https://hash.ai/index/5e879b6dec445d7464c73941/introduce-vaccine)

```video
https://cdn-us1.hash.ai/site/City_Infection_Model.mp4
```
