# Simulation

This page covers running a **single** simulation from Edit mode. For repeatable, named simulation configurations see [Scenarios](scenarios.md); for many-run Monte Carlo batches see [Experiments](experiments.md).

## Initial state

Before running a simulation, set the **initial marking** -- the starting tokens in each place.

Select a place and open the **State** sub-view in its properties:

- **Untyped places** -- set a token count (integer).
- **Typed places** -- define individual tokens with values for each dimension in a spreadsheet editor. Add a row to create a new token. UUID dimensions show a shortened identifier (hover for the full value); when editing, enter a UUID string or any free text -- non-UUID text is converted deterministically to a UUID.

<img width="581" height="228" alt="initial-states" src="https://github.com/user-attachments/assets/6ecfad1c-f6cf-47e9-94fc-f068d534307c" />

If no initial marking is set, a place starts empty (zero tokens).

When a [scenario](scenarios.md) is selected in Simulation Settings, the per-place State sub-view becomes read-only ("Defined by scenario") and the scenario's initial state is used instead.

## Simulation settings

Open the **Simulation Settings** tab in the bottom panel to configure:

### Scenario

The **Scenario** dropdown lists "No scenario" plus every saved [scenario](scenarios.md). Selecting a scenario overrides parameters and the per-place initial marking with the scenario's values for this run. The picker is locked while a simulation is running; reset to change scenario.

Quick-action buttons next to the picker let you edit the selected scenario, create a new scenario, or jump to the [Scenarios](scenarios.md) management view in Simulate mode.

### Parameters

Override values for this run:

- With **No scenario** selected: each [net-level parameter](petri-net-extensions.md#global-parameters) shows its name and variable name. Boolean parameters use a toggle; real and integer parameters use a numeric input pre-filled with the default.
- With a scenario selected: the **scenario parameters** are shown instead, pre-filled with that scenario's defaults. Net-level parameter values are fixed by the scenario's [parameter bindings](scenarios.md#parameter-bindings) and are not editable here.

Changes here do not modify the parameter definition or the scenario -- they only apply to the simulation. Parameter values are locked while a simulation is running. Reset the simulation to change them.

### Time step (dt)

The time step in seconds per frame. Controls the resolution of ODE integration and how frequently transitions are evaluated.

- **Smaller dt** -- finer approximation, but slower computation.
- **Larger dt** -- faster, but less accurate for continuous dynamics.

Default: `0.01` seconds.

### ODE solver

The numerical method for integrating differential equations. Currently only **Euler** is available.

## Running a simulation

Press **Play** in the bottom toolbar. The simulation:

1. Initializes with a fresh random seed (single-run simulations re-seed each time you press Play, so two consecutive runs of the same stochastic model produce different trajectories), the current dt, and parameter values.
2. Computes frames in a background Web Worker.
3. Streams frames to the UI for playback.

If you need multiple runs of the same configuration -- e.g. to compare a stochastic model under different conditions -- use a Monte Carlo [experiment](experiments.md).

If there are unresolved error-severity [diagnostics](petri-net-extensions.md#diagnostics) (code errors), pressing Play opens the Diagnostics tab instead of starting the simulation. Fix all errors first -- warnings and hints don't block simulation.

<img width="1018" height="354" alt="simulation-settings" src="https://github.com/user-attachments/assets/8736a52e-6455-40fd-bede-51e0439a3e5b" />

## How a frame is computed

Each simulation step proceeds in two phases:

1. **Continuous dynamics** -- for every place with dynamics enabled, the differential equation is integrated one step (Euler method, step size = dt). This updates all token dimension values.

2. **Discrete transitions** -- transitions are evaluated in definition order (deterministic, not random). For each transition:
   - Checks structural enablement (enough tokens for standard/read input arcs, inhibitor conditions met).
   - Evaluates the lambda when one is active for the transition. If no lambda is active, the transition is treated as enabled once its structural arc conditions are met.
   - If the transition fires, removes standard input tokens **immediately** (subsequent transitions see the updated state). Read and inhibitor arcs do not consume tokens.

   All produced output tokens are added at the end of the step. If no transition kernel is active, uncoloured output tokens are generated from the output arc weights.

Simulation time advances by `dt` each frame.

## Deadlock

If no transition fires in a step **and** no transition is structurally enabled (regardless of lambda values), the simulation reports **deadlock** and stops (a "Simulation Complete" message is shown).

This only stops computation: the simulation will continue to playback computed frames until no more are available.

If transitions are structurally enabled but their lambdas prevent firing, the simulation continues stepping.

## Playback controls

The bottom toolbar provides playback controls:

| Control          | Description                         |
| ---------------- | ----------------------------------- |
| **Play**         | Start or resume playback.           |
| **Pause**        | Pause at the current frame.         |
| **Stop / Reset** | Stop playback and reset to frame 0. |

The frame counter shows the current frame number, total frames, and elapsed simulation time.

<img width="717" height="62" alt="simulation-toolbar" src="https://github.com/user-attachments/assets/fc39afbe-8603-4be5-88b1-83d5b09d5367" />

### Speed

Choose a playback speed multiplier via playback settings: **1x**, **2x**, **5x**, **10x**, **30x**, **60x**, **120x**, or **Max** (as fast as possible).

### Play mode

Controls how computation and playback interact:

| Mode                         | Behavior                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| **Play computed steps only** | Replay already-computed frames without further computation. |
| **Play + compute buffer**    | Compute only a small buffer ahead of the playhead.          |
| **Play + compute max**       | Compute frames as fast as possible while playing.           |

### Stopping condition

- **Run indefinitely** -- simulation continues until manually paused or deadlock.
- **End at fixed time** -- simulation stops after a set number of seconds (simulation time).

Stopping conditions are **locked after the simulation starts**. Reset the simulation to change them.

## Timeline

The **Timeline** tab appears in the bottom panel during and after simulation. It shows token counts per place over time as a chart.

<img width="1444" height="471" alt="timeline" src="https://github.com/user-attachments/assets/11e4070b-5b5e-44e9-9f30-2e4e8ae2a1cb" />

- **Chart type** -- toggle between **Run** (line chart) and **Stacked** (area chart) using the control in the tab header.
- **Scrub** -- click or drag on the chart to jump to any frame. A playhead indicator shows the current position.
- **Series selector** -- the strip below the chart lists the traces currently shown. Hover a trace and click the eye icon that replaces its colour swatch to hide it; the trace stays in place, struck through, until the pointer leaves the selector, so you can hide several traces in a row or click again to undo a change. Hidden traces are managed from the dropdown: a **+N more** chip opens the full list when there are more traces than fit, and clicking anywhere else in the selector opens it for searching. The badge shows how many traces are currently shown, and your selection is kept while you switch tabs. Use **Select All** or **Unselect All** for bulk changes, or choose **Only** on a trace row to focus the chart on that one series. Y axis is automatically scaled to the maximum value.

## Viewing state during simulation

Select a place during simulation to see its current token values in the properties panel. For typed places, individual token dimension values are displayed.

If the place has a [visualizer](petri-net-extensions.md#visualizer) defined, it renders live in the properties panel, updating as the simulation progresses.

![visualiser](https://github.com/user-attachments/assets/9324bb5b-4912-499e-8a5d-f2bc6a7754c2)

## Locked editing

The editor is **read-only** during simulation and after a simulation completes. You cannot add, remove, or modify nodes, arcs, types, or code while a simulation exists.

Press **Stop / Reset** to return to editing mode.

At the last frame of a completed simulation, Play is disabled -- reset to replay from the beginning.
