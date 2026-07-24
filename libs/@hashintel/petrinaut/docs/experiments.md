# Experiments

An **experiment** is a Monte Carlo batch: many independent simulation runs of the current net, all running the same scenario (or no scenario), with results aggregated as distributions of token counts over simulation time. Use experiments when one run isn't enough -- when the model is stochastic and you want to see the spread, not just one trajectory.

Experiments live under the **Simulate** [global mode](drawing-a-net.md#global-modes). Open the Simulate sidebar and choose **Experiments**.

## Creating an experiment

1. Switch to **Simulate** mode and open the **Experiments** tab.
2. Click **Create**. The Create Experiment drawer opens.
3. Fill in the configuration (see below).
4. Click **Run**.

### Configuration

| Setting                 | Default                           | Notes                                                                                                                                                                                                              |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**                | `Experiment`                      | Free text.                                                                                                                                                                                                         |
| **Scenario**            | `(Default)`                       | Either `(Default)` (no scenario; uses each place's manually-set initial marking and net-level parameter defaults) or one of your saved [scenarios](scenarios.md). An experiment runs against exactly one scenario. |
| **Scenario parameters** | each scenario parameter's default | When a scenario is selected, each scenario parameter can be set to a **Fixed** value (evaluated once at start) or a **Range** to sweep -- see [Parameter ranges](#parameter-ranges-sweeps).                        |
| **Runs**                | `1000`                            | Positive integer; how many independent simulations to run. With parameter ranges, this is the number of runs **per parameter combination**.                                                                        |
| **Time step (dt)**      | `0.1`                             | Same meaning as in single-run simulations (see [Simulation](simulation.md#time-step-dt)).                                                                                                                          |
| **Max time (seconds)**  | `180`                             | Each run advances until simulation time reaches this value, then completes.                                                                                                                                        |

The model used is a snapshot of the current net at the time you press **Run**. Editing the net afterwards does not change runs that have already started.

> Currently, an experiment can only run against one scenario at a time. To compare scenarios, create one experiment per scenario.

## Parameter ranges (sweeps)

Each (non-boolean) scenario parameter in the Create Experiment drawer has a **Fixed / Range** selector:

- **Fixed** -- one value for the whole experiment (the default; leave blank to use the parameter's own default).
- **Range** -- a sweep defined by **Min**, **Max**, and **Values**: the number of evenly spaced values to generate, including both endpoints. For example min `0`, max `9`, values `10` produces `0, 1, 2, ..., 9`. Integer parameters have each generated value rounded to the nearest whole number.

A preview of the generated values appears under the row as you type.

### Combinations

Every combination of ranged values becomes its own **parameter combination** with its own runs and metric distributions. Two ranged parameters with 5 and 4 values produce a 5 × 4 grid of 20 combinations. The drawer shows the resulting total (`20 combinations × 1000 runs = 20,000 total runs`) -- with lazy scheduling (below) this total is a _budget_, not an upfront cost. Experiments are capped at 200 combinations.

If any combination fails, the experiment stops refining and is marked **Error**.

### Lazy, view-driven runs

Sweeps are **not** computed exhaustively up front. Instead:

1. **Seed pass** -- as soon as you press Run, every combination gets **one** run, giving a cheap instant overview of the whole parameter space.
2. **View-driven refinement** -- after that, compute follows what you look at. While the experiment's results are open, the combinations matching your current parameter selection accumulate runs in progressively larger batches (1 → 10 → 50 → 100 → 500 → 1000 …), so the viewed distributions sharpen quickly at first and keep improving the longer you stay. Combinations with the fewest runs level up first (picked randomly among ties), so an unpinned parameter has its values sampled randomly and evenly.
3. **Stopping** -- each combination stops at the requested **Runs** count, no matter how long it stays in view. When every combination has reached the target, the experiment is **Complete**.

Moving to a different parameter value stops the runs computing for the previous selection (a partially-computed batch is discarded; already-accumulated runs are kept) and redirects the workers to the new one. Closing the results drawer pauses refinement entirely -- the experiment shows as **Idle** and picks up again the next time you view it.

Batches run through a small pool of background workers, and batch seeds derive from the experiment seed plus each combination's accumulated run count, so combinations at the same progress see the same random-number streams (_common random numbers_) and differences between them reflect the parameters rather than sampling noise.

### Exploring sweep results

When an experiment has ranged parameters, its view drawer gains a **Parameters** section above the metric charts, with one row per ranged parameter:

- **Toggled off** (default), the parameter is _combined_: the charts merge the runs of **all** of its values into one distribution, and refinement samples across those values.
- **Toggled on**, a slider appears with one stop per value. The charts then show only the combinations matching the pinned value -- and those combinations are the ones that accumulate runs; drag the slider to move through the parameter's values and watch the distributions sharpen where you land.

Pin any subset of parameters -- whatever is left unpinned stays combined. Because metric results are stored as per-frame histograms, combining values is just adding histograms together, so navigating the parameter space is instant. A line under the parameter rows shows how many runs the current selection has accumulated and whether more are being added.

The **Summary** section shows accumulated runs against the total budget, and the **Runs** column of the experiments list shows `runs × combinations` for sweep experiments.

## Lifecycle and statuses

Experiments progress through six status labels:

| Status           | Meaning                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Initializing** | The experiment has been created and the first worker is starting up.                                                           |
| **Running**      | Runs are in progress.                                                                                                          |
| **Idle**         | (Sweeps only.) Runs are accumulated and refinement is paused -- viewing the results and selecting parameter values resumes it. |
| **Complete**     | All runs finished without error (for sweeps: every combination reached the requested run count).                               |
| **Error**        | The experiment failed to start or hit an unrecoverable error. The drawer shows the error message.                              |
| **Cancelled**    | You clicked **Cancel**, or the worker was cancelled.                                                                           |

Each batch of runs executes in its own background Web Worker, so simulation playback and editor interactions stay responsive. Multiple experiments can run concurrently.

### Actions

In the experiment's view drawer (open it by clicking a row in the list, or any experiment in the top-bar **Active experiments** popover):

- **Cancel** -- permanently stops the experiment (a sweep stops accumulating runs for good). Available while it is initializing, running, or idle.
- **Remove** -- deletes the record and disposes the workers. Available after completion, cancellation, or error.
- **Close** -- closes the drawer without affecting the experiment (a sweep pauses refinement until viewed again).

There is no built-in restart action -- to re-run with the same configuration, **Create** a new experiment with the same settings.

A confirmation prompt blocks browser/tab close while any experiment is initializing or running.

### Notifications

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
