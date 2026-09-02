# Process-Model Workpiece

## Purpose and posture

### What the model must answer, compare, or support

Show whether a dispatch crew remains unavailable until final sign-off and becomes available afterward.

### Who will use it and how

The operations team will inspect the resource-holding structure before using it in a scheduling comparison.

### Boundary, horizon, and accuracy expectation

One batch from entry to dispatch, with only the crew reservation and release path in scope.

### What the result must not claim

This account does not establish timing, failure rates, or behavior under simulation.

## Operational account

### Participants, locations, flowing things, and resources

- **Expert evidence:** One dispatch crew is available before final inspection.
- **Expert evidence:** Final inspection reserves the crew so no other batch can use it.

### Activities, inputs, outputs, and resource use

- Final inspection reserves the dispatch crew.
- Sign-off releases the dispatch crew in its available state.

### Case and process spine: flow, branching, joining, failure, retry, and recovery

#### Primary case: inspected batch

##### Trigger or admission

A batch is ready for final inspection.

##### Ordered account and references

Final inspection reserves the dispatch crew. Sign-off ends inspection and releases the crew. The batch is then ready for dispatch.

##### Branches, joins, waits, failures, recovery, and outcomes

Failure and recovery are **Not yet asked**.

##### Objective dependencies

The objective depends on the crew being unavailable between reservation and sign-off and available after sign-off.

### Time, quantities, arrivals, and stochastic behavior

Inspection and sign-off durations are **Unknown**.

## Construction notes

### Candidate target structures

Represent crew availability explicitly and preserve acquisition and release around the inspection interval.

### Construction inferences, approximations, and defaults

None before construction.

### Questions reopened by construction

None for the tool-schema path; a structurally faithful net would still need the inspection interval represented.

### Target-representation losses

None identified before construction.

## Delivery status

### What this workpiece currently supports

Inspection of the crew reservation/release requirement.

### Consequential gaps

Timing, failure, and recovery remain unresolved.

### Net status

Construction was not attempted. Behavior is untested.
