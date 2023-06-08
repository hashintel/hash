---
title: Verification and Validation
slug: simulation/concepts/verification-and-validation
objectId: 78ba7242-a732-466c-b9fe-7e983b120100
---

# Verification and Validation

Before putting a simulation into production it's important to confirm its trustworthiness and authenticate that it works as intended. This process of quality assurance is made up of two separate procedures:

- **Verification:** Checking a model against the desired requirements to ensure that it works as intended.
- **Validation:** Comparing a model against external data or a trusted source of truth to ensure that it mirrors reality.

## Verification

Verification is the practice of ensuring that the simulation you've built is what you expected to build.

Like in traditional software engineering, you can use unit tests and integration tests to ensure that a simulation follows the stated requirements of a project. You can provide a specific state to an agent and check that it changes in the way you expect it to.

While there are a lot of ways to add unit tests to a simulation, a straightforward approach is to create a behavior attached to an agent that will run comparisons at specific time steps. For instance, in the example below, a behavior would run a test case on the first time step and tenth time step, asserting that properties stored on the agent's state are the expected values.

<Tabs>
<Tab title="JavaScript" >

```javascript
// test_behavior.js

function testCaseOne(state) {
  if (state.test_case_one == state.actual_value) {
    console.info("Test Case One Passes");
  } else {
    throw "Test Case One Fails";
  }
}

function testCaseTwo(state) {
  if (state.test_case_two == state.actual_value) {
    console.info("Test Case Two Passes");
  } else {
    throw "Test Case Two Fails";
  }
}

const behavior = (state, context) => {
  switch (context.step()) {
    case 1:
      testCaseOne(state);
      break;
    case 10:
      testCaseTwo(state);
      break;
  }
};
```

</Tab>

<Tab title="Python" >

```python
# test_behavior.py

def test_case_one():
  if state.test_case_one == state.actual_value:
    print("Test Case One Passes")
  else:
    raise("Test Case One Fails")

def test_case_two():
  if state.test_case_two == state.actual_value:
    print("Test Case One Passes")
  else:
    raise("Test Case One Fails")

def behavior(state, context):
  if context.step() == 1:
    test_case_one(state)
  else if context.step() == 10:
    test_case_two(state)

```

</Tab>
</Tabs>

## Validation

While verification will ensure that the simulation meets the desired specification, you'll also want to ensure that the desired specifications map to the real world.

A common way to validate a simulation is by comparing the results of a simulation run against external data. You can use HASH's dataset features to add data and visualize it against a simulation run. For example, in the [Multi-Stage Cell Replication simulation](https://core.hash.ai/@hash/multi-stage-cell-replication/1.0.0), the validate.js behavior takes an external dataset and saves the values for a given time step to a value on state to then be visualized as a metric.

```javascript
// validate.js

const data = context.data()[context.globals().dataset][state.counter];
const [red_data, yellow_data, green_data] = [
  parseFloat(data[1]),
  parseFloat(data[2]),
  parseFloat(data[3]),
];

state.red_data = red_data;
state.yellow_data = yellow_data;
state.green_data = green_data;

state.cells_data = red_data + yellow_data + green_data;
```

![A simulation that would not pass a validation test](https://cdn-us1.hash.ai/site/docs/image%20%2875%29.png)

![A simulation that would (probably) pass a validation](https://cdn-us1.hash.ai/site/docs/image%20%2876%29.png)

Additionally you can use [Complex Metrics](/docs/simulation/creating-simulations/experiments/optimization-experiments/complex-metrics) to score the error difference between a simulation and an external dataset, to get a more quantitative validation measure.
