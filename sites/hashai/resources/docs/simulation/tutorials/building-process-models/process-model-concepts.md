---
title: Process Model Concepts
slug: simulation/tutorials/building-process-models/process-model-concepts
objectId: 9f6ec0b6-c84e-4ab7-9e36-a0d843a32e3e
---

# Process Model Concepts

Process modeling is designing a process as a series of discrete, executable steps, and then optimizing and analyzing the design.

Process models, when built with the process library, are represented as a flowchart. Starting from an entry point, objects are sent through a process, acted upon and transformed by the process, and then at some point they reach an end node where they finish.

You can think of it like a flowchart - objects start at the source, travel through elements, and end at the sink.

![A process model diagram](https://cdn-us1.hash.ai/site/docs/hash-bpmn-example.png)

When designing your own process models, your primary task is to factor the real world process into discrete steps, and then match those steps to elements in the process library \(or build your own!\)

## Elements

With the HASH process library, we provide ready made behaviors for implementing process models. Each corresponds with a common element for process models.

- Source: Generates objects based on a template.
- Delay: Holds objects for a set number of timesteps.
- Seize: Takes a resource and 'holds' it.
- Release: Releases a resource that has been held by a seize block.
- Service: A combination of Seize, Delay, And Release.
- Select Output: Routes an object to a specific behavior depending on the state of the output or a conditional check.
- Sink: Accepts objects and removes them from the process model.

<Hint style="info">
The full list of process blocks and their parameters are listed in [Process Blocks](/docs/simulation/concepts/designing-with-process-models/process-blocks).
</Hint>

Each of these elements has a built-in-queue, and will move objects in its queue to the next process model in line. See [Designing with Process Models](/docs/simulation/concepts/designing-with-process-models/custom-behaviors) for more on the implementation. Additionally, you can add your own elements to [perform custom logic](/docs/simulation/concepts/designing-with-process-models/custom-behaviors). Create a new behavior, or fork the custom behavior, and add in your own code.

```javascript
// Forked custom_process_template.js to add a behavior
// that will increment a property on the object called count by 1.

/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */
const behavior = (state, context) => {
  // Get the queue of the next process block
  let next_process_ind = state.behaviorIndex() + 1;
  const behaviors = state.behaviors;

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

  const next_process = state.process_labels[next_process_ind];
  let queue = state[next_process + "_queue"];
  // Run custom logic with the queue
  for (obj of queue) {
    obj.count ? (obj.count += 1) : (obj.count = 1);
  }
  // Reassign to the process queue
  state[next_process + "_queue"] = queue;
};
```
