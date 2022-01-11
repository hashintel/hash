---
title: Create an ICU
slug: simulation/tutorials/extending-an-epidemic-model/create-an-icu
objectId: 56e39f54-05c5-492e-bf42-75143e76e0a9
---

# Create an ICU

So now we can tell people they’re sick, and when they hear they’re sick they go home. But we also want to account for another function of a hospital - providing treatment for severe cases.

Let’s breakdown what we’ll need to modify in our existing model:

1.  **At risk.** Right now a person is infected or not infected, but we want to delineate between the mild and severe cases.
1.  **ICU Capacity.** A hospital, so long as it has room in its intensive care unit, should treat severe cases. Instead of going home, the person will move to the hospital and stay there until they’re recovered.

On your Hospital initialization \(in `init.json`\), add a value for `icu_beds`. This will represent the number of Intensive Care Unit beds that a hospital has.

**init.json**

```javascript
 "icu_beds": 10,
```

In `init.json` , expand the hospital agent by adding a value for `icu_capacity`.

<Tabs>
<Tab title="JavaScript" >

```javascript
{
  "agent_name": "Hospital",
  "position": [20,20],
  "height": 4,
  "color": "blue",
  "icu_beds": 10,
  "behaviors": ["test_for_virus.js"]
  "type": "hospital"
}
```

</Tab>

<Tab title="Python" >

```javascript
{
  "agent_name": "Hospital",
  "position": [20,20],
  "height": 4,
  "color": "blue",
  "icu_beds": 10,
  "behaviors": ["test_for_virus.py"]
  "type": "hospital"
}
```

</Tab>
</Tabs>

_Note: Your init.json might look different if you used `create_stacks or create_scatters` - the same basic approach should apply._

If you reset the simulation and click on the hospital agent the inspect modal will now display the value for `icu_beds`. Click the inverted pyramid to select/deselect displayed attributes.

![](https://cdn-us1.hash.ai/site/docs/tutorial-extending-epidemic-icu-beds.png)

Open the `check_infected` file. A person agent is sending a request to the hospital to test them; now they should also send personal information to the hospital. In particular we want to know how likely it is they're `at_risk` of complications from the disease. It’s a little bit of a hand-wave that they are directly sending their `at_risk` level - you can imagine they’re sending a blood/spit sample and don’t know what it contains, or providing demographic info like their age or pre-existing conditions. In a more complicated model we'd likely determine their `at_risk` degree from a variety of different measures.

In this case, let's include a key-value pair in the message data packet for `at_risk` in the "check_infected" behavior:

<Tabs>
<Tab title="JavaScript" >

```javascript
function check_hospital() {
  state.addMessage("Hospital", "test", {
    test_sick: true,
    at_risk: state.at_risk,
  });
}
```

</Tab>

<Tab title="Python" >

```python
def check_hospital():
   state.add_message("Hospital", "test", {
       'test_sick': True,
       'at_risk': state['at_risk']
    })
```

</Tab>
</Tabs>

Open the `test_for_virus` behavior and, in our message parsing loop, add control-flow logic to differentiate the risky cases from the non-risky cases. When a person is seriously ill, they get a bed in the hospital, so long as there’s a bed to give:

<Tabs>
<Tab title="JavaScript" >

```javascript
// test_for_virus.js

test_messages.forEach((m) => {
  let icu_or_home = false;

  if (state.icu_beds && m.data.at_risk) {
    state.icu_beds -= 1;
    icu_or_home = true;
  }
  //existing code
});
```

</Tab>

<Tab title="Python" >

```python
# test_for_virus.py

for msg in test_messages:
    # ...
    icu_or_home = False
    icu_beds = state['icu_beds']

    if icu_beds > 0 and msg['data']['at_risk']:
        state['icu_beds'] = state['icu_beds'] - 1;
        icu_or_home = True
```

</Tab>
</Tabs>

Let’s add a flag that the person has a case severe enough that they will stay in the hospital; this is how we’ll let the person know they either need to stay at the hospital or they can rest up at home. Modify the message sent to include that variable:

<Tabs>
<Tab title="JavaScript" >

```javascript
// test_for_virus.js

test_messages.forEach((m) => {
  // ...
  let icu_or_home = false;

  if (state.icu_beds && m.data.at_risk) {
    state.icu_beds -= 1;
    icu_or_home = true;
  }

  state.addMessage(m.from, "test_result", {
    sick: true,
    icu_or_home: icu_or_home,
  });
});
```

</Tab>

<Tab title="Python" >

```python
# test_for_virus.py

for msg in test_messages:
    # ...
    icu_or_home = False
    icu_beds = state['icu_beds']

    if icu_beds > 0 and msg['data']['at_risk']:
        state['icu_beds'] = state['icu_beds'] - 1;
        icu_or_home = True

    state.add_message(m['from'], 'test_result', {
        'sick': True,
        'icu_or_home': icu_or_home
    })
```

</Tab>
</Tabs>

Let’s return to our person agent. They’ve just received a message from the hospital telling them if they're sick and if they should go home or come to the hospital. We already have the mild case handled - they go home. We need to modify the logic for the severe case:

<Tabs>
<Tab title="JavaScript" >

```javascript
// check_infected.js
//A person checks for messages from the hospital telling them their test results
let msgs = context.messages().filter((msg) => msg.type === "test_result");

msgs.forEach((msg) => {
  if (msg.data.sick && msg.data.icu_or_home) {
    state.icu = true;
    state.destination = state.hospital;
  } else if (msg.data.sick) {
    state.destination = state.home;
  }
});
```

</Tab>

<Tab title="Python" >

```python
# check_infected.py
# A person checks for messages from the hospital telling them their test results
msgs = list(filter(lambda m: m['type'] == 'test_result', context.messages()))

for msg in msgs:
  if msg['data']['sick'] and msg['data']['icu_or_home']:
    state['icu'] = True
    state['destination'] = state['hospital']
  elif msg['data']['sick']:
    state['destination'] = state['home']
```

</Tab>
</Tabs>

With this change if a person finds out they have a severe case, their destination is set as the hospital.

We'll need to make a change to the `daily_movement` file as well, to prevent the agent from moving away once they've arrived at the icu until they're better.

<Tabs>
<Tab title="JavaScript" >

```javascript
// daily_movement.js
// Line 53
if (state.social_distancing || state.icu) {
  return;
}
```

</Tab>

<Tab title="Python" >

```python
# daily_movement.py
# Line 53
if state['social_distancing'] or state['icu']:
  return
```

</Tab>
</Tabs>

When they recover, we want agents to signal to the hospital that they’re leaving and that there’s a free ICU bed available. And then, of course, we want agents to actually leave!

We need to add:

- A message sender that, when a person is recovered, sends a message to the hospital that they’re better.
- A message handler that increments the hospital's `icu_capacity` by 1 when it receives the “recovered” message.

The `infection` behavior handles the logic for infection state:

<Tabs>
<Tab title="JavaScript" >

```javascript
// infection.js
// Line 87
if (state.infection_duration === 0) {
    state.health_status = Math.random() < immunity_proportion ? "immune" : "healthy");
    state.color = "green";
    //TODO: notify the hospital the person has recovered
}
```

</Tab>

<Tab title="Python" >

```python
# infection.py
# Line 74
if state['infection_duration'] == 0:
  status = 'immune' if random() < g['immunity_proportion'] else 'healthy'
  state['health_status'] = status
  state['color'] = 'green'
  # TODO: notify the hospital the person has recovered
```

</Tab>
</Tabs>

This is another opportunity to use message passing. We'll create a message to send to the Hospital telling them that the person has recovered.

<Hint style="info">
A key paradigm for HASH is message passing. HASH is based on the [actor model](https://en.wikipedia.org/wiki/Actor_model), and message passing between agents is how agents interact w/ one another.
</Hint>

<Tabs>
<Tab title="JavaScript" >

```javascript
// Line 87
if (state.infection_duration === 0) {
    state.health_status = Math.random() < immunity_proportion ? "immune" : "healthy");
    state.color = "green";

    if (state.icu) {
        state.addMessage("Hospital", "recovered", {
            "msg": "All Better!"
        })
        state.icu = false;
        state.destination = state.home;
        state.out = true;
    }
}
```

</Tab>

<Tab title="Python" >

```python
# Line 74
if state.infection_duration == 0:
  status = 'immune' if random() < g['immunity_proportion'] else 'healthy'
  state['health_status'] = status
  state['color'] = 'green'

  if state['icu']:
    state.add_message('Hospital', 'recovered', {
      'msg': 'All Better!'
    })
    state['icu'] = False
    state['destination'] = state['home']
    state['out'] = True
```

</Tab>
</Tabs>

Finally, let's handle the message logic on the Hospitals side in the "test_for_virus" behavior at the top of the behavior:

<Tabs>
<Tab title="JavaScript" >

```javascript
// test_for_virus.js

const recovered_messages = context
  .messages()
  .filter((m) => m.type === "recovered");
//Frees up a bed for each (recovered,severe) case
recovered_messages.forEach((m) => (state.icu_beds += 1));
```

</Tab>

<Tab title="Python" >

```python
# test_for_virus.py

recovered_messages = list(filter(lambda m: m['type'] == 'recovered', context.messages()))

# Free up a bed for each (recovered and severe) case
for msg in recovered_messages:
    state['icu_beds'] += 1
```

</Tab>
</Tabs>

Congratulations! You've added a hospital and some basic behaviors to your simulation. You should now be starting to see how adding agents and behaviors can quickly create models that mirror the real world.
