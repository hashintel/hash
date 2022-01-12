---
title: Structuring a Process Model
slug: simulation/concepts/designing-with-process-models/structuring-a-process-model
objectId: b4c1cda6-a614-4b68-9484-a5d264bf76a5
---

# Structuring a Process Model

<Hint style="info">
A technical deep-dive into how process models are structured. This is optional context that is not required for using the [process model visual interface](/docs/simulation/concepts/designing-with-process-models/using-the-process-model-builder).
</Hint>

## Structure of the Agent

Process models in HASH are built on a single agent, and there are three elements to their definition:

- The `behaviors` array — just like any agent in HASH, you'll be filling this with a mix of published behaviors from the Process Modeling Library and custom behaviors you've written.
- A `process_labels` array — this allows you to add descriptive labels to each process, and link them to their parameters.
- Parameter fields — most process behaviors will have corresponding parameters that you need to define in the agent's fields, and can be used to accurately describe the real-world system.

Each process block behavior operates in three parts:

1.  The block retrieves all objects in its queue.
1.  The block then performs a function, such as modifying on object property or seizing a resource from the agent.
1.  The block puts modified objects back into its queue, or into the queue of the following block.

<Hint style="warning">
The only exception to this is the Sink block. Since it represents the end of a process, it does not send objects into a new queue.
</Hint>

### Behaviors Array

The `behaviors` array of an agent running a process model must start with the [`@hash/age/age.rs`](/@hash/age) behavior, and can then contain a mix of custom and published behaviors.

<Hint style="warning">
This behavior provides the agent with a field that allows the other process behaviors to run. Without it the other Process Library behaviors will throw errors.
</Hint>

**init.json**

```json
{
  "behaviors": [
    "@hash/age/age.rs"
    // more process behaviors such as source, delay, etc...
  ],
  "...": "..."
}
```

### Process Labels

The agent must also contain an array of labels for each process behavior. The labels allow you to give a descriptive name to each block. Only the behaviors listed on the following Process Behaviors page require a label; all other published or custom behaviors should have a `""` placeholder string.

**init.json**

```json
{
  "behaviors": [
    "@hash/age/age.rs",
    "@hash/process/source.js",
    "@hash/process/delay.js",
    "@hash/process/sink.js"
  ],
  "process_labels": ["", "start_process", "perform_action", "end_process"],
  "...": "..."
}
```

### Resources

Certain blocks need to access `resources` to perform their functions. Resources can represent any quantifiable thing required to complete a task, for instance: staff, workstations, and wrenches. Resources should be represented on the process agents state as a field, with a number value representing how many are currently available. For example:

```json
{
  "...": "...",
  "staff": 10,
  "workstations": 3,
  "wrenches": 5
}
```

### Parameters

The parameters for each block must be specified in the agent's fields. Each parameter is keyed according to the label in the `process_labels` array. For example:

- The first process block on the agent is a Source block
- Its corresponding label is `start_process`
- Its parameters will be a struct keyed to `"start_process"`

```json
{
  "behaviors": [
    "@hash/age/age.rs",
    "@hash/process/source.js",
    "@hash/process/delay.js",
    "@hash/process/delay.js",
    "@hash/process/sink.js"
  ],
  "process_labels": [
    "",
    "start_process",
    "perform_action",
    "verify_action",
    "end_process"
  ],
  "process_parameters": {
    "start_process": {
      // parameters for the Source block
    },
    "perform_action": {
      // parameters for the first Delay block
    },
    "verify_action": {
      // parameters for the second Delay block
    },
    "end_process": {
      // parameters for the Sink block
    }
  },
  "...": "..."
}
```

On the next page you can learn more about the parameters needed for each type of **block**, and their specific functions.
