# Optimization

An **optimization** searches for scenario parameter values that maximize or
minimize one metric. The objective can be a saved model metric or a custom
metric defined only for that optimization. Use it when you know the outcome
you want and want Petrinaut to explore a bounded set of scenario inputs.

Optimizations live under the **Simulate** global mode. The **Optimizations** tab
is available only when the host application reports that an optimization
service is configured. A temporary service outage does not hide the tab; a run
attempted during the outage instead reports an error in its result drawer.

## Before you start

An optimization requires:

- A saved [scenario](scenarios.md) with at least one scenario parameter.
- A numeric objective, either from a saved metric or custom metric code entered
  while creating the optimization.

Only scenario parameters can be optimized. Petrinaut does not expose arbitrary
model fields or nested paths to the optimizer.

## Creating an optimization

1. Switch to **Simulate** mode and choose **Optimizations**.
2. Click **Create**.
3. Explicitly select a scenario in the first section. Petrinaut never picks a
   scenario automatically. Selecting another scenario resets the optimization
   form for that scenario.
4. Give the optimization a name and choose its number of optimization steps
   (between 1 and 1,000), time step (default `0.1`), and maximum simulation
   time.
5. In **Parameters**, leave a parameter at its current **Value** or enable
   **Optimize** and enter its search range. At least one parameter must be
   optimized.
6. Choose exactly one objective and whether to **Maximize** or **Minimize** it:
   - Choose a metric under **Model metrics** to use an existing model metric.
   - Choose **Custom code** to enter metric code for this optimization. The
     editor checks it in the same way as a saved metric, but does not add it to
     the model. Experiment-only built-in metrics are not available as
     optimization objectives.
7. Click **Run**.

The metric is evaluated on the final frame of each optimization step's
simulation. The current model is reduced to an immutable snapshot containing
the selected scenario and objective metric when the optimization starts. Later
edits do not change an in-flight run.

## Search domains

The controls depend on the scenario parameter type:

| Parameter type | Optimization controls                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **Real**       | Minimum, maximum, and linear or logarithmic scale.                             |
| **Ratio**      | Minimum and maximum constrained to `0`–`1`, plus linear or logarithmic scale.  |
| **Integer**    | Integer minimum, maximum, and positive step that lands exactly on the maximum. |
| **Boolean**    | The optimizer tries both `false` and `true`.                                   |

Parameters are fixed by default. Search ranges belong to this optimization run,
not to the saved scenario.

## Watching results

Open an optimization row to follow it while it runs. The drawer updates as
steps arrive and shows:

- Completed, pruned, and failed step counts.
- The current best metric value.
- The best flat scenario-parameter assignment.
- The latest received steps, including their parameters, objective values, and
  colored state indicators. For long runs, the drawer displays the newest 200
  steps while retaining aggregate progress and the current best result.

Closing the drawer does not stop the optimization. Use **Cancel** to abort an
active run. Completed, cancelled, and failed records can be removed from their
result drawer.

For the initial integration, an optimization is tied to its browser connection.
Closing or reloading the page cancels the active request rather than creating a
persistent background job.
