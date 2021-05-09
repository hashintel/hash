# Create Testing Behavior

To start let**'**s create a message from the Person agent that contains the basics - they’re requesting a test. In the check\_infected.js behavior file, add a [message](../agent-messages/) function:

```javascript
function check_hospital(state){
   state.messages.push({
     to: "Hospital",
     type: "test",
     data: {
       test_sick: true,
     }
   })
   return state;
 }
```

When our person agent runs the check\_hospital behavior, it will now send a message to the agent named  Hospital, with metadata of type test and a data packet that contains the boolean variable test\_sick.

But we don't want our Person agent to be spamming the Hospital with requests to be tested - we only want to send it when the Person suspects that they are sick. We can add a property called time\_to\_symptoms. That’s how long it takes for a person to start showing symptoms.

```javascript
 // properties.json
 "time_to_symptoms" : 5,
```

You'll need to add it to the top of the check\_infected behavior file, and add logic so it only sends a message after "symptoms" have developed.

```javascript
(state, context) => {

const { time_to_symptoms } = context.properties;

function check_hospital(state){
   state.messages.push({
     to: "Hospital",
     type: "test",
     data: {
       test_sick: true,
     }
   })
   return state;
 }
 

if (state.infected && state.infection_length >= time_to_symptoms) {
   state = check_hospital(state);
 }
   return state;
}
```

Now after a certain period of time the person agent will get suspicious they’re sick, and send a message to the hospital.

On the receiving end we need to add a message handler for the hospital. Create a new behavior file called test\_for\_virus.js:

```javascript
//test_for_virus.js
(state, context) => {
  return state;
}
```

And add a message handler. Every timestep an agent receives in its "mailbox" all the messages directed to its `agent_id` or `agent_name`

```javascript
//test_for_virus.js
  const test_messages = context.messages.filter(m=> m.type == "test");
```

{% hint style="info" %}
While right now it’s not necessary to filter by type == test, it’s good practice when, in the future, we send a wider variety of messages to the Hospital.
{% endhint %}

Make sure to attach it to the Hospital - you can add a behavior to an agent by pushing it in the behaviors array. Since we know we'll always want the behavior associated with the hospital, add it in your initialState.json



```javascript
 // initialState.json
   {
    "template_name": "hospitals",
    "template_count": 1,
    "template_position": "center",
    "behaviors": ["test_for_virus"],
    "height": 4,
    "color": "blue",
  }
```

So what should we tell our patient? If the person is sick the test should detect that they are sick; right now the only time a person messages the hospital is if they’re sick, so testing will be easy!

Let's check all of the messages and respond to each person, letting them know they are in fact sick.

```javascript
 test_messages.forEach((m) => {
    state.messages.push({
     to: m.from,
     type: "test_result",
     data: {
       sick: true,
     }
   })
}

```

Back in  check\_infection.js file, we similarly want to check for any messages about our tests.

```javascript
 let msgs = context.messages.filter((msg) => msg.type == "test_result");
 msgs.forEach(msg => {
   if (msg.data.sick) {
     //do something
     break;
 })
```

Now that our agent knows it’s sick, what should we do? When you’re sick, you should stay home and rest. So should our Person agents. 

The daily\_movement.js file contains our agent's  movement logic. Importantly, we can have a Person go to a new destination by setting, `state.destination = state["new_destination"]`  so long as the new\_destination is one that it has a "location for". Select the create\_people.js file. At line 16 you can see we assign each Person agent a grocery or office as their go-to grocery or office, and we store the position as a property on the Person. 

```javascript
//create_people.js
      // Randomly assign grocery store, office
      const grocery = random_choice(state.agents["groceries"]).position;
      const office = random_choice(state.agents["offices"]).position;

      state.agents["people"].push({
        behaviors: ["infection.js", "check_infected.js", "daily_movement.js"],
        position: home.position,
        home: home.position,
        grocery,
        office,
```

We're going to need to add the hospital as a potential destination as well.

```javascript
//create_people.js
      // Randomly assign grocery store, office, and hospital
      const grocery = random_choice(state.agents["groceries"]).position;
      const office = random_choice(state.agents["offices"]).position;
      const hospital = random_choice(state.agents["hospitals"]).position;

      state.agents["people"].push({
        behaviors: ["infection.js", "check_infected.js", "daily_movement.js"],
        position: home.position,
        home: home.position,
        grocery,
        office,
        hospital,
```

If we set `state.destination = state["hospital"]` the Person will head to the hospital \(we'll need that in the future\).

For now though in `check_infected`, you can set the destination as home.

```javascript
let msgs = context.messages.filter((msg) => msg.type == "test_result");
 msgs.forEach(msg => {
   if (msg.data.sick) {
      state.destination = state["home"]; 
   }
 })
```

Now our full page looks like this:

```javascript
(state, context) => {
  const { time_to_symptoms } = context.properties;
 
 
function check_hospital(state){
   state.messages.push({
     to: "Hospital",
     type: "test",
     data: {
       test_sick: true,
     }
   })
   return state;
 }
 
let msgs = context.messages.filter((msg) => msg.type == "test_result");
 msgs.forEach(msg => {
   if (msg.data.sick) {
      state.destination = state["home"]; 
   }
 })
 
if (state.infected && state.infection_length == time_to_symptoms) {
   state = check_hospital(state);
 }
```

Run the simulation - our people are now being socially conscious and going back home when they’re sick. Hooray for well-being!

\[Extension\] Account for false negatives. Just like in real life tests have a chance of being wrong, add a chance the hospital sends back a false negative response and change the response behavior  


