# Create Testing Behavior

To start let**'**s create a message from the Person agent that contains the basics - they’re requesting a test. In the `check_infected` behavior file, add a [message](../../creating-simulations/agent-messages/) function:

{% tabs %}
{% tab title="JavaScript" %}
{% code title="check\_infected.js" %}
```javascript
function check_hospital(state) {
   state.addMessage("Hospital", "test", {
      test_sick: true
   })
 }
```
{% endcode %}
{% endtab %}

{% tab title="Python" %}
{% code title="check\_infected.py" %}
```python
def check_hospital():
   state.add_message("Hospital", "test", {
      'test_sick': True
   })
```
{% endcode %}
{% endtab %}
{% endtabs %}

You can add this function within the behavior function or above it.

If the person agent runs the`check_hospital` function,  it will send a message to the agent named  Hospital, with metadata of type test and a data packet that contains the boolean variable `test_sick`.

But we don't want our Person agent to be spamming the Hospital with requests to be tested - we only want to send it when the Person suspects that they are sick. We can add a property called `time_to_symptoms` in `globals.json`. That’s how long it takes for a person to start showing symptoms:

{% code title="globals.json" %}
```javascript
 "time_to_symptoms" : 5,
```
{% endcode %}

We'll create a local variable to store the global global variable at the top of the `check_infected` behavior file, and add logic so it only sends a message after "symptoms" have developed:

{% tabs %}
{% tab title="JavaScript" %}
{% code title="check\_infected.js" %}
```javascript
function behavior(state, context) {
  const { time_to_symptoms } = context.globals();

  function check_hospital() {
    state.addMessage("Hospital", "test", {
       test_sick: true
    })
  }
 

  if (state.infected && state.infection_length >= time_to_symptoms) {
    check_hospital();
  }
}
```
{% endcode %}
{% endtab %}

{% tab title="Python" %}
{% code title="check\_infected.py" %}
```python
def behavior(state, context):
  time_to_symptoms = context.globals()['time_to_symptoms']

  def check_hospital():
    state.add_message("Hospital", "test", {
       'test_sick': True
    })
 

  if state['infected'] and state.infection_length >= time_to_symptoms:
    check_hospital()
```
{% endcode %}
{% endtab %}
{% endtabs %}

Now after a certain period of time the person agent will get suspicious they’re sick, and send a message to the hospital.

On the receiving end we need to add a message handler for the hospital. Create a new behavior file called `test_for_virus`. Add a message handler, so that every timestep an agent receives in its "mailbox" all the messages directed to its `agent_id` or `agent_name`:

{% tabs %}
{% tab title="JavaScript" %}
{% code title="test\_for\_virus.js" %}
```javascript
function behavior(state, context) {
    const test_messages = context.messages().filter(m => m.type === "test");
}
```
{% endcode %}
{% endtab %}

{% tab title="Python" %}
{% code title="test\_for\_virus.py" %}
```python
def behavior(state, context):
    test_messages = list(filter(lambda m: m['type'] == 'test', context.messages()))
```
{% endcode %}
{% endtab %}
{% endtabs %}

{% hint style="info" %}
While right now it’s not necessary to filter by type == test, it’s good practice when, in the future, we send a wider variety of messages to the Hospital.
{% endhint %}

Make sure to attach it to the Hospital. Since we know we'll always want the behavior associated with the hospital, add it to the agent definition.

{% tabs %}
{% tab title="JavaScript" %}
```javascript
{
    "template_name": "hospitals",
    "template_count": 1,
    "template_position": "center",
    "agent_name": "Hospital", 
    "behaviors": ["test_for_virus.js"],
    "height": 4,
    "color": "blue",
    "type": "hospital"
  }
```
{% endtab %}

{% tab title="Python" %}
```javascript
{
    "template_name": "hospitals",
    "template_count": 1,
    "template_position": "center",
    "agent_name": "Hospital", 
    "behaviors": ["test_for_virus.py"],
    "height": 4,
    "color": "blue",
    "type": "hospital"
  }
```
{% endtab %}
{% endtabs %}

So what should we tell our patient? If the person is sick the test should detect that they are sick; right now the only time a person messages the hospital is if they’re sick, so testing will be easy!

Let's check all of the messages and respond to each person, letting them know they are in fact sick. Add this snippet within the behavior.

{% tabs %}
{% tab title="JavaScript" %}
{% code title="test\_for\_virus.js" %}
```javascript
 test_messages.forEach(m => state.addMessage(
   m.from,
   "test_result",
   {
     sick: true,
   }
 ))
```
{% endcode %}
{% endtab %}

{% tab title="Python" %}
{% code title="test\_for\_virus.py" %}
```python
for msg in test_messages:
  state.add_message(msg['from'], 'test_result', {
     'sick': True,
  })
```
{% endcode %}
{% endtab %}
{% endtabs %}

Back in `check_infected` , we similarly want to check for any messages about our tests.

{% tabs %}
{% tab title="JavaScript" %}
```javascript
let msgs = context.messages().filter(msg => msg.type === "test_result");
msgs.forEach(msg => {
     if (msg.data.sick) {
     //do something
       break;
     }
    })
```
{% endtab %}

{% tab title="Python" %}
```python
msgs = list(filter(lambda m: m['type'] == 'test_result', context.messages()))
for msg in msgs:
   if msg['data']['sick']:
     # do something
     break
```
{% endtab %}
{% endtabs %}

Now that our agent knows it’s sick, what should we do? When you’re sick, you should stay home and rest. So should our Person agents. 

The `daily_movement` behavior contains our agent's  movement logic. Importantly, we can have a Person go to a new destination by setting `state.set("destination", state.get("new_destination"))` so long as the `new_destination` is one that it has a "location for". Select the `create_people` behavior. You can see we assign each Person agent a grocery or office as their go-to grocery or office, and we store the position as a property on the Person:

{% tabs %}
{% tab title="JavaScript" %}
```javascript
// Line 20
const grocery = random_choice(agents["groceries"]).position;
const office = random_choice(agents["offices"]).position;

const template = state.people_template;

  agents["people"].push({
    ...template,
    position: home.position,
    home: home.position,
    grocery,
    office,
    // ...
  }
```
{% endtab %}

{% tab title="Python" %}
```python
# Line 14
grocery = choice(agents['groceries'])['position']
office = choice(agents['offices'])['position']

person = {
  'position': home['position'],
  'home': home['position'],
  'grocery': grocery,
  'office': office,
  # ...
}
```
{% endtab %}
{% endtabs %}

We're going to need to add the hospital as a potential destination as well:

{% tabs %}
{% tab title="JavaScript" %}
```javascript
// Line 20
const grocery = random_choice(agents["groceries"]).position;
const office = random_choice(agents["offices"]).position;
const hospital = random_choice(agents["hospitals"]).position;

const template = state.people_template;

  agents["people"].push({
    ...template,
    position: home.position,
    home: home.position,
    grocery,
    office,
    hospital,
    // ...
  }
```
{% endtab %}

{% tab title="Python" %}
```python
# Line 14
grocery = choice(agents['groceries'])['position']
office = choice(agents['offices'])['position']
hospital = choice(agents['hospitals'])['position']

person = {
  'position': home['position'],
  'home': home['position'],
  'grocery': grocery,
  'office': office,
  'hospital': hospital,
  # ...
}
```
{% endtab %}
{% endtabs %}

If we set `state.destination = "hospital"` the Person will head to the hospital \(we'll need that in the future\).

For now though in `check_infected`, you can set the destination as home.

{% tabs %}
{% tab title="JavaScript" %}
```javascript
let msgs = context.messages().filter(msg => msg.type === "test_result");
 msgs.forEach(msg => {
   if (msg.data.sick) {
      state.destination = "home"; 
   }
 })
```
{% endtab %}

{% tab title="Python" %}
```python
msgs = list(filter(lambda m: m['type'] == 'test_result', context.messages()))
for msg in msgs:
  if msg['data']['sick']:
    state['destination'] = state['home']
```
{% endtab %}
{% endtabs %}

Now our full `check_infected` behavior looks like this:

{% tabs %}
{% tab title="JavaScript" %}
```javascript
function behavior(state, context) {
  const { time_to_symptoms } = context.globals();
 
  function check_hospital(){
     state.addMessage("Hospital", "test",{
         test_sick: true,
     });
   }
 
  let msgs = context.messages().filter(msg => msg.type === "test_result");
   msgs.forEach(msg => {
     if (msg.data.sick) {
        state.destination = "home"; 
     }
   })
   
  if (state.infected && state.infection_length === time_to_symptoms) {
     check_hospital();
   }
}
```
{% endtab %}

{% tab title="Python" %}
```python
def behavior(state, context):
  time_to_symptoms = context.globals()['time_to_symptoms']

  def check_hospital():
    state.add_message("Hospital", "test", {
      'test_sick': True
    })
  
  msgs = list(filter(lambda m: m['type'] == 'test_result', context.messages()))
  for msg in msgs:
    if msg['data']['sick']:
      state['destination'] = state['home']
   
  if state['infected'] and state['infection_length'] >= time_to_symptoms:
    check_hospital()
```
{% endtab %}
{% endtabs %}

Run the simulation - our people are now being socially conscious and going back home when they’re sick. Hooray for well-being! 

{% hint style="success" %}
**Extension:** try accounting for false negatives. Just like in real life tests are sometimes less than 100% accurate. Introduce the possibility that the hospital sends back a false negative and change the response behavior.
{% endhint %}

