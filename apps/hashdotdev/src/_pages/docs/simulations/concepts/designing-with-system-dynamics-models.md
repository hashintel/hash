---
title: System Dynamics
slug: simulation/concepts/designing-with-system-dynamics-models
objectId: aef10a45-182a-486c-96b4-079ac06bb72d
---

# System Dynamics

System dynamics model allow you to understand non-linear complex systems based on rates of change. Also known as stock-and-flow models, they consist of a set of "stocks" and the "flows" between them. These models allow you to understand the feedback loops inherent in a system.

The [System Dynamics Library](/@hash/sd) will allow you to easily create them in your HASH simulations. You'll need to import the library and then configure your agent with the correct set of properties.

## Defining a System Dynamics Model

System Dynamics models exist on an agent, either on their own, or in conjunction with other behaviors. While very simple to get started, you can create very complex models using this library.

### Behaviors

Your agent only needs to run two behaviors to execute a system dynamics model:

- `@hash/sd/calc_rates.js` - determines and assigns all flow rates for the current time step
- `@hash/sd/step.js` - runs the model one step forward using the current flow rates and stock values

<Hint style="info">
Make sure that your agent's `behaviors` array always contains the two behaviors in that order.
</Hint>

### Properties

The system dynamics agent needs to have a property for each "stock" in the model, as well as any constants that will be referenced when calculating rates. The stocks must be present on the top level of the agent, while the constants may be nested.

An model that calculates population levels might look something like this:

```json
{
  "behaviors": ["@hash/sd/calc_rates.js", "@hash/sd/step.js"],
  "children": 200,
  "adults": 1000,
  "birth_rate_constant": 0.1,
  "maturation_rate_constant": 0.3,
  "death_rate_constant": 0.11,
  "sd_definition": {
    "...": "..."
  }
}
```

### The 'sd_definition' Property

The final step is to define the rates in your model. Each rate will have 3 or 4 properties defined:

- `rate` - the rate value for the curren time step. Can initially be 0.
- `rate_expression` - a string expression that will be evaluated to determine the rate at every timestep. You may access `state` fields in this expression.
- `from` - the stock from which this rate is flowing. This stock will decrease at the rate.
- `to` - the stock to which this rate is flowing. This stock will increase at the rate.

<Hint style="info">
Some rates will only have one of "to" or "from" if they are coming from a sink, or going to a source.
</Hint>

```json
{
  "sd_definition": {
    "births": {
      "rate": 0,
      "rate_expression": "state.birth_rate_constant * state.adults",
      "to": "children"
    },
    "maturing": {
      "rate": 0,
      "rate_expression": "state.maturation_rate_constant * state.children",
      "from": "children",
      "to": "adults"
    },
    "deaths": {
      "rate": 0,
      "rate_expression": "state.death_rate_constant * state.adults",
      "from": "adults"
    }
  }
}
```

### Globals

As a final step, set the resolution of your time step in `globals.json` with a `dt` property. The smaller the value, the finer the resolution of your model will be \(but the more time steps it will take to run\).

```json
{
  "dt": 0.1
}
```

You now have a fully defined system dynamics model. Go ahead and create some metrics so that you can plot the values for "adults" and "children", and you should see something like this:

![](https://cdn-us1.hash.ai/site/docs/image%20%2862%29.png)
