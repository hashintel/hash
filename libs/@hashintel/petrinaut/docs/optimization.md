# Optimization

An **optimization** searches for scenario parameter values that maximize or
minimize one metric. The objective can be a saved model metric or a custom
metric defined only for that optimization. Use it when you know the outcome
you want and want Petrinaut to explore a bounded set of scenario inputs.

Optimizations live under the **Simulate** global mode. The **Optimizations** tab
is available only when the host application provides an optimizer: a remote
optimization service, or an in-browser optimizer once you turn on the
experimental **In-browser optimization** setting (see
[Running in the browser](#running-in-the-browser)). A temporary service outage
does not hide the tab; a run attempted during the outage instead reports an
error in its result drawer.

## Before you start

An optimization requires:

- A saved [scenario](scenarios.md) with at least one scenario parameter, **or**
  an [ad-hoc scenario](ad-hoc-scenarios.md) defined inline while creating the
  optimization.
- A numeric objective, either from a saved metric or custom metric code entered
  while creating the optimization.

Only scenario parameters can be optimized. Petrinaut does not expose arbitrary
model fields or nested paths to the optimizer. The ad-hoc form works within
that rule: each value you mark **Optimize** becomes a generated scenario
parameter behind the scenes.

## Creating an optimization

1. Switch to **Simulate** mode and choose **Optimizations**.
2. Click **Create**.
3. Explicitly select a scenario in the first section, or pick **Ad-hoc
   (define inline)** to [define initial state and parameters
   inline](ad-hoc-scenarios.md) with Optimize toggles on every value.
   Petrinaut never picks a scenario automatically. Selecting another scenario
   resets the optimization form for that scenario.
4. Give the optimization a name and choose its number of optimization steps
   (between 1 and 1,000), **runs per step** (between 1 and 100, default `1`),
   time step (default `0.1`), and maximum simulation time. A step's objective
   is the mean over its runs, so more runs per step give the optimizer a
   steadier signal on a stochastic model, at the cost of more simulations per
   step. With the in-browser optimizer and **WebGPU** on in the
   [settings dialog](visual-settings.md#webgpu-experimental), a **Backend**
   switch appears next to these fields. For an optimization it stays greyed
   out, with the reason on hover: the objective is an expression metric, which
   the GPU backend cannot compute (see
   [Compute backend](experiments.md#compute-backend-experimental)), so the
   steps run on the CPU. The in-browser optimizer also offers **Parallel
   steps** (1 to 4, default `1`): how many steps it evaluates at once. The
   **Seed** field starts at a fresh random value each time the form opens; it
   seeds both the optimizer's proposals and the simulations' random draws, so
   keep a seed to reproduce a study and change it to explore a different set
   of steps.
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

The optimizer draws its first steps at random, about a third of the requested
steps and never fewer than 2 or more than 10, then proposes each further step
from the results so far. The metric is evaluated on the final frame of each
run, and a step's objective is the mean over its runs. The current model is reduced to an immutable snapshot
containing the selected scenario and objective metric when the optimization
starts. Later edits do not change an in-flight run.

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
steps arrive. A study run on the optimization service shows:

- Completed, pruned, and failed step counts.
- The current best metric value.
- The best flat scenario-parameter assignment.
- The latest received steps, including their parameters, objective values, and
  colored state indicators. The step list sits at the bottom of the drawer and
  scrolls on its own — the sections above it hold still. For long runs, the
  drawer displays the newest 200 steps while retaining aggregate progress and
  the current best result.

Closing the drawer does not stop the optimization. Use **Cancel** to abort an
active run on the optimization service, or **Stop** to end a study running in
the browser, which can then be continued (see [Running in the
browser](#running-in-the-browser)). Completed, cancelled, stopped, and failed
records can be removed from their result drawer.

If a run fails, the drawer explains what happened — for example, a lost
connection reports how many of the requested trials had completed and includes
a diagnostic identifier for support. Trials received before the failure are
kept, and a **Retry** action starts a fresh run with the same settings.

A study that runs in the browser (see [Running in the
browser](#running-in-the-browser)) shows more, because the machine computing
it is yours, and lays it out so everything is in view at once — on a laptop
screen nothing needs scrolling while the study streams:

- A summary strip across the top: the status, the steps finished over the
  steps requested (with the runs per step and the parallel steps when they
  are above one), the best value so far — hover it for the best step's
  parameters — and a badge saying where the steps run. It reads **CPU**,
  because the GPU backend cannot compute an expression objective (see step 4
  of [Creating an optimization](#creating-an-optimization)). Under the strip,
  a progress bar for the steps, a thinner one for the runs of the step in
  flight, and an **N computing** chip that expands into one row per batch
  computing right now, each with its own progress.
- A **Parameters** band with one slider per optimized numeric parameter and a
  switch per optimized boolean parameter, two to a row when they fit. Its
  heading carries the state line and the **Follow steps** switch. While the
  study runs, **Follow steps** is on: the controls move to each step's values
  as it is evaluated, disabled while they follow, and the line reads
  **Following step N**. Turn **Follow steps** off to take over early, or wait
  for the study to finish; then move any control and the point you picked
  computes in escalating batches (8, 25, then 100 runs) while the line reads
  **N of M runs — refining**. Turn **Follow steps** back on to rejoin the step
  in flight.
- The **Surface**, on the left below the band, whenever two or more numeric
  parameters are optimized, without the Optimization surface setting. It
  draws only the study's steps: each step is a dot at its parameters, the
  best emphasized, pruned steps hollow, and the field is interpolated between
  them, so it fills in as steps report — nothing is sampled behind the study.
  The ringed dot is the step being evaluated, its running value streaming into
  the field as the runs complete; the caption counts the steps placed and the
  best so far, and the info icon beside the axis pickers explains the marks.
  While the study runs with **Follow steps** on, the plot only displays. Once
  the study is over, or **Follow steps** is off, the ringed dot is the point
  the Parameters band holds: click or drag the plot to move it, and the
  point's value enters the field as it refines.
- The objective metric's chart, beside the surface: its distribution over
  simulation time at that position — the step being evaluated while
  following, otherwise the point you picked. It streams again whenever the
  position changes, so the surface and the chart always describe the same
  point.
- The steps table, filling whatever height is left: the newest steps first,
  the best one starred and tinted, scrolling on its own. It shows a row or
  two on a laptop screen and a page of them on a taller one; the strip's step
  count and best value stay in view either way.

## The surface view

The surface is experimental and off by default. Turn on **Optimization
surface** under Simulation in the [settings
dialog](visual-settings.md#optimization-surface-experimental) to see it.

A study run on the optimization service with two or more optimized numeric
parameters grows a **Surface** section between the best parameters and the
step list: an Optuna-style contour of the objective over two parameters you
pick. The study's own trials appear as rings (the best trial highlighted), and
the filled contour comes from points **computed locally on your machine** —
the study's model snapshot runs on a background worker, a few runs per point,
and the plot fills in coarse shape first.

One slider per optimized parameter navigates the space; parameters not shown
on the plot hold at their slider position, which starts at the best trial's
value. Move a slider, or **click or drag on the plot**, and the selected point
recomputes with escalating batches while the readout streams the objective's
mean and median. Points you have visited are cached, so returning to them is
instant.

Log-scale domains slide in log space, and integer domains snap to their step.
Local points always reflect the model as it was when the study launched, even
if you have edited the net since.

A study that runs in the browser shows a different Surface without this
setting whenever it has two or more optimized numeric parameters: it samples
no grid of its own — the study's steps are its samples — and its controls are
the drawer's **Parameters** band (see [Running in the
browser](#running-in-the-browser)).

## Running in the browser

When the host provides the in-browser optimizer, the whole study runs in your
tab: the optimizer runs in a background worker, and each optimization step runs
as a batch of seeded simulations on the same compute backend as your
experiments.

- Turn it on under **Viewport controls > Settings > Simulation > In-browser
  optimization** (Experimental). The setting is off by default, and while it is
  off the **Optimizations** tab stays hidden even though the host provides the
  in-browser optimizer. Turning the setting off while an in-browser
  optimization is running cancels it. A remote optimization service is never
  affected by the setting.
- The first optimization in a browser downloads the Python runtime and the
  optimizer packages before its first step starts; the run shows as
  **Running** with no steps completed while that happens. Later runs reuse the
  browser's cache.
- **Runs per step** sets how many seeded simulations each step averages. With
  WebGPU on, the form also shows the **Backend** switch, but for an
  optimization it stays greyed out and the steps run on the CPU: the objective
  is an expression metric, which the GPU backend cannot compute.
- While the study runs, the drawer follows it: the **Parameters** band moves
  to each step's values, the **Surface** gains a dot per step with the field
  filling in around it and the ringed dot streaming the step in flight, and
  the objective's chart beside the surface streams the metric over that
  step's runs as they complete. The sliders and the plot only display while **Follow
  steps** is on; turn it off to take over early. Then, or once the study is
  over, move a slider, flip a switch, or click or drag the surface to look at
  any other point — its objective computes in escalating batches on the same
  backend and enters the field — and turn **Follow steps** back on to rejoin
  the study.
- When a point cannot be computed — the objective metric does not compile,
  the backend declines the model, or some of its runs fail — the
  **Parameters** band says why under **Could not compute** and the
  objective's chart stays empty; a step that fails this way is pruned. Moving to another
  point, or back to this one, tries again.
- **Parallel steps** (1 to 4, default 1) sets how many steps the optimizer
  evaluates at once. Above 1, the optimizer accounts for the steps still
  running when it picks the next values, so the proposals differ from a
  one-at-a-time study. The Parameters band follows the most recently started
  step, and the Surface rings every step in flight with its running value.
- Under the summary strip's steps bar, a thinner bar tracks the followed step's runs
  over the runs per step, and a **"N computing"** chip appears while anything
  computes — the steps in flight and the picked point's refinement — expanding
  into one row per batch with its own progress.
- Once the study is finished, or you press **Stop**, the controls move to the
  best step's point (if a step completed) and that point refines up to 100
  runs; a point you had already moved to stays where it is. Every point you
  visit is kept for the record's lifetime, so returning to one is instant. A
  point that cannot beat the best — its mean sits more than 2.5 standard
  errors on the wrong side of the best value after its first 8 runs — stops
  refining there, and the Parameters band says so: **8 runs · cannot beat the
  best**. The best step's own point always refines to 100 runs.
- **Stop** discards the steps in flight — they count as pruned — and keeps
  the study's sampler: the status reads **Stopped**, and the footer offers
  **Continue** with a number of steps (the study's own step count by default).
  Continue runs that many more steps on the same study, with everything it
  learned so far, and the strip's **Steps** counts them into the total. A
  completed study can be continued the same way, as often as the 1,000-step
  cap allows. Removing the study drops its sampler.
- Keep the tab open. Closing or reloading the page ends the study, and the
  record is gone on the next load.
- Given the same settings, each step of an in-browser optimization runs on the
  CPU with the same seeds as the optimization service, so it produces the
  service's objective values and the optimizer proposes the same parameter
  values, step for step.

## Connection drops and reloads

When the host uses an optimization service, an optimization runs on the server,
not in your browser tab. If the connection drops while you watch one, Petrinaut
reconnects automatically and resumes from the last result it received — the
status shows **(reconnecting…)** while it retries, and no trials are lost or
double-counted. Only if reconnecting keeps failing does the run report a
connection error, which keeps the received trials and offers **Retry**.

Reloading or closing the page is different: the page loses its view of a
still-running optimization. The run itself continues on the server until it
finishes or is cleaned up, and it can block you from starting a new
optimization until then — so use **Cancel** first if you intend to reload and
run something else. **Cancel** is also what actually stops a run: it ends the
optimization on the server, not just your view of it.
