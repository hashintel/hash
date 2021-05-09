# Create a Hospital

Select initialState.json. It should look like:

```javascript
[
  {
    "behaviors": [
      "@hash/create_scatters.js",
      "create_people.js",
      "@hash/create_agents.js",
      "@hash/remove_self.js"
    ],
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
    ]
  }
]
```

initialJson defines our initial agent\(s\), which in this case is a creator agent. It has a set of four behaviors that will populate our world. In order:

* First run @hash/create\_scatters.js. This is a [shared behavior](../behaviors/) that, when added to an agent, will create all of the associated "scatter\_templates". It's called scatter because it's scattering the child agents around the map.
* Second it will run create\_people.js, a behavior local to this simulation. In this behavior we've defined our people agents and associated them with their homes, offices, and groceries.
* Third is the @hash/create\_agents.js - in the previous two functions we didn't fully create our agents, we just added them to an agents object on the "creator agent". This behavior iterates through that object and sends messages to the [reserved hash keyword create\_agent](https://app.gitbook.com/@hash-1/s/core/~/drafts/-M3yIAt-weMIyGiVronu/agent-messages/built-in-message-handlers) to instantiate all of our new agents.
* Finally fourth it runs @hash/remove\_self.js, which will appropriately enough remove itself from the simulation. We don't want to constantly be generating new grocery stores!

This creator pattern is a common and recommended method for generating multiple agents, and it’s worth taking the time to look into the files double check your understanding.

Now that we understand how you can create an agent, let’s create a hospital. Since we’re not dynamically generating multiple hospitals, we could just add the hospital directly in our initialState page.

```javascript
{
 agent_name: "Hospital",
 position: SET_POSITION,
 height: SET_HEIGHT,
 color: SET_COLOR,
 behaviors: []
}

```

Or, we can follow the creator pattern and add it as a "stack" \(as it's at a specific location\). To do that we'd add stack\_templates to our agent, as well as add the @hash/create\_stacks.js behavior. Since it's a shared behavior, you can search in the index panel in the lower left for it. Double click and it will be added to your simulation.

![It&apos;s easy to find powerful behaviors in the hIndex to add to your models \(or share your own!\) ](../.gitbook/assets/screen-shot-2020-04-02-at-9.48.14-pm.png)

```javascript
[
  {
    "behaviors": [
      "@hash/create_scatters.js",
      "@hash/create_stacks.js",
      "create_people.js",
      "@hash/create_agents.js",
      "@hash/remove_self.js"
    ],
...
"stack_templates": [
  {
    "template_name": "hospitals",
    "template_count": 1,
    "template_position": "center",
    "behaviors": [],
    "height": 4,
    "color": "blue",
  }
]
```

You can set the position, color, and height as whatever you’d like. 

* Position is an \[x,y\] array that determines the location of the agent on the 3d viewer.
* Height can be any integer - the default size is 1. 

Click Reset Simulation in the bottom right under the 3d viewer. If you added the hospital directly to  initialState you should see it appear in the viewer - if you're using create\_stacks then click Start Simulation. After three frames you should see it.  Congratulations, you’ve built your first hospital! We’re proud of you.

At the moment the hospital doesn’t do anything. It just sits there, begging for a purpose. So let's add some functionality. There’s two things we want our hospital to do. 

1. **Provide tests to people.** If a person is infected and suspects they are sick, they should be able to contact the hospital and request a test. The hospital will see if they’re sick and send them the results.
2. **ICU capacity.** If a person is really sick, they get admitted into the hospital’s ICU. The hospital should only have a limited set of beds, and if they’re over capacity the person will be turned away.

