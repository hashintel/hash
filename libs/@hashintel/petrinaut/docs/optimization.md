# Optimization

An **optimization** searches for scenario parameter values that maximize or
minimize one metric. The objective can be a saved model metric or a custom
metric defined only for that optimization. Use it when you know the outcome
you want and want Petrinaut to explore a bounded set of scenario inputs.

Optimizations live under the **Simulate** global mode. The **Optimizations** tab
is available only when the host application provides an optimizer: a remote
optimization service, or an in-browser optimizer once you turn on the
experimental **In-browser optimization** setting (see
[Running in the browser](#running-in-the-browser)). During a service outage
the tab stays, and a run attempted then reports an error in its result drawer.

## Before you start

An optimization requires:

- A saved [scenario](scenarios.md) with at least one scenario parameter, **or**
  an [ad-hoc scenario](ad-hoc-scenarios.md) defined inline while creating the
  optimization.
- A numeric objective, either from a saved metric or custom metric code entered
  while creating the optimization.

Only scenario parameters can be optimized. The ad-hoc form works within that
rule: each value you mark **Optimize** becomes a generated scenario parameter
behind the scenes.

## Creating an optimization

1. Switch to **Simulate** mode and choose **Optimizations**.
2. Click **Create**.
3. Select a scenario in the first section, or pick **Ad-hoc (define inline)**
   to [define initial state and parameters inline](ad-hoc-scenarios.md) with
   Optimize toggles on every value. Selecting another scenario resets the
   optimization form for that scenario.
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
     editor checks it in the same way as a saved metric; the code belongs to
     this optimization only.
7. Click **Run**.

The optimizer draws its first steps at random, about a third of the requested
steps and at least 2 and at most 10, then proposes each further step from the
results so far. The metric is evaluated on the final frame of each run, and a
step's objective is the mean over its runs. The current model is reduced to an
immutable snapshot containing the selected scenario and objective metric when
the optimization starts.

## Search domains

The controls depend on the scenario parameter type:

| Parameter type | Optimization controls                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **Real**       | Minimum, maximum, and linear or logarithmic scale.                             |
| **Ratio**      | Minimum and maximum constrained to `0`–`1`, plus linear or logarithmic scale.  |
| **Integer**    | Integer minimum, maximum, and positive step that lands exactly on the maximum. |
| **Boolean**    | The optimizer tries both `false` and `true`.                                   |

Parameters are fixed by default. Search ranges belong to this optimization run;
the saved scenario keeps its values.

## Constraints

The **Constraints** section of the create-optimization drawer records boolean
conditions with the study. They are carried in the study's manifest and
readable by every consumer (the Python tooling included). A study run in the
browser (see [Running in the browser](#running-in-the-browser)) evaluates them
and reports what it finds; the objective is never changed by them, and no run
is excluded from it. Two kinds:

- **Parameter constraints** -- one-line expressions over the study's parameters (`scenario.*` for scenario parameters, `parameters.*` for net parameters) that must produce a boolean, for example `scenario.min_load < scenario.max_load`. Before each step runs, the browser checks them at the step's values. A step whose values break one is **infeasible**: it costs one step and no simulation, it is reported as pruned with the constraint named, and it is greyed in the steps table and drawn as a hollow ring on the surface.
- **State constraints** -- small code bodies that read the simulation `state` exactly like a [metric](experiments.md#metrics) and `return` a boolean, for example `return state.places.Queue.count <= 10;`. Every run of a step reports whether the condition held at every sampled time: a run **passed** when it did and **failed** otherwise.

A step's verdict comes from its runs. The **Pass threshold**, one setting for
the whole study shown under the constraint rows once a row exists, is the share
of a step's runs that must pass (95 percent by default, an alpha of 0.05). A
step is **clear** when every state constraint held on at least that share of
its runs and **limited** when one fell short. Every rate in the results is
printed as its raw fraction beside the percentage, `52 / 60 · 87%`, so the run
count behind a percentage is always in view.

Add a condition with its **Add ... constraint** button, edit it in place, and remove it with **Remove**. Each editor checks as you type: type errors, unknown names and a result that is not a boolean are underlined, and the message appears under the row. Typing `scenario.`, `parameters.` or `state.places.` offers completions, and hovering a name shows its type. **Run** stays disabled, with the first failing row named in the footer, until every constraint compiles; the constraints are compiled once more when you press Run. Empty rows are ignored.

A study run on the optimization service carries its constraints but reports
no verdicts yet.

## Watching results

Open an optimization row to follow it while it runs. The drawer updates as
steps arrive, and closing it leaves the optimization running. Use **Cancel**
to abort an active run on the optimization service, or **Stop** to end a study
running in the browser, which can then be continued (see [Running in the
browser](#running-in-the-browser)). Completed, cancelled, stopped, and failed
records can be removed from their result drawer.

The drawer's footer offers **Open full view**, which gives the whole
Optimizations section to the study: the same summary, controls, charts and
steps, spread over the section's width so the three chart cards sit side by
side. Its top bar holds **Back to list**, which returns to the list, and
**Show in drawer**, which shows the same study in the drawer again. Both
presentations are places in the app, so the browser's Back button undoes the
switch. Once you are in the full presentation, opening another row from the
list opens it full too.

Every study opens with a summary band that holds still while the rest
scrolls beneath it. Its first line says where the study is: **Step 17 of 30 ·
best step so far: step 12 (650.5)** while it runs, or **Stopped after 17 of
30 steps** (or **Finished**, **Cancelled**, **Failed**) once it is over.
While it runs, a chip beside the line says whether the study is still finding
better steps: **Still improving** when the best moved within the last few
completed steps (a tenth of the requested steps, five at least),
**Converging** when that many steps passed without a better one, and **Too
early to say** before one such window has completed.

Beneath the line, the band shows the status, the steps finished over the
steps requested (with the runs per step when above one), and **Best step so
far**, the best value seen so far (hover it for the best step's parameters),
with a progress bar for the steps beneath. The value is named for what it
is: the best of the steps tried, not a confirmed result at that
configuration.

The **Objective by step** card draws every step's objective value as a dot
over the step number, with the best so far as a line stepping up (or down,
for a minimized objective) through them. Pruned and failed steps have no dot.
The line under the title counts the completed steps.

The steps table sits at the bottom, newest steps first, each with its
parameters, objective value and a state mark (complete, pruned or failed). It
scrolls on its own, and a long study shows its newest 200 steps while the
strip keeps the totals and the best. A study with
[constraints](#constraints) run in the browser adds a **Runs passed** column
(`52 / 60 · 87%`, the constraint with the fewest passing runs when there are
several) and greys the rows of infeasible steps,
their mark reading **Infeasible:** and the constraint's name.

Once a study is over, whether it finished, was stopped, or failed, its
charts show the results: the objective by step and the surface keep their
final data, the objective's chart describes the point you pick, and nothing
in the view claims to still be following a step.

### On the optimization service

A study run on the optimization service adds a **Best parameters** section
between the strip and the steps: the best step's value for every scenario
parameter. **Cancel** ends the run on the server, and its status reads
**Cancelled**.

If a run fails, the drawer explains what happened — for example, a lost
connection reports how many of the requested trials had completed and includes
a diagnostic identifier for support. Trials received before the failure are
kept, and a **Retry** action starts a fresh run with the same settings.

### In the browser

A study that runs in the browser (see [Running in the
browser](#running-in-the-browser)) shows more, because the machine computing
it is yours, and lays it out so the strip, the controls and the plots stay in
view on a laptop screen while the study streams:

- The summary band also shows the parallel steps when above one, and, at the
  right of its first line, a badge saying where the steps run. It reads
  **CPU**, because the GPU backend cannot
  compute an expression objective (see step 4 of
  [Creating an optimization](#creating-an-optimization)). Under the steps bar,
  a thinner bar tracks the runs of the step in flight, and an **N computing**
  chip appears while anything computes (the steps in flight and the picked
  point's refinement), expanding into one row per batch with its own progress.
- A **Parameters** band with one slider per optimized numeric parameter and a
  switch per optimized boolean parameter, two to a row when they fit. Its
  heading carries the state line and the **Follow steps** switch. While the
  study runs, **Follow steps** is on: the controls move to each step's values
  as it is evaluated, disabled while they follow, and the line reads
  **Following step N**. Turn **Follow steps** off to take over early, or wait
  for the study to finish; then move any control and the point you picked
  computes in escalating batches (8, 25, then 100 runs) while the line reads
  **N of M runs — refining**. Turn **Follow steps** back on to rejoin the step
  in flight. When a point cannot be computed (the objective metric does not
  compile, the backend declines the model, or some of its runs fail), the
  state line reads **Could not compute** followed by the reason, and the
  objective's chart stays empty; a step that fails this way is pruned. Moving
  to another point, or back to this one, tries again.
- The **Objective surface** card, below the band, whenever two
  or more numeric parameters are optimized (the **Optimization surface**
  setting applies to studies on the service only). It draws the study's
  steps: each step is a dot at its parameters, the best emphasized, pruned
  steps hollow, and the field is interpolated between them, so it fills in as
  steps report. The ringed dot is the step being evaluated, its running value
  streaming into the field as the runs complete. The line under the card's
  title counts the steps placed and the best so far, the **X** and **Y**
  pickers sit in the row under the plot, and the info icon in the card's
  header explains the marks. While the
  study runs with **Follow steps** on, the plot only displays. Once the study
  is over, or **Follow steps** is off, the ringed dot is the point the
  Parameters band holds: click or drag the plot to move it, and the point's
  value enters the field as it refines.
- The objective metric's chart, in a card of the same height beside the
  surface: its distribution over simulation time at that position. The card
  is titled **Objective at the step in flight** while the study runs and
  follows its steps, and **Objective at the selected point** otherwise; the
  line under the title names the metric and the current view. It streams
  again whenever the position changes, so the surface and the chart always
  describe the same point. Its **Chart options** menu, in the card's header,
  offers the same views as an experiment's [metric
  charts](experiments.md#metric-charts).
- The **Objective by step** card follows these two, so the surface, the point
  in flight and the study's history are read together. In the drawer, the
  three cards wrap to two rows when the drawer is not wide enough for all
  three; the full view shows them in one row.
- A study with [constraints](#constraints) adds a **Constraints** card as the
  fourth. Its headline is the steps **clear** across the study over the steps
  that simulated, `14 / 20 · 70%`, with the infeasible draws counted in the
  line under the title beside the pass threshold. Beneath it, one line gives
  the latest step's verdict (clear, limited or infeasible) with the runs that
  passed its tightest constraint, and one bar per state constraint shows the
  share of steps it passed, with a dashed mark at the threshold. The same
  headline sits in the summary band as **Steps clear**. Infeasible draws are
  hollow grey rings on the surface and grey rows in the steps table, and the
  best step so far is never one of them.
- The steps table fills whatever height is left, the best step starred and
  tinted. It shows a row or two on a laptop screen and a page of them on a
  taller one; the strip's step count and best value stay in view either way.

## The surface view

The surface is experimental and off by default. Turn on **Optimization
surface** under Simulation in the [settings
dialog](visual-settings.md#optimization-surface-experimental) to see it.

A study run on the optimization service with two or more optimized numeric
parameters grows a **Surface** section between the best parameters and the
step list, holding an **Objective surface** card: an Optuna-style contour of
the objective over two parameters you pick with the **X** and **Y** pickers
under the plot. The study's own trials appear as rings (the best trial highlighted), and
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

A study that runs in the browser shows its own Surface without this setting;
[In the browser](#in-the-browser) describes it.

## Running in the browser

When the host provides the in-browser optimizer, the whole study runs in your
tab: the optimizer runs in a background worker, and each optimization step runs
as a batch of seeded simulations on the same compute backend as your
experiments.

- Turn it on under **Viewport controls > Settings > Simulation > In-browser
  optimization** (Experimental). The setting is off by default, and the
  **Optimizations** tab appears once it is on. Turning the setting off while
  an in-browser optimization is running cancels it.
- The first optimization in a browser downloads the Python runtime and the
  optimizer packages before its first step starts; the run shows as
  **Running** with no steps completed while that happens. Later runs reuse the
  browser's cache.
- Studies run one after another: a second study shows **Running** and waits
  for the first to finish or be stopped.
- The drawer follows the study while it runs, and lets you look at any other
  point once the study is over or **Follow steps** is off; [In the
  browser](#in-the-browser) describes it.
- **Parallel steps** (1 to 4, default 1) sets how many steps the optimizer
  evaluates at once. Above 1, the optimizer accounts for the steps still
  running when it picks the next values, so the proposals differ from a
  one-at-a-time study. The Parameters band follows the most recently started
  step, and the Surface rings every step in flight with its running value.
- Once the study is finished, or you press **Stop**, the controls move to the
  best step's point (if a step completed) and that point refines up to 100
  runs; a point you had already moved to stays where it is. Every point you
  visit is kept for the record's lifetime, so returning to one is instant. A
  point that cannot beat the best stops refining after a rung (8 or 25 runs)
  once its mean sits more than 2.5 standard errors on the wrong side of the
  best value, and the Parameters band says so, e.g. **8 runs · cannot beat the
  best**. The best step's own point always refines to 100 runs.
- **Stop** ends the steps in flight and leaves them uncounted: they appear in
  neither the steps table nor the step counts. The study keeps its sampler:
  the status reads **Stopped**, and the footer offers **Continue** with a
  number of steps (the study's own step count by default). Continue runs that
  many more steps on the same study, with everything it learned so far, and
  the strip's **Steps** counts them into the total. A completed study can be
  continued the same way, as often as the 1,000-step cap allows. Removing the
  study drops its sampler.
- Closing or reloading the page ends the study, and while one runs the browser
  asks you to confirm first. The record is gone on the next load.
- With **Parallel steps** at 1 and the same settings, each step of an
  in-browser optimization runs the seeds the CLI runs, so it produces the
  service's objective value and the optimizer proposes the same parameter
  values, step for step.

## Connection drops and reloads

When the host uses an optimization service, an optimization runs on the
server. If the connection drops while you watch one, Petrinaut reconnects
automatically and resumes from the last result it received — the status shows
**(reconnecting…)** while it retries, and every trial is counted once. Only if
reconnecting keeps failing does the run report a connection error, which keeps
the received trials and offers **Retry**.

Reloading or closing the page is different: the page loses its view of a
still-running optimization. The run itself continues on the server until it
finishes or is cleaned up, and it can block you from starting a new
optimization until then — so use **Cancel** first if you intend to reload and
run something else. **Cancel** ends the optimization on the server as well as
in your view of it.
