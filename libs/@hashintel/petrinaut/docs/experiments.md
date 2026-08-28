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

With "No scenario" selected, the Scenario section shows the [ad-hoc scenario form](ad-hoc-scenarios.md): define the initial state and parameter values inline for this experiment, without saving a scenario. Left untouched, the experiment runs from the manually-set markings and defaults as before. The experiments table shows "Ad-hoc scenario" in its Scenario column for such runs.

With a scenario selected (and ad-hoc scenarios enabled), the Scenario section shows it through the same form: the scenario parameters take value edits in worksheet style, and a collapsed **Computed state** sub-section underneath previews the exact parameter values and initial tokens each run will start with -- computed only when you open it, and recomputed as you change the values above. The preview sits in its own tinted panel and scrolls as one, so a net with many places leaves the rest of the drawer in reach.
| **Runs** | `1000` | Positive integer; how many independent simulations to run. For a sweep, this is the run budget **per sampled point**. |
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

Flip **Sweep** on any numeric scenario parameter to explore an interval of values instead of one. Set the minimum and the maximum — that is all a sweep declares. Petrinaut quantizes the interval finely (about fifty steps; integer parameters step by whole numbers) so results can be cached and restored per position.

A sweep computes **what you have selected**. The results drawer grows a **Parameters** strip — pinned while you scroll — with one slider per swept parameter. Each slider selects a range on its interval, and starts spanning the whole of it:

- **Range** (the default): Petrinaut runs **one stochastic simulation over the ranges** — every run draws its own value for each ranged parameter, spread across the selected interval — and the metric charts stream the live distribution **over the region**, sharpening exactly like a plain experiment's. Resize a range from either end to focus; compute restarts on the new selection. Range selections run on the CPU at full parallelism (the GPU needs one parameter value per experiment); an initial state that a scenario derives from a ranged parameter holds at the range's midpoint, while the simulation itself reads each run's own value.
- **Point**: switch a parameter's control to Point and its slider collapses to a single value. A point refines in escalating batches (8, 25, 100, … up to your run budget), exactly like a plain experiment at that value — including on the GPU.

Move a slider and compute immediately restarts on the new selection, like a raytracer dropping its rays when the camera moves. Every position you have visited keeps its results: narrowing a range, collapsing to a point, or sliding back to an earlier value restores its runs and distributions instantly, and refinement resumes where it left off.

Every selection uses the same seed sequence (common random numbers), and a run's parameter draw depends only on its position in the sequence, so differences you see between selections come from the parameters, not from sampling luck.

#### The surface view

A sweep with two or more swept parameters grows a **Surface** section under the metrics: a contour plot of one metric's final value over two parameters you pick, with every other parameter held at the middle of its selected range. The plot fills in live — points are sampled a few runs at a time (8 runs each), coarse shape first — and **clicking the surface moves the navigator**: both shown parameters collapse to a point at the clicked position, which then refines with more runs. Changing the fixed parameters, the axes, or the metric restarts the fill for the new slice.

### Compute backend (experimental)

Experiments run on the CPU unless you ask for the GPU. Switch on **WebGPU** under **Settings → Simulation**, and the Create Experiment drawer gains a **Run on GPU** switch. Running on your graphics hardware is dramatically faster — a 4000-run experiment that takes six seconds on the CPU finishes in a few milliseconds.

The choice is per experiment, not global, so a GPU experiment and a CPU experiment can run side by side — useful for comparing the two on the same model. Each gets its own GPU device, so nothing is shared between them.

The switch is greyed out when the current model cannot run on the GPU; hover it for the reason. The setting is only offered where your browser exposes WebGPU. Chrome, Edge and Safari 26+ do; Firefox needs it enabled.

The GPU backend handles a **subset** of nets, and it tells you when it cannot take one rather than guessing. It needs:

- **fewer than 256 tokens in any place a metric measures.** Metrics are reduced on the device into a histogram with one bin per token count, so counts of 256 or more cannot be told apart. A net whose measured place already starts above that is refused; one that grows past it mid-run warns you that values above 255 are clamped;
- every place that holds typed tokens to declare a [token capacity](drawing-a-net.md#token-capacity), so buffer sizes are known up front;
- no `string` or `uuid` token attributes, which need more than the 32 bits WebGPU offers;
- **arcs consuming at most two typed tokens per place.** A condition that reads token attributes runs on the GPU at weight 1 and at weight 2 — a pairwise condition like a collision test is scanned over every pair — but not beyond;
- typed tokens consumed from at most one place per transition, since two would be a product across arcs;
- metrics that measure place token counts, without a time aggregation.

When an experiment does not qualify, it runs on the CPU instead and a message explains which requirement was not met. Nothing fails, and you do not need to check in advance. To see the full picture for the net you are editing — including which individual conditions and equations compiled — turn on [Compilation Output](compilation-output.md).

There is also a ceiling on **run count**, because every run's state lives in one GPU buffer. How many runs fit depends on your hardware and on how much state a run needs, and Petrinaut asks your GPU for its own limit rather than the minimum every GPU must support — on an Apple M-series machine that is 4 GB rather than 128 MB. If an experiment still exceeds it, the message says how many runs would fit, and that experiment runs on the CPU.

Two things to know before comparing results:

- **The same seed gives different numbers on the two backends.** They use different random number generators — WebGPU cannot reproduce the CPU one — so the trajectories differ while the distributions agree. On the built-in SIR example the two backends' mean token counts agree to within half a percent. The badge in each experiment's summary records which backend ran it, so results stay attributable after the fact.
- Continuous dynamics are integrated with a **more accurate method** (Runge-Kutta 4) than the CPU's, so a model with differential equations may show slightly different — better — values, not just different noise.
- The GPU steps every run to the configured max time, while the CPU stops a run as soon as it can no longer fire anything. So a net that finishes early reports a **higher frame count and simulated time** on the GPU for the same results. Nothing is wrong with either; they just stop counting at different points.

### Reading the summary

Open an experiment's drawer and its **Summary** section reports:

| Field        | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Status**   | One of the five statuses above.                                                                                      |
| **Scenario** | The scenario the experiment runs, or `Default`.                                                                      |
| **Runs**     | How many runs are in flight, and how many have finished.                                                             |
| **Errors**   | How many individual runs errored. An experiment can complete with some runs errored.                                 |
| **Frame**    | The frame number reached — the slowest worker's position, so it never runs ahead of the results.                     |
| **Time**     | Simulated time reached, against the configured maximum. This is model time, not clock time.                          |
| **Elapsed**  | Clock time the experiment has been simulating. Once it stops, this becomes **Duration** and holds the total it took. |

A badge beside the **Summary** heading shows whether the run used the **CPU** or the **GPU**, and stays visible when the section is collapsed. Hover it for detail — on a CPU-backed experiment that asked for the GPU, the badge explains which requirement the net did not meet.

**Elapsed** and **Duration** measure simulating only. Compiling the net's user code and starting the workers (or acquiring the GPU device and compiling the shader) happens before the clock starts, so the number is comparable between the two backends. An experiment that fails before it starts simulating shows `—` rather than a duration.

### Actions

In the experiment's view drawer (open it by clicking a row in the list, or any experiment in the top-bar **Active experiments** popover):

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
