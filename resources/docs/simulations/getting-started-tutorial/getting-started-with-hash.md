---
description: 'Estimated time: 20 mins'
---

# Getting Started with HASH

## Tutorial: Build a Hospital

In this tutorial we're going to augment one of our existing epidemiological simulations and add a hospital. Along the way you'll learn key features of hCore and how to use agent-based modeling to simulate and answer complex questions.  

 [Start by opening our base template](https://hash.ai/@hash/getting-started-base) and copying it into your hDrive.

{% hint style="info" %}
If you start editing an example simulation it will be automatically copied into your hDrive. Alternatively click copy in the top banner of the page.
{% endhint %}

We've provided a number of agents and behaviors already to simulate a virus spreading through a population. Look around at the files in the editor and click play to get a sense for how the simulation works now.

We have four distinct agents in the model. Three are locations - homes, groceries, and offices. The fourth are people. 

```javascript
 //initialState lines 9-35
 //...
   "scatter_templates": [
    {
      "template_name": "homes",
      "template_count": 100,
      "height": 2,
      "color": "yellow"
    },
    {
      "template_name": "groceries",
      "template_count": 3,
      "height": 2,
      "color": "purple"
    },
    {
      "template_name": "offices",
      "template_count": 10,
      "height": 2,
      "color": "grey"
    }
  ],
  "people_template": {
    "behaviors": ["infection.js", "check_infected.js", "daily_movement.js"],
    "severity": "moderate",
    "out": false,
    "social_distancing": false
  }
//...
```

Our people whiz about this simulated world, moving back and forth between groceries, work, and their homes, and occasionally \(depending on our parameters\), get sick. 

This tutorial is split into four sections: 

1. Adding unique characteristics to the People agents.
2. Creating a Hospital agent
3. Giving the Hospital the ability to test people to see if they're sick
4. Creating intensive care behaviors for those who are especially sick.

