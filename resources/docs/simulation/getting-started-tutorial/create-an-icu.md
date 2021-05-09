# Create an ICU

So now we can tell people they’re sick, and when they hear they’re sick they go home. But we also want to account for another function of a hospital - providing treatment for severe cases.

Let’s breakdown what we’ll need to modify in our existing model:

1. **At risk.** Right now a person is infected or not infected, but we want to delineate between the mild and severe cases. 
2. **ICU Capacity.** A hospital, so long as it has room in its intensive care unit, should treat severe cases. Instead of going home, the person will move to the hospital and stay there until they’re recovered.

On your Hospital initialization \(in initialJson.js\), add a value for icu\_beds. This will represent the number of icu beds that a hospital has.

```javascript
 "icu_beds": 10,
```

In the initialState model, expand the hospital agent and add a value for icu\_capacity.

```javascript
{
 agent_name: "Hospital",
 position: [20,20],
 height: 4,
 color: "blue",
 icu_beds: 10,
 behaviors: ["test_for_virus"]
}

```

If you reset the simulation and click on the hospital agent the inspect modal will now display the value for icu\_beds. Click the inverted pyramid to select/deselect displayed attributes.

![](https://lh4.googleusercontent.com/PqbkGFIaaymIjL1HVPBW6Ca1abWdk_VAS46jf5hFyUlCGu6wAcPy7v0oZtApKkSP_ewJjWj3yg4YDJ0bQCGQGFuSMJ7T_Cd_RLu8Px8gbFoVmhhsLClTrSe_GlDHIFFx-Ps8tVME)

Open the check\_infected file. A person agent is sending a request to the hospital to test them; now they should also send personal information to the hospital. In particular we want to know how likely it is they're at\_risk of. It’s a little bit of a handwave that they are directly sending their at\_risk level - you can imagine they’re sending a blood/spit sample and don’t know what it contains, or providing demographic info like their age or pre-existing conditions.

Include a key,value in the message data packet for at\_risk .

```javascript
// check_infected.js
function check_hospital(state){
   state.messages.push({
     to: "Hospital",
     type: "test",
     data: {
       test_sick: true,
       at_risk: state.at_risk
     }
   })
   return state;
 }
```

Open the test\_for\_virus file and, in our message parsing loop, add control-flow logic to differentiate the risky cases from the non-risky cases.

```javascript
 test_messages.forEach((m) => {
... 
    if (state.icu_beds && m.at_risk) {
      icu_or_home = false;
    }	//add logic
   }   
})

```

When a person is seriously ill, they get a bed in the hospital, so long as there’s a bed to give:

```javascript
   if (state.icu_beds && m.at_risk) {
      state.icu_beds -= 1;
      icu_or_home = true;
    } else {
      icu_or_home = false;
    }	
```

Let’s add a flag that the person has a case severe enough that they will stay in the hospital; this is how we’ll let the person know they either need to stay at the hospital or they can rest up at home. Modify the message sent to include that variable.

```javascript
   let icu_or_home = false;
   ...
   if (state.icu_beds && m.at_risk) {
     state.icu_beds -= 1;
     icu_or_home = true;
   }
   state.messages.push({
     to: m.from,
     type: "test_result",
     data: {
       sick: true,
       icu_or_home: icu_or_home,
     }
   })
```

Let’s return to our person agent. They’ve just received a message from the hospital telling them if they're sick and if they should go home or come to the hospital. We already have the mild case handled - they go home. We need to add logic for the severe case:

```javascript
  //A person checks for messages from the hospital telling them their
 //test results
 let msgs = context.messages.filter((msg) => msg.type == "test_result");
  msgs.forEach(msg => {
   if (msg.data.sick && msg.data.icu_or_home) {
      state.icu = true; 
      state.destination = state["hospital"];      
   } else if (msg.data.sick) {
     state.destination = state["home"]; 
 })
```

With this change if a person finds out they have a severe case, their destination is set as the hospital. 

We'll need to make a change to the daily\_movement file as well, to prevent the agent from moving away once they've arrived at the icu until they're better.

```javascript
    //daily_movement.js line39
    if (state.social_distancing || state.icu) {
      return state;
    }
```

When they recover, the polite thing to do is let the hospital know they’re leaving and that there’s a free ICU bed available. And actually leave the be too!

We need to add: 

* A message sender that, when a person is recovered, sends a message to the hospital that they’re better.
* A message handler that increments the hospital's icu\_capacity by 1 when it receives the “recovered” message.

Infection.js handles the logic for infection state.

```text
   if (state.infection_duration === 0) {
      // should be a property
      state.health_status = Math.random() < immunity_proportion ? "immune" : "healthy";
      state.color = "green";
      //notify the hospital the person has recovered
     //TODO
    }
```

This is another opportunity to use message passing. We'll create a message to send to the Hospital telling them that the person has recovered.

{% hint style="info" %}
A key paradigm for HASH is message passing. HASH is based on the [actor model](https://en.wikipedia.org/wiki/Actor_model), and message passing between actors is key for creating complex systems.
{% endhint %}

```javascript
 if (state.infection_duration === 0) {
      // should be a property
      state.health_status = Math.random() < immunity_proportion ? "immune" : "healthy";
      state.color = "green";
       if (state.icu) {
        state.messages.push({
          to: "Hospital",
          type: "recovered",
          data: {
            msg: "All Better!"
          }
        })
        state.icu = false;
        state.destination = state["home"];
        state.out = true;
      }
  
```

And finally lets handle the message logic on the Hospitals side.

```javascript
 const recovered_messages = context.messages.filter(m=> m.type == "recovered");
 //Frees up a bed for each (recovered,severe) case
 recovered_messages.forEach((m) => {
   state.icu_beds += 1
 })

```

Congratulations you've added a hospital and  behaviors to your simulation. Hopefully you can see how adding agents and behaviors can quickly create models that mirror the real world.

\[Coming Soon: Creating Plots\]

