# Add heterogeneity

One thing that sets agent-based modeling apart from analytic techniques or system dynamic models is the ease with which you can add 'heterogeneity'. This means that our population of agents can have different demographic features, for example in HASH you can easily create a distribution of age by adding a property and assigning different age values to different agents.

These different values can allow our agents to all behave in slightly different ways, or cause other agents to interact with them differently.

In our Getting Started model, we'll start by providing our agents with an 'at\_risk' property. Different people agents will have different chances of having a severe response to getting sick. In create\_people.js, add a line for the property at\_risk: 

```javascript
{
...
at_risk: Math.random() < 0.5 ? true : false,
}
```

In infection.js, when a Person agent gets infected, let's add logic to determine the severity of the infection. In line 80:

```javascript
 const severe_chance = state.at_risk ? at_risk_chance_of_severe : chance_of_severe;
   if ((state.severity === "moderate") && (Math.random() < severe_chance)) {
     state.severity = "severe";
   }
```

When we instantiate a Person, they'll have a 50% chance of being at\_risk from the virus, and if they're infected, they'll have a different likelihoods of getting a severe infection.  These likelihoods are defined in the properties tab.

Of course during different scenarios and experiments we might want to vary the likelihood that someone will be at risk. Instead of hardcoding the likelihood, we will add a property called at\_risk\_percent.

```javascript
// properties.json
{
...
"at_risk_percent": 0.05,

}
```

```javascript
//create_people.js
(state, context) => {

    const { people_per_home, at_risk_percent } = context.properties;
    ...
    state.agents["people"].push({
      ...
      at_risk: Math.random() < at_risk_percent ? true : false,
    }
    
    return state;
}
```

