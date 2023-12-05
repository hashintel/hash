---
title: Built-in message handlers
slug: simulation/creating-simulations/agent-messages/built-in-message-handlers
objectId: c38f31e7-519c-4e5a-ba60-267c33c859ba
description: Add and remove agents by interacting with HASH Core
---

# Built-in message handlers

In addition to the custom messages you can send between individual agents in the simulation, HASH Core has a set of built-in messages that enable more advanced functionality.

Currently, the most powerful built-in message handlers allow agents to add or remove other agents from the simulation. These messages must be sent to `hash` to be processed by the simulation engine. If not, they will be directed to an agent with a matching ID/name, and you will be very confused. If the agent with a matching name doesn't exist, the message goes unsent and nothing will happen. Again, you will be very confused.

## Removing Agents via Messages

Any agent can remove any other agent with a special message sent directly to `hash`. Here, we remove an agent with `agent_name: "Bill"`. Before the next step starts executing, the message will be processed and Bill will be removed \(sorry Bill!\).

<Hint style="warning">
**Case sensitivity matters.** If a message is sent to `bill`, it will not be received by `Bill`. The only exception to this rule is that any message sent to hASh, Hash, HASH, haSh, or any similar variant will be forwarded to the engine.
</Hint>

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.addMessage("hash", "remove_agent", { agent_id: "Bill" });
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    state.add_message("HASH", "remove_agent", { "agent_id": "Bill"})
```

</Tab>
</Tabs>

If a "remove_agent" message is sent without an id or name specified in the data, then the agent_id defaults to that of the sender. We suggest setting the field as `state.agent_id` for readability but it can be used as shorthand when an agent needs to remove itself.

## Creating Agents via Messages

Any agent can also create new agents. Any message sent to `hash` with the `create_agent` type will result in the engine spawning a new agent. By default this agent will lack position or direction, and the engine will not try to place the agent for you.

Here, anything in the data field will be used to define the state of the new agent. The `newborn` behavior is given to this agent, but remember, it will not be run until the next step.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.addMessage("hash", "create_agent", {
    parent: state.agent_id,
    behaviors: ["newborn.js"],
  });
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    state.add_message("HASH", "create_agent", {
        "parent": state.agent_id,
        "behaviors": ["newborn.py"]
    })
```

</Tab>
</Tabs>

## Navigation with Mapbox

Message handlers can also be used to access 3rd party APIs during the runtime of a HASH simulation. Within hCore you can interface with _Mapbox_, our first externally-supported API. Additional APIs will be added in the future and you can [contact us](https://hash.ai/contact) to request we whitelist additional services for you. Utilizing HASH Engine you are free to call out to whatever external services you like.

Using the existing Mapbox API message handler, any agent can request navigation directions between two points. But first, you'll need to activate the Mapbox message handler in your `globals.json` file:

```javascript
{
    "messageHandlers": ["mapbox"]
}
```

You can then create the message by providing starting and ending coordinates, as well as the transportation method in the data field. The valid transportation methods are: `biking`, `walking`, `driving` and `driving-traffic`.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  // Longitude and Latitude coordinates
  const start_lng_lat = [-71.117128, 42.389755];
  const end_lng_lat = [-71.096227, 42.304433];

  const start_string = start_lng_lat[0] + "," + start_lng_lat[1];
  const end_string = end_lng_lat[0] + "," + end_lng_lat[1];

  state.addMessage("mapbox", "mapbox_request", {
    transportation_method: "driving",
    request_route: start_string + ";" + end_string,
  });
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    # Longitude and Latitude coordinates
    start_lng_lat = [-71.117128, 42.389755]
    end_lng_lat = [-71.096227, 42.304433]

    start_string = '{},{}'.format(start_lng_lat[0], start_lng_lat[1])
    end_string = '{},{}'.format(end_lng_lat[0], end_lng_lat[1])

    state.add_message('mapbox', 'mapbox_request', {
        'transportation_method': 'driving',
        'request_route': start_string + ';' + end_string
    })
```

</Tab>
</Tabs>

If you provided a valid request, the Mapbox message handler then returns you a results message. If your request was invalid, it will return an error message with a brief description of the error.

```javascript
// Returned route message
{
    "from": "mapbox",
    "type": "mapbox_response",
    "data": {
      "routes": [
        {
          "distance": 1554.3,
          "duration": 423.8,
          "geometry": {
            "coordinates": [
              [
                -74.003636,
                40.743162
              ],
              [
                -74.004329,
                40.742431
              ],
              ...
            ],
            "type": "LineString"
          },
          ...
        }
      ],
      ...
    },
}

// Sample error message
{
  "from": "mapbox",
  "type": "mapbox_response",
  "data": {
      "code": "InvalidInput",
      "message": "Coordinate is invalid: 182,40.74317449"
    },
}
```

For further information about the Mapbox API and error messages, see the [official documentation](https://docs.mapbox.com/api/navigation/#directions). Note that HASH only supports this specific call at the moment.

**Check out these two examples to see Navigation in action:**

- [Citi Bike Visualization](/@hash/citi-bike-visualization)
- [Product Delivery](/@hash/product-delivery)

## Stopping a simulation

A simulation may be stopped by sending a message of type `"stop"` to `"hash"`. This built-in message may be useful to stop a simulation after a given number of steps, or when some condition has been reached in the simulation state.

<Tabs>

<Tab title="JavaScript">

```javascript
const behavior = (state, context) => {
  if (context.step() > 10) {
    state.addMessage("hash", "stop", { status: "success", reason: "10 steps" });
  }
};
```

</Tab>

<Tab title="Python">

```python
def behavior(state, context):
  if context.step() > 10:
    state.add_message("hash", "stop", {"status": "success", "reason": "10 steps"})
```

</Tab>

</Tabs>

The message `data` is optional, but may be used to signify why the simulation stopped. The following fields may be included:

1.  `"status"`: one of `"success"`, `"warning"` or `"error"`. Defaults to `"warning"` if not specified.
1.  `"reason"`: a message describing why the simulation was stopped.
