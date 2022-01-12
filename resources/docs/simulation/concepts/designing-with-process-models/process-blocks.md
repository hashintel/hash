---
title: Process Blocks
slug: simulation/concepts/designing-with-process-models/process-blocks
objectId: f6e0fbfe-7d87-43fe-a26b-76358bf9bac4
---

# Process Blocks

## Source

_@hash/process/source.js_

The source behavior is the entry point to a process model. It can generate objects at various intervals and inject them into the process model.

```javascript
// parameters

<block_name>: {
    // REQUIRED - one of frequency or rate
    // The number of time steps between each new object being generated
    "frequency": number,
    // The number of objects that will be produced each time step (fractional allowed)
    "rate": number,
    // REQUIRED - one of template or code_template
    // The definition for each object sent through the process model
    "template": struct,
    // An executable string evaluated as JavaScript to create
    // the definition for each object sent through the process model
    "code_template": string,
    // OPTIONAL - generate a unique uuid and append it to each generated object
    "add_id": boolean
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array
    "next_block": string
}
```

## Sink

_@hash/process/sink.js_

The sink behavior is generally the endpoint of a process model. It disposes of objects and records data.

```javascript
// parameters

<block_name>: {
    // OPTIONAL - Count the number of objects that arrive
    // in `state.process_data.counts.<block_name>`
    "record_count": boolean,
    // OPTIONAL - Record the through-times for objects that arrive
    // in `state.process_data.through_times.<block_name>`.
    // Record the average in `state.process_data.avg_through_times.<block_name>`
    "record_through_time": boolean
    // OPTIONAL - Record the times objects waited for resources
    // in `state.process_data.wait_times.<block_name>`.
    // Record the average in `state.process_data.avg_wait_times.<block_name>`
    "record_wait_times": boolean
}
```

## Delay

_@hash/process/delay.js_

The delay behavior causes objects in the process model to wait a certain amount of time before moving on to the next behavior.

```javascript
// parameters

<block_name>: {
    // REQUIRED - one of time, uniform_time, triangular_time, or code_time
    // The time an object will wait in the delay queue
    "time": number,
    // Generate the delay time from a uniform distribution
    "uniform_time": number[2],
    // Generate the delay time from a triangular distribution
    "triangular_time": number[3],
    // Generate the delay time by executing a string as JavaScript code.
    // Must return a number
    "code_time": string,
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array
    "next_block": string
}
```

## Seize

_@hash/process/seize.js_

The seize behavior reserves and attaches resources to the object. Resource quantities are specified as numeric values on the agent containing the process model.

The name of the resource being seized should match that of a resource recovered by a Release block.

```javascript
// parameters

<block_name>: {
    // REQUIRED - the name of the agent field which tracks the number of available
    // resources. The <string> field on the agent must contain a number.
    "resource": string,
    // OPTIONAL - if true, objects will track the amount of time they wait for a
    // resource to become available.
    "track_wait": boolean,
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array
    "next_block": string
}
```

## Release

_@hash/process/release.js_

The release behavior removes resources from the object and returns them to the agent.

The name of the resource being seized **must** match that of a resource reserved by a Seize block.

```javascript
// parameters

<block_name>: {
    // REQUIRED - the name of the agent field which tracks the number of available
    // resources. The <string> field on the agent must contain a number.
    "resource": string,
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array
    "next_block": string
}
```

## Service

_@hash/process/service.js_

The service behavior seizes resources, delays the object, and then releases the resources, functioning as a composite of those three behaviors \(Seize, Delay, Release\).

```javascript
// parameters

<block_name>: {
    // REQUIRED - one of time, uniform_time, triangular_time, or code_time
    // The time an object will wait in the delay queue
    "time": number,
    // Generate the delay time from a uniform distribution
    "uniform_time": number[2],
    // Generate the delay time from a triangular distribution
    "triangular_time": number[3],
    // Generate the delay time by executing a string as JavaScript code.
    // Must return a number
    "code_time": string,
    // REQUIRED - the name of the agent field which tracks the number of available
    // resources. The <string> field on the agent must contain a number.
    "resource": string,
    // OPTIONAL - if true, objects will track the amount of time they wait for a
    // resources to become available.
    "track_wait": boolean,
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array.
    "next_block": string
}
```

## Select Output

_@hash/process/select_output.js_

This behavior allows a process to branch along two different paths, based on a conditional. There are three different ways to specify this conditional:

- based on a whether a field on the object is `true` or not
- based on a likelihood or rate
- based on executing a code string — the string may reference `obj` to access fields on the object being processed.
  - An example code_condition is `obj.difficulty > 0.5 ? true : false`

After the Select Output block, you should specify the blocks that make up the rest of the "true" path, then the blocks that make up the "false" path. If the two paths eventually rejoin, specify the rest of the blocks after the "false" path.

On the final block of the "true" path, specify the first block where the two paths rejoin using the `next_block` parameter.

```javascript
// parameters

<block_name>: {
    // REQUIRED - one of condition_field, true_chance, or code_condition

    // Checks whether the <string> field on the object is true or false to
    // determine which path it will take.
    "condition_field": string
    // If set, generates a random number between 0 & 1. If less than true_chance
    // the object is sent to the true_block, else it's sent to the false_block
    "true_chance": number,
    // Evaluate a string as javascript code to determine the path taken.
    // It must return a boolean, and can reference an `obj` variable
    "code_condition": string,
    // REQUIRED - specify the block that objects failing the condition check
    // will be sent to.
    "false_block": string,
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array.
    "true_block": string,
    // Remove the field checked in "condition_field"
    "remove_condition_field": boolean
}
```

## Exit

_@hash/processs/exit.js_

This behavior allows a process model to communicate with other agents, including other process models. Typically you can use an Exit block to communicate with an Enter block. The Exit block sends a message with the following fields:

- `to` - the agent_id of the target agent
- `type` - the name of the paired Enter block
- `data` - the definition of the object

Exit blocks can also be used to send arbitrary messages to other agents, or even create new agents by sending `"create_agent"` messages to `"hash"`.

```javascript
// parameters

<block_name>: {
    // The agent_id of the recipient of the message
    "to": string,
    // Checks the <string> field on the object to determine
    // the agent_id of the recipient
    "to_field": string,
    // Evaluate a string as javascript code to determine the recipient.
    // It must return a string, and can reference an `obj` variable
    "to_code": string,
    // OPTIONAL - specify the block that objects will be sent to next,
    // or an arbitrary message type
    "next_block": string

}
```

## Enter

_@hash/process/enter.js_

This behavior allows any agent, including other process models, to insert a new object into a process model. The Enter block will then send any new agents to the next block in the behavior array.

An agent can do so by sending a message with the following fields:

- `to` - the `agent_id` of the process model
- `type` - the name of the Enter block
- `data` - the definition of the new object

```javascript
// parameters

<block_name>: {
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array.
    "next_block": string

}
```

## Time Measure Start

_@hash/process/time_measure_start.js_

This behavior records the time an object reached it, to enable calculating the elapsed time until the agent reaches the corresponding Time Measure End behavior.

```javascript
// parameters

<block_name>: {
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array.
    "next_block": string
}
```

## Time Measure End

_@hash/process/time_measure_end.js_

This behavior determines the elapsed time it took an object to travel from the corresponding Time Measure Start behavior, and records that value.

The process label of this behavior must match that of its corresponding Time Measure Start behavior.

```javascript
// parameters

// Block name must match the time_measure_start
<block_name>: {
    // OPTIONAL - specify the block that objects will be sent to next,
    // instead of the subsequent one in the behaviors array.
    "next_block": string
}
```

## Resource Data

_@hash/process/resource_data.js_

Each **Service** or **Seize/Release** block in your process agent has an associated `resource` property specified in its parameters. If you'd like to have easy access to data about the usage of each of these resources, you can add this behavior to your agent. This behavior calculates the proportion of resources currently in use, and stores the data in the `process_data` field.

To use the behavior, you'll also need to specify a new object in `process_parameters`_._ The `max_resources` must specify the maximum, or starting number, of resources the agent begins with.

```json
{
  "...": "...",
  "process_parameters": {
    "...": "...",
    "max_resources": {
      "senior_billers": 3,
      "account_billers": 4,
      "billing_clerks": 3,
      "printers": 1
    }
  }
}
```
