# Experiments

An **experiment** is a Monte Carlo batch: many independent simulation runs of the current net, all running the same scenario (or no scenario), with results aggregated as distributions of token counts over simulation time. Use experiments when one run isn't enough -- when the model is stochastic and you want to see the spread, not just one trajectory.

Experiments live under the **Simulate** [global mode](drawing-a-net.md#global-modes). Open the Simulate sidebar and choose **Experiments**.

## Creating an experiment

1. Switch to **Simulate** mode and open the **Experiments** tab.
2. Click **Create**. The Create Experiment drawer opens.
3. Fill in the configuration (see below).
4. Click **Run** -- **Create sweep** when a value is swept, **Optimize** when the in-browser optimizer will search it. The button reads **Starting** (or **Creating**) while the experiment starts.

### Configuration

| Setting                 | Default                                                         | Notes                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                | `Experiment`                                                    | Free text.                                                                                                                                                                                                                                                                                  |
| **Scenario**            | the first saved scenario, or **No scenario** when none is saved | **No scenario** -- the [scenario form](ad-hoc-scenarios.md) below the picker, or one of your saved [scenarios](scenarios.md). An experiment runs against exactly one scenario.                                                                                                              |
| **Scenario parameters** | each scenario parameter's default                               | When a scenario is selected, you can override its scenario parameters per experiment. Expressions are evaluated once at start. Each numeric parameter also has an interval toggle — **Sweep**, or **Optimize** with In-browser optimization on — see [Parameter sweeps](#parameter-sweeps). |

With "No scenario" selected, the Scenario section shows the [ad-hoc scenario form](ad-hoc-scenarios.md): define the initial state and parameter values inline for this experiment, without saving a scenario. Left untouched, the experiment runs from the manually-set markings and defaults. The experiments table shows "Ad-hoc scenario" in its Scenario column for such runs. With [Parameter sweeps](#parameter-sweeps) enabled, every numeric value of the form carries the same interval toggle -- see [Interval selections](ad-hoc-scenarios.md#interval-selections-experiments).

With a scenario selected, the Scenario section shows it through the same form: the scenario parameters take value edits in worksheet style -- a ratio parameter's edit applies only between 0 and 1; outside, the form marks it and the run keeps the previous value -- each numeric one with the interval toggle when Parameter sweeps is on, and a collapsed **Computed state** sub-section underneath previews the exact parameter values and initial tokens each run will start with -- computed only when you open it, and recomputed as you change the values above. A swept parameter previews at the start of its range, the first combination the sweep runs, and the preview says so. The preview sits in its own tinted panel and scrolls as one, so a net with many places leaves the rest of the drawer in reach.
| **Runs** | `1000` | Positive integer; how many independent simulations to run. For a sweep the field reads **Max runs per selection**: each selection refines progressively (8, 25, 100, … 1000, 5000, …) up to this ceiling, so large budgets — 100,000 on the GPU — sharpen the distribution the longer you stay. |
| **Time step (dt)** | `0.1` | Same meaning as in single-run simulations (see [Simulation](simulation.md#time-step-dt)). |
| **Max time (seconds)** | `180` | Each run advances until simulation time reaches this value, then completes. |
| **Run on GPU** | off | Only shown when **WebGPU** is on under **Settings → Simulation**. Greyed out with the reason on hover when this model cannot run on the GPU. See [Compute backend](#compute-backend-experimental). |

The model used is a snapshot of the current net at the time you press **Run**. Editing the net afterwards does not change runs that have already started.

> Currently, an experiment can only run against one scenario at a time. To compare scenarios, create one experiment per scenario.

### Constraints

With [Parameter sweeps](#parameter-sweeps) and [In-browser optimization](visual-settings.md#in-browser-optimization-experimental) both on, flipping the first **Optimize** toggle on a saved scenario's parameter adds a **Constraints** section to the drawer, between [Objective](#optimizing-a-sweep) and Metrics. Its rows record boolean conditions the optimizer must respect when it [drives the sweep](#optimizing-a-sweep). The sweep itself ignores them: no run is excluded from the charts and the objective is never changed by them. An experiment created with **No scenario** has no Constraints section: the names of its generated parameters are not yours to write. Two kinds, added from the **Parameter constraint** and **State constraint** buttons under the list and mixed in one list, each row marked with a **Parameters** or **State** chip:

- **Parameter constraints** -- one-line expressions over the sweep's parameters (`scenario.*` for scenario parameters, `parameters.*` for net parameters) that must produce a boolean, for example `scenario.min_load < scenario.max_load`. Before a step runs, the optimizer checks them at the step's values, snapped to the sweep's grid. A step whose values break one is **infeasible**: it costs one step and no simulation, the sliders do not move to it, it is reported as pruned with the constraint named, and its row is greyed in the steps table.
- **State constraints** -- small code bodies that read the simulation `state` exactly like a metric and `return` a boolean, for example `return state.places.Queue.count <= 10;`. Every run of a step reports whether the condition held on every sampled frame: a run **passed** when it did and **failed** otherwise, and a run that errors reports neither, so its step's fraction is over the runs that reported. A state constraint runs beside the sweep's metrics on every batch, from the sweep's creation on, and it runs on the CPU: the WebGPU switch greys out while a state row is drafted, and a sweep with state constraints computes on the CPU whether or not a study drives it.

A step's verdict comes from its runs. The **Pass threshold**, one setting for the whole sweep shown in the section's header once a State row exists, is the share of a step's runs that must pass (95 percent by default, an alpha of 0.05). A step is **clear** when every state constraint held on at least that share of its runs and **limited** when one fell short. Every rate in the results is printed as its raw fraction beside the percentage, `52 / 60 · 87%`, so the run count behind a percentage is always in view.

Each row checks as you type: type errors, unknown names and a result that is not a boolean are underlined, and the message reads in the line under the row. Typing `scenario.`, `parameters.` or `state.places.` offers completions, and hovering a name shows its type. **Optimize** stays disabled, with the first failing row named in the footer, until every row compiles; the rows are compiled once more when you press it. Empty rows are ignored, and removing a row is its trash button. Changing the scenario clears the rows. The constraints are recorded with the experiment: once created, the sweep's **Parameters** card lists them behind **Show N constraints** in its footer, one line per constraint with its kind, its label (**Parameter constraint 1**, **State constraint 1**, in the order you added them) and its code, and the pass threshold under them when a state constraint exists.

## Lifecycle and statuses

Experiments progress through these status labels:

| Status           | Meaning                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Initializing** | The experiment has been created and its workers are starting up.                                                                                                                                                                         |
| **Running**      | Runs are in progress.                                                                                                                                                                                                                    |
| **Idle**         | A sweep computing nothing: fresh, or its selected region fully sampled. Moving a parameter control resumes running. Grey in the list.                                                                                                    |
| **Optimizing**   | A sweep whose sliders a study drives (see [Optimizing a sweep](#optimizing-a-sweep)). An experiment created with **Optimize** opens in this state. The drawer's header reads it; the list keeps the sweep's own status, Running or Idle. |
| **Complete**     | All runs finished without error.                                                                                                                                                                                                         |
| **Error**        | The experiment failed to start or hit an unrecoverable error. The drawer shows the error message. For a sweep the error belongs to the selection that failed: move a control and the next selection computes normally.                   |
| **Cancelled**    | You clicked **Cancel**, or the experiment was cancelled.                                                                                                                                                                                 |

Experiments run in background Web Workers, so simulation playback and editor interactions stay responsive. Multiple experiments can run concurrently.

### Parallel runs

Because every run is independent, an experiment splits its runs across several workers and runs them at the same time -- by default one worker per processor core, leaving one core free so the editor stays responsive. A 1000-run experiment on an 8-core machine runs roughly 4x faster than it would on a single worker.

Each run's seed is derived from its position in the experiment rather than from which worker happens to execute it, and the per-frame statistics from each worker are combined into the same distributions you would get from running everything sequentially. Re-running an experiment with the same configuration and seed gives the same numbers regardless of how many cores the machine has, so long as runs keep going for the full experiment; when every run a worker owns stops early (for example, the net deadlocks), those runs stop counting toward later time points, which can shift late-experiment statistics slightly between machines with different core counts.

Two consequences worth knowing:

- Progress reports the slowest worker's position, so the progress bar never runs ahead of the results behind it.
- Several experiments running at once each use the same number of workers, so they compete for cores and all of them slow down. Run them one at a time if you want any single one to finish as fast as possible.

### Parameter sweeps

Parameter sweeps are experimental and off by default. Turn on **Parameter sweeps** under Simulation in the [settings dialog](visual-settings.md#parameter-sweeps-experimental) to get the interval toggle on every numeric value of the experiment form: it reads **Sweep** on its own, and **Optimize** once [In-browser optimization](visual-settings.md#in-browser-optimization-experimental) is on with an optimizer that runs in your browser -- a host whose optimizer runs elsewhere keeps **Sweep**, since a sweep can only be optimized in the browser. Either word means the same thing on the value: an interval instead of one number.

Flip the toggle on any numeric value to explore an interval of values instead of one. Set the minimum and the maximum — that is all a sweep declares. Petrinaut quantizes the interval finely (about fifty steps; integer parameters step by whole numbers) so a selection has a stable identity and revisiting one restores its results. With **No scenario** selected, the same toggle sits on every numeric value of the [form](ad-hoc-scenarios.md) -- a token count, a cell, a variable, a parameter override -- and each selection sweeps as a generated parameter named after the value, shown in the navigator under the value's path.

A sweep computes **what you have selected**, and nothing until something selects. A sweep created with **Create sweep** sits idle with every slider spanning its whole interval, its charts empty, and the line under the sliders says what to do -- collapse a control to a point or click the surface to compute a point, widen a range to sample across it -- until you move a control or click the surface. A sweep created with **Optimize** is selected by its study from its first step (see [Optimizing a sweep](#optimizing-a-sweep)). The results drawer grows a **Parameters** card across the top of its body, with one slider per swept parameter and the swept count under its title. Each slider selects a range on its interval, and starts spanning the whole of it:

- **Range** (the default): Petrinaut runs **one stochastic simulation over the ranges** — every run draws its own value for each ranged parameter, spread across the selected interval — and the metric charts stream the live distribution **over the region**, sharpening exactly like a plain experiment's. Resize a range from either end to focus; compute restarts on the new selection. Range selections run on the GPU when the net qualifies — each run's parameter draw is uploaded alongside its state — and otherwise on the CPU at full parallelism; an initial state that a scenario derives from a ranged parameter holds at the range's midpoint, while the simulation itself reads each run's own value.
- **Point**: switch a parameter's control to Point and its slider collapses to a single value. A point refines in escalating batches (8, 25, 100, … up to your run budget), exactly like a plain experiment at that value — including on the GPU.

Move a slider and compute immediately restarts on the new selection, like a raytracer dropping its rays when the camera moves. While the new selection's first results compute, the charts keep the previous selection's picture dimmed rather than going blank, then fade it out quickly as fresh data draws in underneath. Every selection you have computed keeps its results: returning to the same point or the same range restores its runs and distributions instantly, and refinement resumes where it left off. Resizing a range is a new selection and computes afresh.

Every selection uses the same seed sequence (common random numbers), and a run's parameter draw depends only on the experiment's seed and the run's position in the sequence, so differences you see between selections come from the parameters, not from sampling luck — while experiments with different seeds explore their own value sequences.

#### Optimizing a sweep

The in-browser optimizer is experimental and off by default. Turn on **In-browser optimization** under Simulation in the [settings dialog](visual-settings.md#in-browser-optimization-experimental); the setting is offered only when the host application provides an optimizer that runs in your browser. Turning it off while a study runs cancels the study.

With it on, the interval toggles of the Create Experiment drawer read **Optimize**, and the first one you flip adds an **Objective** section to the drawer, between Scenario and [Constraints](#constraints): the metric to optimize (one of the experiment's metrics, the first by default), **Maximize** or **Minimize**, and the number of steps to take (30 by default, 1,000 at most). Each step computes eight runs at one point of the sweep before the optimizer reads the metric's value there, the mean over those runs on the last sampled frame; the line under the fields says so -- **30 steps · 8 runs each — the best point then refines to your run budget** -- or names the step budget the optimizer refuses (a run of more than 100,000 simulation steps, or steps × 8 runs × simulation steps over 5,000,000), and the footer stays disabled until it is met. A **No scenario** experiment optimizes too, over the generated parameters of its form values; only Constraints need a saved scenario.

The footer reads **Optimize**, then **Starting** while the scenario compiles and the study registers. The experiment then opens already optimizing: the **Parameters** card is purple, the header's status reads **Optimizing** and its progress bar counts the steps, the controls are locked and move by themselves to each point the optimizer tries, the line under the sliders reads **Following step N of M** with the point's runs as they stream (**— 5 of 8 runs**), and every point lands on the Surface as it computes; the **N computing** chip lists the step's batch as **Step N**. The optimizer draws its first steps at random, about a third of the requested steps and at least 2 and at most 10, then proposes each further step from the results so far. Every step's runs use the sweep's common random numbers, so the differences between steps come from the parameters, not from sampling luck. Steps run one after another, and one study at a time: a study started while another runs waits for it, reading **Optimizing** at step 1 with no runs until its turn. Parameters you did not sweep hold at the values the experiment was created with. If the optimizer cannot start -- the optimizer disconnected, or a budget the form did not catch -- nothing is created: the drawer stays open with the reason in its footer and every field as you left it.

While the study drives the sweep the card's header carries one purple **Stop** button: it ends the search where it stands, and the point it was trying refines to your run budget; when the search finishes on its own the sliders settle on the best point found and that point refines the same way. Once the search settles, the sliders unlock and the line under the sliders keeps its outcome -- **Finished 30 steps · best step so far: step 12 (650.500)**, or **Stopped after 17 of 30 steps · …** -- with the parked point's sampling after it, until the experiment's removal. The value is named for what it is: the best of the steps tried, not a confirmed result at that configuration. From there the sweep is yours to explore by hand -- sliders, **Point** and **Range**, the Surface -- with the study's picture kept; the card offers nothing more, and a new search is a new experiment. **Cancel** in the drawer's footer stops the study as well as the sweep; **Remove** discards both. A study that fails reports its message in the line under the header, where the experiment's own error would read. The study appears nowhere else: the sweep's drawer is its home, and removing the experiment removes it.

The first study in a browser downloads the Python runtime and the optimizer packages before its first step starts; the header reads **Optimizing** with no steps completed while that happens. Later studies reuse the browser's cache. Closing or reloading the page ends the study, and while one runs the browser asks you to confirm first; the study is gone on the next load, the sweep with it. The optimizer proposes with the same sampler, seed and start-up draws the [Petrinaut CLI](../../../@local/petrinaut-arch-docs/content/cli/usage-manual.mdx) uses, so a study's proposals match the CLI's step for step while the objective values it is told match.

An **Objective by step** strip sits under the sliders from the moment the drawer opens: every step's objective value as a purple dot over the step number, with the best so far as a line stepping through them, drawn as the steps land; the axis reaches to the steps asked for while the search runs and ends at the last step run once it settles. Infeasible draws carry no value and are left off the strip, and the best step so far is never one of them. Its title line names the metric and counts the steps, with the best value found; click the line to fold the chart away or bring it back. The strip stays once the search settles. A sweep created with **Create sweep** has no strip.

The drawer's shape is fixed when the experiment is created, and it holds through running, stopped and failed studies: an experiment created with **Optimize** has, from its first frame, a headline over the header's columns, **Steps** and **Steps clear** columns after **Compute** (see [Reading the header](#reading-the-header)), the **Constraints** and **Sensitivity analysis** cards after the metric charts and the steps table under them (see [Metric charts](#metric-charts)), empty until the steps fill them; a sweep created with **Create sweep** has none of them. Nothing appears later, and nothing moves.

#### The surface view

A sweep with two or more swept parameters grows a **Surface** card under the **Parameters** card: a contour plot of one metric's final value over two parameters you pick, drawn from the points the sweep has computed. It starts empty. Every point you visit — by moving the sliders to a point, by clicking the plot, or through the optimizer — lands as a dot with its value, the field is interpolated between the dots once there are three, and the point being computed is a ring; its value joins the field once its batch completes. Points computed at other values of the parameters not shown are drawn too, projected onto the two you picked. The **X** and **Y** pickers sit in the row under the plot and the **Metric** picker in the row beneath them; every metric is measured at every point, so switching the shown metric repaints from what was already computed. The line under the card's title counts the points and what computes -- **computing the selected point** or **sampling across the selected ranges**, with the runs so far -- or, mid-drag, the values under the pointer. **The surface is itself a control**: click, or press and drag with a live crosshair and value readout, and on release every swept parameter collapses to a point -- the two shown at the place you released, the others at the middle of their current range -- which then computes. A dark ring marks where the navigator sits. While the optimizer drives the sweep the card is read-only: the plot only displays under a not-allowed cursor, the **X**, **Y** and **Metric** pickers lock, a purple **Read-only** mark sits beside them, and between two steps the line says the optimizer is choosing the next point. A cancelled sweep locks the same way, with the mark in grey.

The drawer arranges its parts by its width. The **Parameters** card spans the body under the header. Beneath it, at the drawer's full width, the **Surface** sits on the left and the metric cards on the right, two to a row, so two swept parameters and up to four metrics fit without scrolling; in a narrower drawer the metric cards come first, then **Surface**, so the charts you watch are at the top either way. A sweep with one swept parameter has no surface, and its cards take the whole width. Every card keeps a fixed height, and only the body scrolls, under the header.

### Compute backend (experimental)

Experiments run on the CPU unless you ask for the GPU. Switch on **WebGPU** under **Settings → Simulation**, and the Create Experiment drawer gains a **Run on GPU** switch. Running on your graphics hardware is dramatically faster — a 4000-run experiment that takes six seconds on the CPU finishes in a few milliseconds.

The choice is per experiment, not global, so a GPU experiment and a CPU experiment can run side by side — useful for comparing the two on the same model. Each gets its own GPU device, so nothing is shared between them.

The switch is greyed out when the current model cannot run on the GPU; hover it for the reason. The setting is only offered where your browser exposes WebGPU. Chrome, Edge and Safari 26+ do; Firefox needs it enabled.

The GPU backend handles a **subset** of nets, and it tells you when it cannot take one rather than guessing. It needs:

- **metric values that fit the histogram.** Metrics are reduced on the device into a histogram whose bins cover a window of values — exact integers for counts, a calibrated range for real-valued metrics, whose bin width the heatmap shows. The window calibrates itself: a short probe observes each measured place's range, the full run uses that range, and a run that escapes its window is recalibrated and re-run automatically — no refusals or warnings based on absolute counts. Calibration is remembered while an experiment is open, so moving the sweep's sliders does not re-probe what an earlier selection already measured. Only the _span_ is limited: up to three metrics get 1,024 distinct values each (more metrics share the budget), and a wider span is binned at reduced resolution;
- typed places to have _measurable_ token counts. A declared [token capacity](drawing-a-net.md#token-capacity) is used directly; without one, a short probe measures each place's real maximum and sizes the buffers from it (growing and re-running automatically if a run later outgrows the estimate). A place whose probe shows rare extreme outliers, or whose counts keep outgrowing the buffers however far the probe grows them, stops the experiment with a message asking you to run it on the CPU instead — sizing every run for the outlier would waste the GPU's memory;
- no `string` or `uuid` token attributes, which need more than the 32 bits WebGPU offers;
- **arcs consuming at most two typed tokens per place.** A condition that reads token attributes runs on the GPU at weight 1 and at weight 2 — a pairwise condition like a collision test is scanned over every pair — but not beyond;
- typed tokens consumed from at most one place per transition, since two would be a cross-product enumeration across arcs (the one gate a bundled example — Production Machines — still hits);
- metrics the shader can compute: place token counts, and expression metrics that read counts, parameters and one place's tokens (`.length`, `.reduce`). Metrics using `.concat`, indexing a token by position, string or uuid attributes, or a time aggregation run on the CPU, and the message names the metric. Each metric samples the same runs on either backend: the runs still active in a frame by default, or, for a metric the experiment form defines, every run, with a finished run keeping its final value.

When an experiment misses a requirement the model alone decides — attributes, arcs, metrics — it runs on the CPU instead and a message explains which one, so you do not need to check in advance. The two requirements only a run can measure — a heavy-tailed place, counts that keep outgrowing their buffers — surface as that experiment's error once it has started, with a message asking you to switch it to the CPU backend. To see the full picture for the net you are editing — including which individual conditions and equations compiled — turn on [Compilation Output](compilation-output.md).

Run count has no ceiling of its own: runs beyond what your GPU can hold at once execute as sequential tiles. What still falls back to the CPU is a single run whose own state exceeds the device's buffer limits, or a metric histogram too large for the device; the message says which.

Two things to know before comparing results:

- **The same seed gives different numbers on the two backends.** They deliberately use different random number generators, so the trajectories differ while the distributions agree. On the built-in SIR example the two backends' mean token counts agree to within half a percent. The badge in each experiment's header records which backend ran it, so results stay attributable after the fact.
- Continuous dynamics are integrated with a **more accurate method** (Runge-Kutta 4) than the CPU's, so a model with differential equations may show slightly different — better — values, not just different noise.
- The GPU steps every run to the configured max time, while the CPU stops a run as soon as it can no longer fire anything. So a net that finishes early reports a **higher frame count and simulated time** on the GPU for the same results. Nothing is wrong with either; they just stop counting at different points.

### Reading the header

Open an experiment's drawer and its header names the experiment in one line: the name, the scenario (or **Default scenario**) and the run count, for example **SIR transmission sweep · Seasonal Flu · 100 runs**. Beneath it, a strip of labelled columns divided by hairlines, always on one line: in a narrow drawer the labels become tooltips and the columns read as chips, **Runs** and **Selection** shorten to their counts, and whatever still does not fit scrolls sideways under a fade at the edge.

| Column          | Meaning                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**      | One of the statuses above, as a pill with a coloured dot.                                                                                                                    |
| **Runs**        | Plain experiments: how many runs are in flight, and how many have finished. A sweep shows **Selection** in its place.                                                        |
| **Selection**   | Sweeps, in place of **Runs**: the selected combination's runs sampled over the run budget.                                                                                   |
| **Errors**      | How many individual runs errored. An experiment can complete with some runs errored.                                                                                         |
| **Time**        | Simulated time reached, against the configured maximum. This is model time, not clock time. A sweep that has computed nothing reads `0`.                                     |
| **Elapsed**     | Plain experiments only: clock time the experiment has been simulating; it stops with the experiment and holds the total it took. A sweep never finishes, so it has no clock. |
| **Activity**    | The **N computing** chip: how many batches run right now, **0 computing** when nothing does. Click it while something runs to list them.                                     |
| **Compute**     | Whether the run uses the **CPU** or the **GPU**. Hover it for detail; on a CPU-backed experiment that asked for the GPU, it names the requirement the net did not meet.      |
| **Steps**       | Sweeps created with **Optimize**: the steps finished over the steps requested, with the runs per step, **4 / 30 · 8 runs each**; the count alone in a narrow drawer.         |
| **Steps clear** | Sweeps with a study over a sweep with [constraints](#constraints): the steps clear over the steps that simulated, **3 / 4 · 75%**.                                           |

A progress bar runs along the header's bottom edge: the selected combination's runs for a sweep (the study's steps while one drives it), simulated time otherwise. If the experiment failed, the error reads in the line under the header; so does the error of a study that failed while driving a sweep.

For a sweep created with **Optimize**, the title line also carries the study's headline at its right: **Starting · no best step yet** before the first step, **Step 5 of 30 · best step so far: step 2 (650.500)** while it runs, then **Finished 30 steps · …**, **Stopped after 17 of 30 steps · …** or **Failed after …**. While it runs, a chip beside the line says whether the study is still finding better steps: **Still improving** when the best moved within the last few completed steps (a tenth of the requested steps, five at least), **Converging** when that many steps passed without a better one, and **Too early to say** before one such window has completed. The chip's place is reserved, so nothing moves when it appears or goes.

Once the drawer's body has scrolled, the header condenses to one line, with the columns folded in as compact chips beside the title, the compute badge and the computing chip still among them; move the pointer over it, or Tab onto one of its controls, and it grows back. Nothing in the header moves when a status changes, a count goes to zero or a number grows a digit: every column is as wide as its widest value, and every card in the body keeps its height.

**Elapsed** and **Duration** measure simulating only. Compiling the net's user code and starting the workers (or acquiring the GPU device and compiling the shader) happens before the clock starts, so the number is comparable between the two backends. An experiment that fails before it starts simulating shows `—` rather than a duration.

### Metric charts

Each metric gets its own card in a grid of equal-sized cards, charting its values over simulation time. Every card stays the same size whatever it draws, so changing a chart's view never moves the charts around it. The **Enlarge** button, right of the `…` button, is the one thing that resizes a card: it spreads across the whole row at twice the height, the cards after it fill the cells its row has left and the rest move below, and **Shrink** puts it back. A scalar metric draws a line. A distribution metric (one value per run) defaults to a **heatmap**: each time step is a column shaded on a pale-to-dark color ramp, where the darkest cell marks the value most runs had at that moment and paler shades mark rarer values. Shading is relative to each time step on its own, so a moment where runs agree and a moment where they spread out are both readable. While results still stream, each update eases into the picture over a few refreshes instead of snapping, so a batch landing or a re-run replacing earlier samples reads as the distribution firming up rather than flashing.

The **Chart options** menu (the `…` button in the card's header) changes what is plotted, and the line under the card's title reads the current choice, for example "median over runs · value over time". The menu has one block per dimension the data can be collapsed along, each with a switch between drawing everything and aggregating, and a list of what to draw or which statistic to take; switching a block back restores the choice it last had:

- **Runs** (distribution metrics only): **Every run** draws every time step's whole distribution, as a **Heatmap** or as **Percentile lines** (the mean, median, and the 10/25/75/90th percentiles as separate lines). **Aggregate** collapses each time step's distribution to one statistic — **Average**, **Median**, **Minimum**, **Maximum** or a **percentile** — and draws it as a line.
- **Time**: **Every step** plots each time step's own **Value**, or the running **Minimum to date** or **Maximum to date**. **Aggregate** collapses the whole series with its **Average**, **Minimum**, **Maximum** or **Sum**: a scalar-like series becomes a single number, and an unaggregated distribution becomes one histogram whose bar heights are the chosen statistic of each value's frequency over time.

Click (or drag across) a timeline chart to inspect single time steps — a popover shows that moment's exact value, or its whole distribution as a small histogram with value and count axes, however many bins the frame carries.

#### The study's cards

For a sweep created with **Optimize**, two more cards follow the metric charts in the same grid, at the same height, from the moment the drawer opens.

- The **Constraints** card, only for a sweep with [constraints](#constraints). Its headline is the steps **clear** across the study over the steps that simulated, `14 / 20 · 70%`, with the pass threshold and the infeasible draws counted in the line under the title, **pass threshold 95% (alpha 0.05) · 2 infeasible draws**. Beneath it, one line gives the latest step's verdict -- **Clear**, **Limited · 6 / 8 runs passed · 75% · State constraint 1**, or **Infeasible: Parameter constraint 1** -- and one bar per state constraint shows the share of steps it passed, with a dashed mark at the threshold. The same headline sits in the header's strip as **Steps clear**. A step stopped mid-flight, or pruned because the sliders moved on, carries no verdict and counts in neither number.
- The **Sensitivity analysis** card lists the swept parameters in the scenario's order with a bar for how much each one matters for reaching the best steps and a **Share** percentage per parameter; the rows keep their places as estimates land. The estimate is Optuna's PED-ANOVA: it takes the best tenth of the completed steps and measures how concentrated each parameter's values are there relative to its whole range, a relative importance that sums to 100% rather than a share of the objective's variance. It is computed by the optimizer running in your browser once the study is over, and again every few steps while a long study runs (every tenth step, or every twentieth of the requested steps when that is more) once it is past the floor. The line under the title names the statistic and says how many completed steps it is fitted on. Below the floor, 50 completed steps for a study of under 100 steps and 100 otherwise, the card is muted, the bars fade and the line says **below the N-step floor, treat as a hint**, N being the floor just named: a confident estimate over a handful of steps would mislead, and at the default 30 steps the card stays muted. A **Correlation** column beside the bars gives each parameter's signed correlation with the objective over the completed steps (`+0.34`, `−0.12`), computed from the steps themselves, so it is there from the third completed step whatever the floor. Before the first estimate the rows show a dash. A study that optimizes a single parameter has nothing to rank it against: its line says **PED-ANOVA ranks two or more parameters**, the card is never muted, and only the correlation column carries information.

Under both columns, at the drawer's full width, the **steps table** lists the study's steps newest first, each with its parameters, objective value and a state mark (complete, pruned or failed), the best step starred and tinted. It keeps a fixed height and scrolls on its own, and a long study shows its newest 200 steps while the header keeps the totals and the best. A sweep with constraints adds a **Runs passed** column (`52 / 60 · 87%`, the constraint with the fewest passing runs when there are several) and greys the rows of infeasible steps, their mark reading **Infeasible:** and the constraint's name.

### Actions

In the experiment's view drawer (open it from the list, where the first click selects a row and a click on the selected row or Enter opens it, or via any experiment in the top-bar **Active experiments** popover):

- **Cancel** -- stops the experiment. Offered while it is initializing or running, and while a study drives a sweep, which it stops too. Once a sweep is cancelled its sliders and its surface lock; a selection that failed locks nothing, and the next selection computes normally.
- **Remove** -- deletes the record and disposes the experiment's workers (and, for a sweep, its study). It sits at the left edge of the footer.
- **Close** -- closes the drawer without affecting the experiment.

There is no built-in restart action -- to re-run with the same configuration, **Create** a new experiment with the same settings.

Opening and closing an existing experiment participates in Browser Back /
Forward history on hosts with app navigation enabled. Experiment records and
results remain session data: browser navigation can reopen a record while the
current Petrinaut session is mounted, but reloading a copied experiment URL
does not recreate the run.

A confirmation prompt blocks browser/tab close while any experiment is initializing or running.

### Notifications

The **N computing** chip in the header's **Activity** column counts the batches running right now — a sweep pipelines the selection's batches two deep — and clicking it opens a compact list with each batch's label (**Selection**, or **Step N** while a study drives the sweep) and progress; it reads **0 computing** while nothing runs, and the list closes with its last batch.

A small toast appears when an experiment **completes** or **errors**, even if its drawer isn't open. The top-bar **Active experiments** popover (see below) lets you jump to any in-flight experiment from anywhere in the app.

## Active experiments popover

When any experiment is **initializing** or **running**, the top bar shows an **Active experiments** flask icon with a count (e.g. "2 active"). Click it for a popover listing each in-flight experiment with its scenario, progress, status, and a time progress bar. Clicking a row jumps directly to Simulate mode, the Experiments tab, and that experiment's drawer.

The popover hides itself again once nothing is in flight.

## Experiments and single-run Play

Experiments and the bottom-bar **Play** controls are independent systems:

- Pressing Play runs a single simulation in the editor and drives the canvas + Timeline panel.
- Experiments run separately, in their own workers, without animating the canvas.

You can press Play in Edit mode while experiments are running in the background, and switching to Simulate mode does not stop them.

Changing the net while an experiment is running does **not** retroactively affect that experiment -- it captured its model snapshot when you pressed Run.

A parameter sweep is also where Petrinaut searches parameters: created with
**Optimize**, it searches its intervals with the in-browser optimizer through
its own compute, from the moment it starts (see [Optimizing a
sweep](#optimizing-a-sweep)). There is no separate optimization workflow.
