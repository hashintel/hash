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

If a run fails, the drawer explains what happened — for example, a lost
connection reports how many of the requested trials had completed and includes
a diagnostic identifier for support. Trials received before the failure are
kept, and a **Retry** action starts a fresh run with the same settings.

## The surface view

A study with two or more optimized numeric parameters grows a **Surface**
section at the bottom of its drawer: an Optuna-style contour of the objective
over two parameters you pick. The study's own trials appear as rings (the best
trial highlighted), and the filled contour comes from points **computed
locally on your machine** — the study's model snapshot runs on a background
worker, a few runs per point, and the plot fills in coarse shape first.

One slider per optimized parameter navigates the space; parameters not shown
on the plot hold at their slider position, which starts at the best trial's
value. Move a slider or **click the plot** and the selected point recomputes
with escalating batches while the readout streams the objective's mean and
median. Points you have visited are cached, so returning to them is instant.

Log-scale domains slide in log space, and integer domains snap to their step.
Local points always reflect the model as it was when the study launched, even
if you have edited the net since.

## Connection drops and reloads

An optimization runs on the server, not in your browser tab. If the connection
drops while you watch one, Petrinaut reconnects automatically and resumes from
the last result it received — the status shows **(reconnecting…)** while it
retries, and no trials are lost or double-counted. Only if reconnecting keeps
failing does the run report a connection error, which keeps the received
trials and offers **Retry**.

Reloading or closing the page is different: the page loses its view of a
still-running optimization. The run itself continues on the server until it
finishes or is cleaned up, and it can block you from starting a new
optimization until then — so use **Cancel** first if you intend to reload and
run something else. **Cancel** is also what actually stops a run: it ends the
optimization on the server, not just your view of it.
