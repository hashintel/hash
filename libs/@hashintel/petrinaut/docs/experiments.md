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
| **Scenario parameters** | each scenario parameter's default | When a scenario is selected, you can override its scenario parameters per experiment. Expressions are evaluated once at start.                                                                                     |
| **Runs**                | `1000`                            | Positive integer; how many independent simulations to run.                                                                                                                                                         |
| **Time step (dt)**      | `0.1`                             | Same meaning as in single-run simulations (see [Simulation](simulation.md#time-step-dt)).                                                                                                                          |
| **Max time (seconds)**  | `180`                             | Each run advances until simulation time reaches this value, then completes.                                                                                                                                        |

The model used is a snapshot of the current net at the time you press **Run**. Editing the net afterwards does not change runs that have already started.

> Currently, an experiment can only run against one scenario at a time. To compare scenarios, create one experiment per scenario.

## Lifecycle and statuses

Experiments progress through five status labels:

| Status           | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Initializing** | The experiment has been created and the worker is starting up.                                    |
| **Running**      | Runs are in progress.                                                                             |
| **Complete**     | All runs finished without error.                                                                  |
| **Error**        | The experiment failed to start or hit an unrecoverable error. The drawer shows the error message. |
| **Cancelled**    | You clicked **Cancel**, or the worker was cancelled.                                              |

Each experiment runs in its own background Web Worker, so simulation playback and editor interactions stay responsive. Multiple experiments can run concurrently.

### Actions

In the experiment's view drawer (open it by clicking a row in the list, or any experiment in the top-bar **Active experiments** popover):

- **Cancel** -- stops the experiment. Only available while it is initializing or running.
- **Remove** -- deletes the record and disposes the worker. Available after completion, cancellation, or error.
- **Close** -- closes the drawer without affecting the experiment.

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
