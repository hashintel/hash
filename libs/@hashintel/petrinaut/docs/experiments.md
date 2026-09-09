# Experiments

An **experiment** is a Monte Carlo batch: many independent simulation runs of the current net, all running the same scenario (or no scenario), with results aggregated as distributions of token counts over simulation time. Use experiments when one run isn't enough -- when the model is stochastic and you want to see the spread, not just one trajectory.

Experiments live under the **Simulate** [global mode](drawing-a-net.md#global-modes). Open the Simulate sidebar and choose **Experiments**.

## Creating an experiment

1. Switch to **Simulate** mode and open the **Experiments** tab.
2. Click **Create**. The Create Experiment drawer opens.
3. Fill in the configuration (see below).
4. Click **Run**.

### Configuration

| Setting                 | Default                           | Notes                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**                | `Experiment`                      | Free text.                                                                                                                                                                                                                     |
| **Scenario**            | `(Default)`                       | Either `(Default)` (no scenario; uses each place's manually-set initial marking and net-level parameter defaults) or one of your saved [scenarios](scenarios.md). An experiment runs against exactly one scenario.             |
| **Scenario parameters** | each scenario parameter's default | When a scenario is selected, you can override its scenario parameters per experiment. Expressions are evaluated once at start. Each numeric parameter also has a **Sweep** toggle — see [Parameter sweeps](#parameter-sweeps). |

With "No scenario" selected, the Scenario section shows the [ad-hoc scenario form](ad-hoc-scenarios.md): define the initial state and parameter values inline for this experiment, without saving a scenario. Left untouched, the experiment runs from the manually-set markings and defaults as before. The experiments table shows "Ad-hoc scenario" in its Scenario column for such runs. With [Parameter sweeps](#parameter-sweeps) enabled, every numeric value of the form carries a **Sweep** toggle -- see [Sweep selections](ad-hoc-scenarios.md#sweep-selections-experiments-only).

With a scenario selected (and ad-hoc scenarios enabled), the Scenario section shows it through the same form: the scenario parameters take value edits in worksheet style -- a ratio parameter's edit applies only between 0 and 1; outside, the form marks it and the run keeps the previous value -- each numeric one with the same **Sweep** toggle the classic rows offer, and a collapsed **Computed state** sub-section underneath previews the exact parameter values and initial tokens each run will start with -- computed only when you open it, and recomputed as you change the values above. A swept parameter previews at the start of its range, the first combination the sweep runs, and the preview says so. The preview sits in its own tinted panel and scrolls as one, so a net with many places leaves the rest of the drawer in reach.
| **Runs** | `1000` | Positive integer; how many independent simulations to run. For a sweep the field reads **Max runs per selection**: each selection refines progressively (8, 25, 100, … 1000, 5000, …) up to this ceiling, so large budgets — 100,000 on the GPU — sharpen the distribution the longer you stay. |
| **Time step (dt)** | `0.1` | Same meaning as in single-run simulations (see [Simulation](simulation.md#time-step-dt)). |
| **Max time (seconds)** | `180` | Each run advances until simulation time reaches this value, then completes. |
| **Run on GPU** | off | Only shown when **WebGPU** is on under **Settings → Simulation**. Greyed out with the reason on hover when this model cannot run on the GPU. See [Compute backend](#compute-backend-experimental). |

The model used is a snapshot of the current net at the time you press **Run**. Editing the net afterwards does not change runs that have already started.

> Currently, an experiment can only run against one scenario at a time. To compare scenarios, create one experiment per scenario.

## Lifecycle and statuses

Experiments progress through these status labels:

| Status           | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Initializing** | The experiment has been created and its workers are starting up.                                  |
| **Running**      | Runs are in progress.                                                                             |
| **Idle**         | A sweep whose selected region is fully sampled. Moving a parameter control resumes running.       |
| **Complete**     | All runs finished without error.                                                                  |
| **Error**        | The experiment failed to start or hit an unrecoverable error. The drawer shows the error message. |
| **Cancelled**    | You clicked **Cancel**, or the experiment was cancelled.                                          |

Experiments run in background Web Workers, so simulation playback and editor interactions stay responsive. Multiple experiments can run concurrently.

### Parallel runs

Because every run is independent, an experiment splits its runs across several workers and runs them at the same time -- by default one worker per processor core, leaving one core free so the editor stays responsive. A 1000-run experiment on an 8-core machine runs roughly 4x faster than it would on a single worker.

Each run's seed is derived from its position in the experiment rather than from which worker happens to execute it, and the per-frame statistics from each worker are combined into the same distributions you would get from running everything sequentially. Re-running an experiment with the same configuration and seed gives the same numbers regardless of how many cores the machine has, so long as runs keep going for the full experiment; when every run a worker owns stops early (for example, the net deadlocks), those runs stop counting toward later time points, which can shift late-experiment statistics slightly between machines with different core counts.

Two consequences worth knowing:

- Progress reports the slowest worker's position, so the progress bar never runs ahead of the results behind it.
- Several experiments running at once each use the same number of workers, so they compete for cores and all of them slow down. Run them one at a time if you want any single one to finish as fast as possible.

### Parameter sweeps

Parameter sweeps are experimental and off by default. Turn on **Parameter sweeps** under Simulation in the [settings dialog](visual-settings.md#parameter-sweeps-experimental) to get the Sweep toggle.

Flip **Sweep** on any numeric scenario parameter to explore an interval of values instead of one. Set the minimum and the maximum — that is all a sweep declares. Petrinaut quantizes the interval finely (about fifty steps; integer parameters step by whole numbers) so a selection has a stable identity and revisiting one restores its results. With [ad-hoc scenarios](ad-hoc-scenarios.md) enabled, the same toggle sits on every numeric value of the ad-hoc form -- a token count, a cell, a variable, a parameter override -- and each selection sweeps as a generated parameter named after the value, shown in the navigator under the value's path.

A sweep computes **what you have selected**. The results drawer grows a **Parameters** card across the top of its body, with one slider per swept parameter and the swept count under its title. Each slider selects a range on its interval, and starts spanning the whole of it:

- **Range** (the default): Petrinaut runs **one stochastic simulation over the ranges** — every run draws its own value for each ranged parameter, spread across the selected interval — and the metric charts stream the live distribution **over the region**, sharpening exactly like a plain experiment's. Resize a range from either end to focus; compute restarts on the new selection. Range selections run on the GPU when the net qualifies — each run's parameter draw is uploaded alongside its state — and otherwise on the CPU at full parallelism; an initial state that a scenario derives from a ranged parameter holds at the range's midpoint, while the simulation itself reads each run's own value.
- **Point**: switch a parameter's control to Point and its slider collapses to a single value. A point refines in escalating batches (8, 25, 100, … up to your run budget), exactly like a plain experiment at that value — including on the GPU.

Move a slider and compute immediately restarts on the new selection, like a raytracer dropping its rays when the camera moves. While the new selection's first results compute, the charts keep the previous selection's picture dimmed rather than going blank, then fade it out quickly as fresh data draws in underneath. Every selection you have computed keeps its results: returning to the same point or the same range restores its runs and distributions instantly, and refinement resumes where it left off. Resizing a range is a new selection and computes afresh.

Every selection uses the same seed sequence (common random numbers), and a run's parameter draw depends only on the experiment's seed and the run's position in the sequence, so differences you see between selections come from the parameters, not from sampling luck — while experiments with different seeds explore their own value sequences.

#### The surface view

A sweep with two or more swept parameters grows a **Surface** card under the **Parameters** card: a contour plot of one metric's final value over two parameters you pick, with every other parameter held at the middle of its selected range. The **X** and **Y** pickers sit in the row under the plot and the **Metric** picker in the row beneath them, and the line under the card's title reads the sampling progress (or, mid-drag, the values under the pointer). The plot fills in live and coarse-first — the four corners, then ever finer subdivisions, each level a complete picture (8 runs per point) — and **the surface is itself a control**: click, or press and drag with a live crosshair and value readout, and on release both shown parameters collapse to a point there, which then refines with more runs. An orange ring marks where the navigator currently sits. Your selected point always computes first: the metric charts start streaming before surface sampling begins, and after every slider move the surface waits for the new selection's first frames before continuing. Every metric is measured on the same samples, so switching the shown metric repaints instantly from what was already computed; changing the fixed parameters or the axes restarts the fill for the new slice.

The drawer arranges its parts by its width. The **Parameters** card spans the body under the header. Beneath it, at the drawer's full width and in the full-size presentation, the **Surface** sits on the left and the metric cards on the right, two to a row, so two swept parameters and up to four metrics fit without scrolling; in a narrower drawer the metric cards come first, then **Surface**, so the charts you watch are at the top either way. A sweep with one swept parameter has no surface, and its cards take the whole width. Every card keeps a fixed height, and only the body scrolls, under the header.

### Compute backend (experimental)

Experiments run on the CPU unless you ask for the GPU. Switch on **WebGPU** under **Settings → Simulation**, and the Create Experiment drawer gains a **Run on GPU** switch. Running on your graphics hardware is dramatically faster — a 4000-run experiment that takes six seconds on the CPU finishes in a few milliseconds.

The choice is per experiment, not global, so a GPU experiment and a CPU experiment can run side by side — useful for comparing the two on the same model. Each gets its own GPU device, so nothing is shared between them.

The switch is greyed out when the current model cannot run on the GPU; hover it for the reason. The setting is only offered where your browser exposes WebGPU. Chrome, Edge and Safari 26+ do; Firefox needs it enabled.

The GPU backend handles a **subset** of nets, and it tells you when it cannot take one rather than guessing. It needs:

- **token spans that fit the metric histogram.** Metrics are reduced on the device into a histogram whose bins cover a window of counts. The window calibrates itself: a short probe observes each measured place's range, the full run uses that range, and a run that escapes its window is recalibrated and re-run automatically — no refusals or warnings based on absolute counts. Calibration is remembered while an experiment is open, so moving the sweep's sliders does not re-probe what an earlier selection already measured. Only the _span_ is limited: up to three metrics get 1,024 distinct values each (more metrics share the budget), and a wider span is binned at reduced resolution;
- typed places to have _measurable_ token counts. A declared [token capacity](drawing-a-net.md#token-capacity) is used directly; without one, a short probe measures each place's real maximum and sizes the buffers from it (growing and re-running automatically if a run later outgrows the estimate). A place whose probe shows rare extreme outliers runs on the CPU instead — sizing every run for the outlier would waste the GPU's memory;
- no `string` or `uuid` token attributes, which need more than the 32 bits WebGPU offers;
- **arcs consuming at most two typed tokens per place.** A condition that reads token attributes runs on the GPU at weight 1 and at weight 2 — a pairwise condition like a collision test is scanned over every pair — but not beyond;
- typed tokens consumed from at most one place per transition, since two would be a cross-product enumeration across arcs (the one gate a bundled example — Production Machines — still hits);
- metrics that measure place token counts, without a time aggregation.

When an experiment does not qualify, it runs on the CPU instead and a message explains which requirement was not met. Nothing fails, and you do not need to check in advance. To see the full picture for the net you are editing — including which individual conditions and equations compiled — turn on [Compilation Output](compilation-output.md).

Run count has no ceiling of its own: runs beyond what your GPU can hold at once execute as sequential tiles. What still falls back to the CPU is a single run whose own state exceeds the device's buffer limits, or a metric histogram too large for the device; the message says which.

Two things to know before comparing results:

- **The same seed gives different numbers on the two backends.** They deliberately use different random number generators, so the trajectories differ while the distributions agree. On the built-in SIR example the two backends' mean token counts agree to within half a percent. The badge in each experiment's header records which backend ran it, so results stay attributable after the fact.
- Continuous dynamics are integrated with a **more accurate method** (Runge-Kutta 4) than the CPU's, so a model with differential equations may show slightly different — better — values, not just different noise.
- The GPU steps every run to the configured max time, while the CPU stops a run as soon as it can no longer fire anything. So a net that finishes early reports a **higher frame count and simulated time** on the GPU for the same results. Nothing is wrong with either; they just stop counting at different points.

### Reading the header

Open an experiment's drawer and its header names the experiment in one line: the name, the scenario (or **Default scenario**), the run count and the time step, for example **SIR transmission sweep · Seasonal Flu · 100 runs · dt 1**. Beneath it, a strip of labelled columns divided by hairlines:

| Column        | Meaning                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | One of the five statuses above, as a pill with a coloured dot.                                                                                                          |
| **Runs**      | How many runs are in flight, and how many have finished.                                                                                                                |
| **Errors**    | How many individual runs errored. An experiment can complete with some runs errored.                                                                                    |
| **Time**      | Simulated time reached, against the configured maximum. This is model time, not clock time.                                                                             |
| **Elapsed**   | Clock time the experiment has been simulating; it stops with the experiment and holds the total it took.                                                                |
| **Selection** | For a sweep: the selected combination's runs sampled over the run budget.                                                                                               |
| **Activity**  | The **N computing** chip: how many batches run right now, **0 computing** when nothing does. Click it while something runs to list them.                                |
| **Compute**   | Whether the run uses the **CPU** or the **GPU**. Hover it for detail; on a CPU-backed experiment that asked for the GPU, it names the requirement the net did not meet. |

A progress bar runs along the header's bottom edge: the selected combination's runs for a sweep, simulated time otherwise. If the experiment failed, the error reads in the line under the header.

Once the drawer's body has scrolled, the header condenses to one line, with the columns folded in as compact chips beside the title, the compute badge and the computing chip still among them; move the pointer over it and it grows back. Nothing in the header moves when a status changes, a count goes to zero or a number grows a digit: every column is as wide as its widest value, and every card in the body keeps its height.

**Elapsed** and **Duration** measure simulating only. Compiling the net's user code and starting the workers (or acquiring the GPU device and compiling the shader) happens before the clock starts, so the number is comparable between the two backends. An experiment that fails before it starts simulating shows `—` rather than a duration.

### Metric charts

Each metric gets its own card in a grid of equal-sized cards, charting its values over simulation time. Every card stays the same size whatever it draws, so changing a chart's view never moves the charts around it. A scalar metric draws a line. A distribution metric (one value per run) defaults to a **heatmap**: each time step is a column shaded on a pale-to-dark color ramp, where the darkest cell marks the value most runs had at that moment and paler shades mark rarer values. Shading is relative to each time step on its own, so a moment where runs agree and a moment where they spread out are both readable. While results still stream, each update eases into the picture over a few refreshes instead of snapping, so a batch landing or a re-run replacing earlier samples reads as the distribution firming up rather than flashing.

The **Chart options** menu (the `…` button in the card's header) changes what is plotted, and the line under the card's title reads the current choice, for example "median over runs · value over time". The menu has two groups, with the current choice in each marked:

- **Runs** (distribution metrics only): **Heatmap** or **Percentile lines** draw every time step's whole distribution; percentile lines draw the mean, median, and the 10/25/75/90th percentiles as separate lines. **Average**, **Median**, **Minimum**, **Maximum** or a **percentile** collapses each time step's distribution to that one statistic and draws it as a line.
- **Time**: **Value**, **Minimum to date** or **Maximum to date** plots each time step's own value, or the running minimum or maximum up to that point. **Average**, **Minimum**, **Maximum** or **Sum over time** collapses the whole series: a scalar-like series becomes a single number, and an unaggregated distribution becomes one histogram whose bar heights are the chosen statistic of each value's frequency over time.

Click (or drag across) a timeline chart to inspect single time steps — a popover shows that moment's exact value, or its whole distribution as a small histogram with value and count axes, however many bins the frame carries.

### Actions

In the experiment's view drawer (open it from the list, where the first click selects a row and a click on the selected row or Enter opens it, or via any experiment in the top-bar **Active experiments** popover):

- **Cancel** -- stops the experiment. Only available while it is initializing or running.
- **Remove** -- deletes the record and disposes the experiment's workers. Available after completion, cancellation, or error.
- **Close** -- closes the drawer without affecting the experiment.

There is no built-in restart action -- to re-run with the same configuration, **Create** a new experiment with the same settings.

Opening and closing an existing experiment participates in Browser Back /
Forward history on hosts with app navigation enabled. Experiment records and
results remain session data: browser navigation can reopen a record while the
current Petrinaut session is mounted, but reloading a copied experiment URL
does not recreate the run.

A confirmation prompt blocks browser/tab close while any experiment is initializing or running.

### Notifications

The **N computing** chip in the header's **Activity** column counts the batches running right now — a sweep runs several simulations in parallel (the selection's own batches, surface chunks, cell refinements) — and clicking it opens a compact list with each batch's kind and progress; it reads **0 computing** while nothing runs. Selection batches are the priority work and sort first.

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

Experiments and [optimizations](optimization.md) are separate workflows.
Experiments aggregate many runs of one fixed configuration; optimizations vary
selected scenario parameters to improve one objective metric.
