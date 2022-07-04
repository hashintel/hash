---
title: Managing Resource Access
slug: simulation/concepts/design-considerations/managing-resource-access
objectId: 92a2661e-3fc1-4a67-a1ea-152b0ab4dbdf
---

# Managing Resource Access

Managing shared resource access is a common software design challenge. For instance [mutexes](https://en.wikipedia.org/wiki/Lock_%28computer_science%29) and similar locking mechanisms might be implemented to ensure only one process is modifying the resource at once. To avoid the need for this, **HASH manages state through the actor model, with each individual actor controlling its own state.**

This approach avoids common state management bugs that crop up in other paradigms, but to the uninitiated can complicate planning access to shared resources. For instance, if two agents, _\(A\)_ and _\(B\)_, in time step 1 want something from a third agent _\(C\)_, they might both message the request to the third agent. Since agents execute in parallel, they will both send their message on the time step 1, and two messages will arrive to _C_**.**

Agent _C_ now needs to determine which agent should receive the resources, sending a message to the winning agent and a message to the losing agent.

An example of this type of pattern is in [Sugarscape](/@hash/sugarscape), in which agents search for and collect “sugar”. When an agent moves to a patch of sugar it sends a message to the patch, requesting sugar \(line 31 in `sugar_agent.js`\).

```javascript
// sugar_agent.js

state.addMessage(bestPatch.agent_id, "request", {});
```

The patch then sends sugar to only one of the agents who made a request \(lines 15-24 in `sugar_patch.js`\). This prevents multiple agents from “grabbing” the limited resource .

```javascript
// sugar_patch.js

if (requests.length) {
  // Send all sugar to randomly selected agent
  const randInd = Math.floor(Math.random() * requests.length);
  state.addMessage(requests[randInd].from, "delivery", {
    sugar,
    position: state.position,
  });

  sugar = 0;
}
```

<Tabs>
<Tab title="JavaScript" >

```javascript
// sugar_patch.js

if (requests.length) {
  // Send all sugar to randomly selected agent
  const randInd = Math.floor(Math.random() * requests.length);
  state.addMessage(requests[randInd].from, "delivery", {
    sugar,
    position: state.position,
  });

  sugar = 0;
}
```

</Tab>
</Tabs>

<Hint style="info">
Build checks for multiple of the same type requests into message handlers, to account for multiple agents requesting the same resource on a time step.
</Hint>

Another problem that can arise is managing timescales. In the example above it will take two timesteps before agents _A_ and _B_ know which will have access to the resource from agent _C_, and since one of the agents didn't get access, that agent needs to spend more time either waiting \(and pinging the agent\) or going to alternative resources providers. This can be tedious if, for instance, you're trying to match _N_ agents to _N_ resource providers, and each agent is independently messaging providers, in the worst case every agent will message the same provider, _N-1_ will be rejected and then all message the same next provider, etc. A costly and lengthy operation.

<Hint style="info">
We discuss similar situations in [Designing for Different Timescales](/docs/simulation/concepts/designing-for-different-timescales).
</Hint>

The best solution here is often to leverage manager agents to help resolve these conflicts. A manager agent acts as a matcher, receiving requests from every requesting agent and every provider, before looping through to match requests with providers, and messaging each the `agent_id` of their counterpart.

```javascript
//manager agent receives messages
const requests = context.messages().filter((m) => m.type == "request");
const providers = context.messages().filter((m) => m.type == "provider");

//it runs a matching function of some kind
const { matched, unmatched } = match(requests, providers);

//it gives matched agents the agent_id of the requester/provider
// and notifies unmatched agents no resources are available for them.
matched.forEach((m) =>
  state.addMessage(m.agent_id, "match", { partner: m.partner_id }),
);
unmatched.forEach((u) => state.addMessage(u.agent_id, "unmatched"));
```
