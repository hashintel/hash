---
title: Hello, HASH!
slug: simulation/tutorials/hello-hash
objectId: 96392257-39b5-46e2-b655-6a4a78ab1450
description: "Get started creating agents in our Hello, HASH tutorial!"
---

# Hello, HASH

## Getting started with HASH

We're going to create a basic agent-based model where two agents will exchange pleasantries.

To start, create a new simulation file from scratch by using the _File_ menu and clicking _New Project_ > _Empty Simulation_.

In your new simulation workspace, open the `init.json` file in the `src` folder of the left-hand side panel. You'll see an empty pair of square brackets.

The `init.json` file defines the 'initial state' of the simulation as a collection of objects in a JSON array.

We'll begin by adding two agents into the array, and give them names.

```json
[
  {
    "agent_name": "Alice"
  },
  {
    "agent_name": "Bob"
  }
]
```

<Hint style="info">
`agent_name` is a [reserved keyword on agents](/docs/simulation/creating-simulations/anatomy-of-an-agent) - you can reference and send messages through `agent_name`
</Hint>

Beneath the workspace's right-hand view-pane, you'll find the simulation control buttons. Click the **Reset** button \(circular arrow\) and then select the [Raw Output](/docs/simulation/creating-simulations/views/raw-data#raw-output) tab in the viewer. Congratulations! You've given life to Alice and Bob.

However, if you toggle back from the raw output view to the 3D viewer, you may notice... nothing at all. Alice and Bob haven't been rendered, because they haven't been given a position in space. Let's go ahead and fix that.

```json
[
  {
    "agent_name": "Alice",
    "position": [0, 0]
  },
  {
    "agent_name": "Bob",
    "position": [2, 0]
  }
]
```

When you've finished adding positions to your agents, reset the simulation. You should now see two blocks in the 3D viewer representing our agents.

### Saying Hello

Alice and Bob aren't very interesting right now. Let's teach them some manners. We can give the agents [behaviors](/docs/simulation/creating-simulations/behaviors) that enable them to act and respond to each other. In `init.json` let's add some file names into each of the behavior arrays.

<Hint style="info">
You can build Python behaviors instead of JavaScript behaviors if you prefer. Just make sure to name your files with a ".py" ending.
</Hint>

```json
[
  {
    "agent_name": "Alice",
    "behaviors": ["hello_bob.js"],
    "position": [0, 0]
  },
  {
    "agent_name": "Bob",
    "behaviors": ["hello_alice.js"],
    "position": [2, 0]
  }
]
```

We can then create the corresponding behavior files by clicking the **New File** button at the top of the left hand files sidebar. Create two new files, `hello_alice.js` and`hello_bob.js`

![To create a new behavior file click the button in the top left corner](https://cdn-us1.hash.ai/site/docs/image%20%2833%29.png)

In **hello_alice**, we want to send a message **from** Bob **to** Alice.

HASH has built in support for [message](/docs/simulation/creating-simulations/agent-messages/) passing. Push a message object to an agent's message array, and it will deliver the message to the target agent in the next time step. The message array attached to an agent's state is like its outbox.

A message has three parts:

- `to`: the `agent_id` or an `agent_name`
- `type`: a string that identifies the type of message that is being sent
- `data`: a JSON object containing the message data

Since we're only sending a message to one agent, Alice, we can use her `agent_name` in the `to` field. Let's call this type of message a "greeting", and add a friendly greeting in the data payload.

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_alice.js
const behavior = (state, context) => {
  state.addMessage("Alice", "greeting", {
    msg: "Hello, Alice.",
  });
};
```

</Tab>

<Tab title="Python" >

```python
# hello_alice.py

def behavior(state, context):
  state.add_message(
      "Alice",
      "greeting",
      {
        "msg": "Hello, Alice."
      }
  )
```

</Tab>
</Tabs>

<Hint style="info">
[_state.addMessage is a helper function_](/docs/simulation/creating-simulations/agent-messages/) _for pushing_ [_messages_](/docs/simulation/creating-simulations/agent-messages/) _to the outgoing messages array._
</Hint>

Now click **Run Simulation**.

![The Run Simulation is the 'Running Person' Icon in the bottom left of the editor.](https://cdn-us1.hash.ai/site/docs/image%20%2831%29.png)

You won't see anything happen in the 3D viewer, but if you click Raw Output you'll see our Bob agent now has an array of messages with one message to Alice. _**Bob is sending this same message every time step to Alice.**_

In our **hello_bob** function, we want Alice to handle messages she receives. When an agent receives a message addressed to them, it's stored in their [Context](/docs/simulation/creating-simulations/anatomy-of-an-agent/context), in `context.messages()`. `context.messages()` functions as an agent's inbox. Agents can iterate through their messages array and act on specific messages.

Let's find all of the messages that are greetings:

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_bob.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");

  if (greetings.length > 0) {
    // do something
  }
};
```

</Tab>

<Tab title="Python" >

```python
# hello_bob.py
def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        # do something
```

</Tab>
</Tabs>

Adding visual indicators of state changes is an easy way to communicate what's happening in your simulation. We're going to change Alice's color when receiving a greeting:

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_bob.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");
  if (greetings.length > 0) {
    state.color = "blue";
  }
};
```

</Tab>

<Tab title="Python" >

```python
# hello_bob.py

def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        state["color"] = "blue"
```

</Tab>
</Tabs>

Now **reset** your simulation and **run** it. On the second time step you should notice that Alice's agent changes color to blue. Neat!

To respond to Bob's greeting, we can send a message back addressed to the first message sender, with an appropriate response.

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_bob.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");
  if (greetings.length > 0) {
    state.color = "blue";

    greetings.forEach((m) =>
      state.addMessage(m.from, "greeting", {
        msg: "Go away, I’m social-distancing!",
      }),
    );
  }
};
```

</Tab>

<Tab title="Python" >

```python
# hello_bob.py

def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        state["color"] = "blue"

        for greeting in greetings:
            state.add_message(greeting['from'], "greeting", {
                "msg": "Go away, I’m social-distancing!"
            })
```

</Tab>
</Tabs>

Here we're iterating through filtered messages and pushing a new message to Alice's message array, addressed to whichever agent sent the message, 'greeting' them back.

Over in **hello_alice**, we can add a similar message handler for Bob, too.

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_alice.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");
  if (greetings.length > 0) {
    state.color = "red";
  }
  state.addMessage("Alice", "greeting", {
    msg: "Hello, Alice.",
  });
};
```

</Tab>

<Tab title="Python" >

```python
# hello_alice.py

def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        state["color"] = "red"

    state.add_message(
      "Alice",
      "greeting",
      {
        "msg": "Hello, Alice."
      }
  )
```

</Tab>
</Tabs>

**Reset** and **run** your simulation once again. Alice and Bob turn blue and red, respectively, after they receive the others greeting.

It's a little boring to just have them stay red and blue throughout the rest of the simulation. We can help visualize better what's going on in the simulation by having both agents flip colors whenever they receive a new message. The logic we want is:

<Tabs>
<Tab title="JavaScript" >

```javascript
state.color = state.color === "blue" ? "green" : "blue";
```

</Tab>

<Tab title="Python" >

```python
    state['color'] = 'blue' if state['color'] == 'green' else 'blue'
```

</Tab>
</Tabs>

or:

<Tabs>
<Tab title="JavaScript" >

```javascript
state.color = state.color === "purple" ? "red" : "purple";
```

</Tab>

<Tab title="Python" >

```python
    state['color'] = 'purple' if state['color'] == 'red' else 'red'
```

</Tab>
</Tabs>

We can refactor our code slightly to implement this.

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_alice.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");

  if (greetings.length > 0) {
    state.color = state.color === "purple" ? "red" : "purple";
  }

  state.addMessage("Alice", "greeting", {
    msg: "Hello, Alice.",
  });
};
```

</Tab>

<Tab title="Python" >

```python
# hello_alice.py

def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        state["color"] = "red" if state["color"] == "purple" else "purple"

    state.add_message(
      "Alice",
      "greeting",
      {
        "msg": "Hello, Alice."
      }
  )
```

</Tab>
</Tabs>

<Tabs>
<Tab title="JavaScript" >

```javascript
// hello_bob.js

const behavior = (state, context) => {
  const greetings = context.messages().filter((msg) => msg.type === "greeting");
  if (greetings.length > 0) {
    state.color = state.color === "blue" ? "green" : "blue";

    greetings.forEach((m) =>
      state.addMessage(m.from, "greeting", {
        msg: "Go away, I’m social-distancing!",
      }),
    );
  }
};
```

</Tab>

<Tab title="Python" >

```python
# hello_bob.py

def behavior(state, context):
    greetings = list(filter(lambda m: m['type'] == "greeting", context.messages()))

    if (len(greetings) > 0):
        state["color"] = "blue" if state["color"] == "green" else "green"

        for greeting in greetings:
            state.add_message(greeting['from'], "greeting", {
                "msg": "Go away, I’m social-distancing!"
            })
```

</Tab>
</Tabs>

![Hello HASH!](https://cdn-us1.hash.ai/site/docs/blocks_flipping.gif)

Finally, since Alice clearly would like some socially-responsible distance from Bob, we can add movement to the agents. I'm going to use a shared behavior `@hash/random_movement/random_movement.rs` , to cause each agent move about the environment at random. I'll import the behavior from the hIndex, and then add the file name to each agent.

![](https://cdn-us1.hash.ai/site/docs/movement.gif)

```json
[
  {
    "agent_name": "Alice",
    "behaviors": ["hello_bob.js", "@hash/random-movement/random_movement.rs"],
    "position": [0, 0]
  },
  {
    "agent_name": "Bob",
    "behaviors": ["hello_alice.js", "@hash/random-movement/random_movement.rs"],
    "position": [2, 0]
  }
]
```

To prevent our agents from straying too far, we can set [bounds](/docs/simulation/configuration/topology/bounds-and-wrapping) on their environment in the `globals.json` file as follows:

```json
{
  "topology": {
    "x_bounds": [0, 20],
    "y_bounds": [0, 20]
  }
}
```

![Random Movement](https://cdn-us1.hash.ai/site/docs/apr-17-2020-14-40-53.gif)
