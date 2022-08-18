---
title: Getting the Behavior Index
slug: simulation/creating-simulations/behaviors/behavior-index
objectId: e884821d-d244-48e5-ba49-7fee10b98d3d
---

# Getting the Behavior Index

Sometimes behaviors may need to know which behaviors executed before it, and which behaviors will execute after it, in the agent's behavior chain. For this, the agent's `state` has a special method — `state.behaviorIndex()` in Javascript and `state.behavior_index()` in Python — which returns the index of the currently executing behavior in the agent's behavior chain.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  const index = state.behaviorIndex();
  console.log("behavior index =", index);
  console.log("behavior name =", state.behaviors[index]);
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    index = state.behavior_index()
    print("behavior index =", index)
    print("behavior name =", state.behaviors[index])
```

</Tab>
</Tabs>

You can see an example use of this method in the Wildfires simulation. When a tree burns down, or begins to regrow, it cycles through three behaviors: `tree.js`, `fire.js` and `ember.js`.

<Embed url="https://core.hash.ai/@hash/wildfires-regrowth/stable" caption="The Wildfires simulation" />

The switching is accomplished by indexing into the agent's behavior array using `state.behaviorIndex()` and assigning the next behavior.

```javascript
// fire.js

function behavior(state, context) {
  // Replace the fire behavior with the ember behavior
  state.behaviors[state.behaviorIndex()] = "ember.js";

  state.color = context.globals().fireColor;
  state.shape = "fire";
  state.height = 3;
}
```
