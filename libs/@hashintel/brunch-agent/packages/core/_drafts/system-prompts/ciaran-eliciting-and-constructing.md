# CIARAN: Things the agent should investigate

## Goals / constraints

1. What does the process seek to achieve or maximise?
2. What does it seek to avoid, minimise? (AKA safety conditions)
3. How are each of these measured?
4. What factors affect whether
    1. goals are reached
    2. things to avoid are avoided
5. How important are each of these?
6. Are there numerical thresholds we can assign to these, e.g.
    1. desired/tolerated probability of something happening / not happening
    2. quantities of something that we would rather keep above / below

## Failure modes

1. What are the ways this process can:
    1. Fail to complete
    2. Require retries (of parts or all of the process)
2. Are there particular ‘unhappy paths’ that shouldn’t be followed normally, but might do?
    1. Under what conditions?
    2. What do they involve?

## Triggers

1. What are the key triggers for this process? e.g.
    1. on a schedule (e.g. every x hours)
    2. triggered by receipt of something (an order)
    3. triggered by some resource crossing a threshold (drops below x, rises above y)
    4. triggered by an event (machine breaks down)
2. What else is required for the process to begin? e.g.
    1. instructions
    2. approval

## Actors

1. Who is involved in the process?
2. What is their responsibility?
3. What properties / attributes do they have (that is important to the model)?

## Locations

1. What locations are involved in the process?
2. What is their purpose?
3. How do they relate to other locations?
4. What properties  / attributes do they have (that is important to the model)?

## Resources

1. What resources does the process required?
2. Are they capped or essentially infinite?
3. What properties / attributes do they have (that is important to the model)?

## Steps

By ‘step’ I mean ‘a discrete/logical step in a process’, which might be represented by multiple nodes in the Petri net.

1. What is the input to each step?
2. When a step uses it, is each input:
    1. consumed/destroyed (e.g. material used to produce something)
        1. PN implementation: token is consumed by transition that starts the step and the thing it represented does not appear again
    2. reserved/blocked – not available while the step is using it, but released back into a shared pool afterwards (e.g. a car)
        1. PN implementation: token is consumed by transition that starts the step, and whatever transition marks the step ending puts a token representing the thing back from wherever it came from (possibly with identical values, possible with modified values that represent wear and tear or other indications of usage important to the modal)
    3. merely read (remains available to other steps, e.g. a dataset)
        1. PN implementation: read arc, which is syntactic sugar for the transition that starts the step putting an identical token back where it came from
3. Does a step take time, or is it instantaneous? If it takes time, is it:
    1. constant (or, the variation is not important enough to model)
    2. variable
        1. between what range?
        2. evenly distributed across that range, or something else?
            1. Note: we want to later allow users to supply event datasets that the distribution of task timings can be drawn from
4. Is the step guaranteed to succeed?
    1. What does it output in this case?
5. If a step can fail:
    1. What determines whether it fails?
    2. Can we model it, or assign a probability to its failure?
    3. What happens when it fails?
        1. Does it output something different (e.g. a broken part)
        2. Does something different happen next than the ‘success’ part? What?

# Transformation

## Building blocks

Repeatable patterns will emerge when modelling processes that might imply:

1. Fixed types for certain kinds of parts of the process that capture key information…
2. …that can then be deterministically projected to modules/building blocks for the net.

### Things that take time

Would require a named event with inputs, outputs etc, with the key information for ‘time’ being whether the duration was constant or a distribution.

This becomes a module as follows (for distribution):

1. **Transition**: `Start Thing`: transition that samples the time the event will take from the distribution (whether hardcoded in the transition kernel, or passed in as a configurable net parameter, probably latter better), and sets it on an output token as `timeRemaining`
2. **Place**: `Thing In Progress`: place that has dynamics which counts down from the `timeRemaining` field on the token
3. **Transition:** `Thing Done`: transition that will not fire until `timeRemaining` has reached `0`

### Things with probabilistic branching outcomes

e.g. a production process that might succeed or fail to produce a good that passes quality inspection, according to some probability.

1. **Transition:** `Start Thing`: transition that samples between 0 and 1 and outputs the result as some variable, which is basically the result of a dice roll
2. **Place**: `Thing In Progress`: place which has a field on the token for whatever that dice roll result was
3. **Transitions:**
    1. `Thing Completed Successfully`: fires if the sampled value was `>= probability of success`
    2. `Thing Completed Unsuccessfully`: fires if the sampled value was below success probability

An **example** which demonstrates the two above patterns in one can be found in the ‘Supply Chain With Disruption’ example Petri net.
