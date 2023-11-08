---
title: Custom Behaviors
slug: simulation/concepts/designing-with-process-models/custom-behaviors
objectId: 0f610147-152c-410e-87c6-ace0321664bd
---

# Custom Behaviors

Once in a while you'll want to customize your process model with a new type of functionality. Custom behaviors can be placed anywhere in your behavior chain

<Hint style="info">
Custom behaviors can be used to modify objects travelling through the system, add visualizations, or track data and compute statistics, among many other things.
</Hint>

## Accessing a Queue

Each process block has a queue associated with it where incoming objects wait. A custom behavior will always access the queue of the process block that will follow it, to perform any modifications or other functions. This code will allow you to access that queue:

```javascript
// Get the queue of the next process block
let next_process_ind = state.behaviorIndex();
const behaviors = state.behaviors;

// Find the index of the next process block
while (next_process_ind < behaviors.length) {
  if (
    behaviors[next_process_ind].includes("@hash/process") ||
    context.globals().process_behaviors.includes(behaviors[next_process_ind])
  ) {
    break;
  } else {
    next_process_ind += 1;
  }
}

// Access the queue
const next_process = state.process_labels[next_process_ind];
let queue = state[next_process + "_queue"];
```

Then, you'll likely run a function over the objects currently present in the queue.

<Hint style="info">
All of the code snippets can be referenced or copied from the`custom_process_template.js` behavior in the Process Modeling Library.
</Hint>

## Continuing the Process

Once your custom behavior has performed the functions it need to on or with the objects, it may need to replace those objects back in the same queue, or another. You can reference that queue according to the same patterns as above:

```javascript
state[next_process + "_queue"] = queue;
```
