---
title: Tankers to Port
slug: simulation/extra/migrating/anylogic/building-the-simulation/tankers-to-port
objectId: a83de86e-50f5-4651-b290-33ab9a3e6265
---

# Tankers to Port

We’ve identified **Tankers** as a good place to start in this simulation. Let’s build one, along with a **Port** agent for it to interact with!

## Tanker

Our **Tanker** needs to be able to move towards its destination at a constant velocity. Movement like this can easily be accomplished by adjusting the`lng_lat` or `position` property.

```javascript
// tanker.js
/**
 * Move the tanker to its destination based on its speed.
 * Return its new lng_lat coordinates.
 */
function new_coords(lng_lat, destination) {
  const dx = destination[0] - lng_lat[0];
  const dy = destination[1] - lng_lat[1];

  const vec = hstd.normalizeVector([dx, dy]);

  return [
    lng_lat[0] + vec[0] * state.get("speed"),
    lng_lat[1] + vec[1] * state.get("speed"),
  ];
}

const ll = state.get("lng_lat");
const dest = state.get("destination");

// Move to destination
state.set("lng_lat", new_coords(ll, dest));
```

On this agent, and many others in the sim, we'll use a published behavior, [Lng_Lat to Position](/@hash/ll-to-pos/overview), to translate its latitude and longitude into a 3D position.

<Hint style="warning">
To use a shared behavior like Lng_Lat To Position, [you'll need to import it into your simulation](/docs/simulation/creating-simulations/behaviors/composable-behaviors#importing-a-behavior).
</Hint>

Note that we need to also set some properties in the **globals.json** file to use the behavior.

**globals.json**

```javascript
{
  "center_ll": [0, 0],
  "scale_ll": 1,
  "seconds_per_step": 60
}
```

In the finished sim, the tanker.js file behavior also detects whether the agent has reached its destination to begin unloading. You'll also need to logic to `initialize.py` in order to create the **Tanker.**

```python
# initialize.py

def behavior(state, context):
    sec_per_step = context.globals()['seconds_per_step']

    agents = []

    agents.append({
      'type': 'tanker',
      'agent_name': 'tanker',
      'lng_lat': [0, 0],
      'destination': [5, 5],
      'behaviors': ['tanker.js', '@hash/ll-to-pos/ll_to_pos.js'],
      'speed': 6.028e-5 * sec_per_step, # convert knots to ll per second
      'scale': [0.5, 1],
      'color': 'green'
    })

    messages = state.get('messages');

    for agent in agents:
      messages.append({
        'to': 'hash',
        'type': 'create_agent',
        'data': agent
      })

    state.set('messages', messages)
```

Now let’s create a port that the **Tanker** unloads to.

## Port

To give the **Port** unloading behavior, we'll make use of a published behavior in hIndex called [In Flow](/@hash/in-flow). If we look at its documentation \[here\] we can see what properties we need to initialize our **Port** with. It's not enough just to add this behavior to **Port** agents, since the **Tankers** need to cooperate during the unloading process. We'll give them the complementary [Out Flow](/@hash/out-flow) behavior.

```python
# initialize.py

def behavior(state, context):
    sec_per_step = context.globals()['seconds_per_step']

    agents = []

    # Create a tanker
    agents.append({
      'type': 'tanker',
      'agent_name': 'tanker',
      'lng_lat': [0, 0],
      'destination': [5, 5],
      'behaviors': ['tanker.js', '@hash/out-flow/out_flow.js', '@hash/ll-to-pos/ll_to_pos.js'],
      'speed': 6.028e-5 * sec_per_step, # convert knots to ll per second
      'scale': [0.5, 1],
      'color': 'green'
    })

    # Create a port
    agents.append({
        'lng_lat': [5, 5],
        'capacity': 15000,
        'crude': random.uniform(capacity * .2, capacity * .8),
        'behaviors': ['port.js', '@hash/in-flow/in_flow.js', '@hash/ll-to-pos/ll_to_pos.js'],
        'in_flow_property': 'crude',
        'in_nodes': [loc['id'] + ' tanker'],
        'prev_order': 0,
        'flow_rate': 0.1 * sec_per_step, # cubic meters per hour
        'position': None,
        'color': 'purple',
        'scale': [0.5, 0.5]
      })


    # Send create messages for all agents
    messages = state.get('messages');

    for agent in agents:
      messages.append({
        'to': 'hash',
        'type': 'create_agent',
        'data': agent
      })

    state.set('messages', messages)
```

The final addition to the tanker.js behavior is logic to detect when we're finished unloading and then set a `returning` property to indicate we should return to the loading location. Test it, and make sure that all the behaviors are working properly! Now let’s build the **Refinery** that connects to our **Port**.
