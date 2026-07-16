# Optimization

An **optimization** asks Optuna to search for scenario parameter values that
maximize or minimize one saved model metric. Use it when you know the outcome
you want and want Petrinaut to explore a bounded set of scenario inputs.

Optimizations live under the **Simulate** global mode. The **Optimizations** tab
is available only when the host application reports that an optimization
service is configured. A temporary service outage does not hide the tab; a run
attempted during the outage instead reports an error in its result drawer.

## Before you start

An optimization requires:

- A saved [scenario](scenarios.md) with at least one scenario parameter.
- A saved model metric that returns the numeric objective.

Only scenario parameters can be optimized. Petrinaut does not expose arbitrary
model fields or nested paths to Optuna.

## Creating an optimization

1. Switch to **Simulate** mode and choose **Optimizations**.
2. Click **Create**.
3. Explicitly select a scenario, then click **Continue**. Petrinaut never picks
   a scenario automatically.
4. Give the optimization a name and choose its trial count (between 1 and
   1,000), sampler, seed, time step, and maximum simulation time.
5. In **Scenario parameters**, leave a parameter **Fixed** or enable
   **Optimize** and enter its search range. At least one parameter must be
   optimized.
6. Choose exactly one saved metric and whether to **Maximize** or **Minimize**
   its value.
7. Click **Run**.

The metric is evaluated on the final frame of each trial's simulation. The
current model and scenario values are snapshotted when the optimization starts;
later edits do not change an in-flight run.

## Search domains

The controls depend on the scenario parameter type:

| Parameter type | Optimization controls                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **Real**       | Minimum, maximum, and linear or logarithmic scale.                             |
| **Ratio**      | Minimum and maximum constrained to `0`–`1`, plus linear or logarithmic scale.  |
| **Integer**    | Integer minimum, maximum, and positive step that lands exactly on the maximum. |
| **Boolean**    | Optuna tries both `false` and `true`.                                          |

Parameters are fixed by default. Search ranges belong to this optimization run,
not to the saved scenario.

## Watching results

Open an optimization row to follow it while it runs. The drawer updates as
trials arrive and shows:

- Completed, pruned, and failed trial counts.
- The current best metric value.
- The best flat scenario-parameter assignment.
- The latest received trials and their best-so-far values. For long runs, the
  drawer displays the newest 200 trials while retaining aggregate progress and
  the current best result.

Closing the drawer does not stop the optimization. Use **Cancel** to abort an
active run. Completed, cancelled, and failed records can be removed from their
result drawer.

For the initial integration, an optimization is tied to its browser connection.
Closing or reloading the page cancels the active request rather than creating a
persistent background job.
