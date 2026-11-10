# Simulation

This page covers running a **single** simulation from Edit mode. For repeatable, named simulation configurations see [Scenarios](scenarios.md); for many-run Monte Carlo batches see [Experiments](experiments.md).

## Initial state

Before running a simulation, set the **initial marking** -- the starting tokens in each place.

Open **Simulation Settings** in the bottom panel to configure the initial state. Select a saved [scenario](scenarios.md), or choose **No scenario** and define an [ad-hoc initial state](ad-hoc-scenarios.md) in the Initial state column.

Select a place and open its **State** sub-view to inspect the resulting tokens. This view is always read-only, including when no saved scenario is selected:

- **Untyped places** show the token count.
- **Typed places** show each token's attribute values in a read-only grid.

During simulation, the State sub-view shows the tokens at the viewed time. Make initial-state changes in Simulation Settings.

## Simulation settings

Open the **Simulation Settings** tab in the bottom panel to configure:

### Scenario

The **Scenario** dropdown lists "No scenario" plus every saved [scenario](scenarios.md). Selecting a scenario overrides parameters and the per-place initial marking with the scenario's values for this run. The picker is locked while a simulation is running; reset to change scenario.

Quick-action buttons next to the picker let you edit the selected scenario, create a new scenario, or jump to the [Scenarios](scenarios.md) management view in Simulate mode. With "No scenario" selected, the panel becomes an [ad-hoc scenario](ad-hoc-scenarios.md) for the next run, without saving anything: **Variables** and **Parameters** share the left column and an **Initial state** column fills the right; a **Clear** button next to the Initial state title resets it.

### Parameters

Override values for this run:

- With **No scenario** selected: the form's **Parameters** table -- an expression per [net-level parameter](petri-net-extensions.md#global-parameters), the default shown with a `default` tag until you override it; expressions may read the Variables above as `scenario.<name>`.
- With a scenario selected: the **scenario parameters** are shown instead, pre-filled with that scenario's defaults. Net-level parameter values are fixed by the scenario's [parameter overrides](scenarios.md#parameters) and are not editable here. Every selected scenario shows through the [ad-hoc form](ad-hoc-scenarios.md): its scenario parameters take value edits in the left column, and its parameter overrides and initial state sit read-only in the right one -- browsable with the same keyboard navigation, but only a scenario edit (the pencil next to the picker) changes them. Every scenario shows computed parameter values and the exact tokens the run will start with, recomputed as you change scenario parameters. Select a read-only value to see its source expression in a floating cell over the selected value. The expression disappears when focus moves away. Very large places preview their first 100 rows.

Changes here do not modify the parameter definition or the scenario -- they only apply to the simulation. Parameter values are locked while a simulation is running. Reset the simulation to change them.

### Simulator

The **Simulator** picker beside the scenario picker chooses what computes the next run. The fields to its right are the selected simulator's own parameters, so they change with it. Each simulator keeps the values you gave it when you switch to another and back.

| Simulator             | Parameters                    | What it does                                                                                                                                                             |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **JS fixed step**     | **Time step**, in seconds     | Advances the run in steps of one size, as described in [How a run is computed](#how-a-run-is-computed). The default.                                                     |
| **JS adaptive**       | **Max error**                 | Integrates every place's dynamics with an error-controlled solver that chooses its own steps, and samples the time of each firing from the transitions' rates.           |
| **WebGPU fixed step** | **Time step**, **ODE method** | Computes many runs at once on the graphics card. It is listed for reference and cannot be picked for a single run; [experiments](experiments.md#compute-backend) use it. |

A simulator that cannot compute a single run is greyed in the list, with the reason beside its name. The picker and its fields are locked while a simulation exists; reset to change them.

- **Time step** -- the simulated seconds one step covers. A smaller step is a finer approximation and slower to compute; a larger one is faster and less accurate for continuous dynamics. Default: `0.01` seconds.
- **Max error** -- the largest error the adaptive solver may make in one step, as a fraction of an attribute's value and in absolute terms near zero. A place whose equation reads only the token's own attributes integrates each token on its own; one whose derivatives are linear in those attributes with constant coefficients advances exactly. Every recorded state carries the error accumulated so far per place.

Whichever simulator runs, it records the state at every transition firing, with the time it happened, and further states in between so that long stretches without a firing stay accurate. Where those further states go is the simulator's own decision. The continuous evolution of token attributes between two recorded states is interpolated from the values and derivatives stored in them, so playback moves through time and any instant can be viewed.

## Running a simulation

Press **Play** in the bottom toolbar. The simulation:

1. Initializes with a fixed random seed, the selected simulator's parameters, and parameter values, so pressing Play twice with the same configuration reproduces the same trajectory. Many runs at once, and a search over parameters, are an [experiment](experiments.md).
2. Computes the run in a background Web Worker, only as far ahead of the viewed time as the play mode asks for.
3. Streams the recorded states to the UI for playback.

If you need multiple runs of the same configuration -- e.g. to compare a stochastic model under different conditions -- use a Monte Carlo [experiment](experiments.md).

If there are unresolved error-severity [diagnostics](petri-net-extensions.md#diagnostics) (code errors), pressing Play opens the Diagnostics tab instead of starting the simulation. Fix all errors first -- warnings and hints don't block simulation.

<img width="1018" height="354" alt="simulation-settings" src="https://github.com/user-attachments/assets/8736a52e-6455-40fd-bede-51e0439a3e5b" />

### Navigating Simulation Settings

Use arrow keys to move between the scenario picker, its action buttons, the time-step field, and the tables below. Enter opens a picker or edits a selected table value. Text fields keep Left and Right for moving the caret until it reaches an edge. Tab follows the usual browser order.

The uppercase section headers stack at the top as you scroll each column. Earlier headers fade slightly; click one to return to that section. Upcoming section headers stay at the bottom; click one to jump ahead. A soft fade marks the edge where content scrolls beneath the headers and clears when you return to the section's start. Informational tooltips are skipped by Tab and arrow-key navigation. Scrollbars overlay the content when you hover over a scrollable area, without shifting the columns. Initial state starts with the places marked **Default starting place** in their properties. Turn on the compact **Show all places** switch beside the Initial state title and info icon to inspect the rest. The switch appears only when the model contains other places. Left collapses an expanded place; Left again moves to the neighbouring focus group.

## How a run is computed

The **JS fixed step** simulator advances in steps of the **Time step**. Each step proceeds in two phases:

1. **Continuous dynamics** -- for every place with dynamics enabled, its differential equations are integrated one step (Euler method, one time step). The derivatives of every [listed equation](petri-net-extensions.md#composing-equations) are summed first, an equation over several tokens contributing once per combination of that many tokens. This updates all token dimension values.

2. **Discrete transitions** -- transitions are evaluated in definition order (deterministic, not random). For each transition:
   - Checks structural enablement (enough tokens for standard/read input arcs, inhibitor conditions met, and enough room in any output place with a [token capacity](drawing-a-net.md#token-capacity)).
   - Evaluates the lambda when one is active for the transition. If no lambda is active, the transition is treated as enabled once its structural arc conditions are met.
   - If the transition fires, removes standard input tokens **immediately** (subsequent transitions see the updated state). Read and inhibitor arcs do not consume tokens.

   All produced output tokens are added at the end of the step. If no transition kernel is active, uncoloured output tokens are generated from the output arc weights. Because output is applied at the end of the step, capacity accounts for tokens that transitions earlier in the same step have already produced -- several transitions feeding one capped place cannot collectively overflow it.

Simulation time advances by the time step each step. A firing is recorded at the end of the step it happened in.

The **JS adaptive** simulator has no step to set. Between firings it integrates each place's dynamics with steps it chooses so that no step's error exceeds **Max error**. It draws the time of the next firing from the transitions' rates, every combination of tokens a transition could consume counting as a firing of its own, so a firing lands at the instant it was drawn for rather than at the end of a step. A transition with a predicate fires at the instant its condition starts to hold. The same seed gives a different run than the fixed-step simulator does: the two draw their random numbers at different moments.

## What a firing looks like

A transition that fires flashes yellow, shows a lightning bolt, and thickens the arcs it moved tokens along, by an amount that grows with how many fired at once.

Firings you cannot see are not animated: a node off the side of the canvas, or a net zoomed out far enough that a node is only a few pixels across. Token counts, arcs and the timeline are unaffected -- only the flash is skipped, which is what keeps a large net moving at speed. Zoom in and the firings you are looking at animate as usual.

## Deadlock

If no transition fires in a step **and** no transition is structurally enabled (regardless of lambda values), the simulation reports **deadlock** and stops (a "Simulation Complete" message is shown).

This only stops computation: playback continues to the time the run stopped at.

If transitions are structurally enabled but their lambdas prevent firing, the simulation continues stepping.

A transition blocked only because its output place is at [capacity](drawing-a-net.md#token-capacity) is _not_ structurally enabled, so a net whose remaining transitions are all blocked by full places reports deadlock rather than stepping on with nothing happening.

## Playback controls

The bottom toolbar provides playback controls:

| Control          | Description                               |
| ---------------- | ----------------------------------------- |
| **Play**         | Start or resume playback.                 |
| **Pause**        | Pause at the current point in the run.    |
| **Stop / Reset** | Stop playback and reset to the run start. |

The time readout shows the viewed simulation time and the time the run is
computed up to, to the millisecond. Both values include
**s** for seconds: the current time is prominent, with **of** and the total below it.
The toolbar expands with a quick start and gentle settle to reveal the time readout and scrubber when a run starts.

Playback widens the toolbar, so in a narrow window it keeps Play and folds the
scrubber, the time readout and the playback settings away until you point at
it.

<img width="717" height="62" alt="simulation-toolbar" src="https://github.com/user-attachments/assets/fc39afbe-8603-4be5-88b1-83d5b09d5367" />

### Speed

Choose a playback speed multiplier via playback settings: **1x**, **2x**, **5x**, **10x**, **30x**, **60x**, **120x**, or **Max** (as fast as possible).

### Play mode

Controls how computation and playback interact:

| Mode                         | Behavior                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| **Play computed steps only** | Replay what is already computed without further computation. |
| **Play + compute buffer**    | Compute only a small buffer ahead of the playhead.           |
| **Play + compute max**       | Compute as fast as possible while playing.                   |

### Stopping condition

- **Run indefinitely** -- simulation continues until manually paused or deadlock.
- **End at fixed time** -- simulation stops after a set number of seconds (simulation time).

Stopping conditions are **locked after the simulation starts**. Reset the simulation to change them.

## Timeline

The **Timeline** tab appears in the bottom panel during and after simulation. It shows token counts per place over time as a chart.

<img width="1444" height="471" alt="timeline" src="https://github.com/user-attachments/assets/11e4070b-5b5e-44e9-9f30-2e4e8ae2a1cb" />

- **Chart type** -- toggle between **Run** (line chart) and **Stacked** (area chart) using the control in the tab header.
- **Scrub** -- click the chart to view that time, or drag the ruler or the playhead. A playhead indicator shows the viewed time.
- **Closing the panel** -- a closed timeline stops reading the run and stops drawing, so a run costs nothing on its account while it is out of sight. Reopen it and it catches up on everything it missed.
  The timeline shows the run's events. Token counts per place or per type are drawn as steps that change at the events, and **Transition firings** shows one lane per transition with a mark at every firing. The Metric picker groups user metrics by what their code reads: a **discrete** metric reads only token counts and attributes that change at events, so it is drawn as steps read at the events; a **continuous** metric reads an attribute that follows a differential equation, so it is drawn as a curve read from the interpolated state between events. With the **Adaptive** solver the picker also offers **Solver › Accumulated error**: one series per place with dynamics, the error the solver has accumulated for that place's attributes since the start of the run, stepped at the events it was recorded on, in the attributes' own units. A place advanced exactly stays at zero. Every firing is also marked on the ruler above the chart, and pointing at one names the transitions that fired; fainter ticks mark the frames recorded between firings. Drag the ruler or the playhead to scrub, click anywhere to view that exact time, and drag across the chart to select a range, which has no effect yet. Scroll sideways to pan, and pinch or scroll up and down to zoom around the pointer; **Fit to run** returns to the whole run. With the chart focused, the arrow keys step between firings, and Home and End jump to the start and to the end of what is computed. The playback bar gains **Previous event** and **Next event** buttons that move between firings and the initial state, and its scrubber moves through time rather than frames. **Stacked** adds the traces up as bands, for token counts and for a metric; the chart type control is not offered for **Transition firings** or **Accumulated error**, which have no stacked form.

- **Series selector** -- the strip below the chart lists the traces currently shown. Hover a trace and click the eye icon that replaces its colour swatch to hide it; the trace stays in place, struck through, until the pointer leaves the selector, so you can hide several traces in a row or click again to undo a change. Hidden traces are managed from the dropdown: click the **N/M shown** badge (or anywhere else in the selector) to open the full list for searching, which is also where traces that don't fit in the strip live. The badge shows how many traces are currently shown, and your selection is kept while you switch tabs. Use **Select All** or **Unselect All** for bulk changes, or choose **Only** on a trace row to focus the chart on that one series. Y axis is automatically scaled to the maximum value.

## Viewing state during simulation

Select a place during simulation to see its current token values in the properties panel. For typed places, individual token dimension values are displayed.

If the place has a [visualizer](petri-net-extensions.md#visualizer) defined, it renders live in the properties panel, updating as the simulation progresses.

The same visualizer is reachable on the canvas: point at the place, click the button that appears above it, and its [pin](petri-net-extensions.md#visualizer) holds it open while you scrub the timeline or change the initial state.

![visualiser](https://github.com/user-attachments/assets/9324bb5b-4912-499e-8a5d-f2bc6a7754c2)

## Locked editing

The editor is **read-only** during simulation and after a simulation completes. You cannot add, remove, or modify nodes, arcs, types, or code while a simulation exists.

Press **Stop / Reset** to return to editing mode.

At the end of a completed simulation, Play is disabled -- reset to replay from the beginning.
