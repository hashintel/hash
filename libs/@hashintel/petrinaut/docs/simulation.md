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

Changes here do not modify the parameter definition or the scenario -- they only apply to the simulation. Parameter values are locked while a simulation is running or paused. Reset the simulation to change them.

### Run settings

The capsule at the right of the scenario row says what **Play** computes and with what. It holds the mode switch and, beside it, the simulator with the values it runs at, such as `JS fixed step 0.01 s`. It stays on one line at any panel width; when space runs short the values are cut with an ellipsis, and hovering shows them in full.

### Mode

The mode switch chooses what **Play** computes:

- **Quick simulation** (the default) computes one run and plays it on the canvas, token by token.
- **Stochastic** computes many runs of the same configuration and shows each place's token count across them. See [Stochastic simulation](#stochastic-simulation).

Each mode keeps its own simulator and parameter values. The switch is locked while a simulation exists; reset to change it.

### Simulator

Click the simulator in the capsule to open its popover. It opens over the panel, so nothing in the panel moves. The list at the top chooses what computes the next run, each simulator with a line on what it does. Under **Parameters** are the selected simulator's own fields, so they change with it. Each simulator keeps the values you gave it when you switch to another and back.

| Simulator             | Parameters                    | Modes                        | What it does                                                                                                                                                               |
| --------------------- | ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JS fixed step**     | **Time step**, in seconds     | Quick simulation, Stochastic | Advances every run in steps of one size, as described in [How a run is computed](#how-a-run-is-computed). The default in both modes.                                       |
| **JS adaptive**       | **Max error**                 | Quick simulation, Stochastic | Integrates every place's dynamics with an error-controlled solver that chooses its own steps, and samples the time of each firing from the transitions' rates.             |
| **WebGPU fixed step** | **Time step**, **ODE method** | Stochastic                   | Computes all the runs at once on the graphics card. Offered where the browser supports WebGPU; the same limits apply as for [experiments](experiments.md#compute-backend). |

An [untimed net](#timed-and-untimed-nets) is fired step by step, and no simulator's parameters apply to it. Its Quick simulation is not computed by a simulator: the capsule reads **Step by step**. Its Stochastic simulation still computes the runs on the selected simulator, so the capsule keeps the simulator's name and reads **step by step** in place of its values. The popover says which above the list, and shows no parameter fields.

A simulator that cannot compute what the mode shows is greyed in the list, with the reason in place of its description. While a simulation exists the popover still opens, to read the values, but nothing in it can be changed; reset the simulation first.

- **Time step** -- the simulated seconds one step covers. A smaller step is a finer approximation and slower to compute; a larger one is faster and less accurate for continuous dynamics. Default: `0.01` seconds in Quick simulation and `0.1` in Stochastic, where every run pays for it.
- **Max error** -- the largest error the adaptive solver may make in one step, as a fraction of an attribute's value and in absolute terms near zero. A place whose equation reads only the token's own attributes integrates each token on its own; one whose derivatives are linear in those attributes with constant coefficients advances exactly. Every recorded state carries the error accumulated so far per place.

Whichever simulator runs, it records the state at every transition firing, with the time it happened, and further states in between so that long stretches without a firing stay accurate. Where those further states go is the simulator's own decision. The continuous evolution of token attributes between two recorded states is interpolated from the values and derivatives stored in them, so playback moves through time and any instant of a [continuous](#coloured-nets-and-continuous-runs) run can be viewed.

## The class of a net

Petrinaut works out three things about a net from the net itself. None is stored in the file and none has a switch. The **Diagnostics** tab reads them at its top, each with what it means for a run.

| Dimension  | Values                                                | The net is                                                                                                 |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Time**   | Timed, Untimed                                        | [timed](#timed-and-untimed-nets) when something in it takes time                                           |
| **Colour** | Uncoloured, Statically coloured, Dynamically coloured | [dynamically coloured](#coloured-nets-and-continuous-runs) when the values of a token move between firings |
| **Chance** | Stochastic, Deterministic                             | [stochastic](#stochastic-and-deterministic-nets) when two runs of it can differ                            |

## Timed and untimed nets

Petrinaut works out from the net whether time passes in it.

- A net is **timed** when at least one transition has a **Stochastic rate**, or at least one place has [dynamics](petri-net-extensions.md#differential-equations-dynamics) switched on with an equation listed, for tokens with a **Real** attribute. A run of a timed net is read against simulated time, in seconds.
- A net with neither is **untimed**. Every transition is a **Predicate**, which fires as soon as it holds, so nothing separates one firing from the next but their order. A run of an untimed net is a sequence of **steps** and has no clock, in a Quick simulation, a Stochastic simulation and an [experiment](experiments.md) alike.

An extension that is switched off counts as absent: with stochasticity off, a transition set to Stochastic rate does not make the net timed.

### Steps

In each step every transition gets one turn, in definition order. A transition that is enabled on its turn fires once. Its standard input tokens are removed at once, and the tokens the step produces are added together at the end of the step. The run ends at the first step in which nothing fires: the same step would repeat for ever, so the run reports a deadlock and that step is not counted.

While a run counts steps:

- the toolbar reads **Step 3 of 12**, and the scrubber moves one step at a time;
- **Previous step** and **Next step** move between steps;
- playback settings offer **Steps per second** and **End at step**;
- the Timeline's axis counts steps.

A [Stochastic simulation](#stochastic-simulation) of an untimed net fires every run step by step and reads all of them at every step. Its **End time** field reads **End at step** and takes a whole number. A run that ends before that step, at a step in which nothing fires, keeps its last state in the mean from there on, as a run that deadlocks does in a timed net.

An [experiment](experiments.md) of an untimed net counts steps in the same way.

### Predicates in a timed net

In a timed net a Predicate takes no time: it fires at the instant its input places enable it, so it fires as often as tokens arrive in them. A Predicate with no input place is always enabled and would fire without end at one instant. Petrinaut reports it as an error on the transition, and Play is blocked until the transition has an input place or a stochastic rate. In an untimed net the same transition is allowed: it fires once per step.

## Coloured nets and continuous runs

Petrinaut also works out what the tokens of a net carry, and from it whether anything changes between two firings.

- A net is **uncoloured** when no place has a [type](petri-net-extensions.md#typed-vs-untyped-places). Its tokens are only counted.
- A net is **statically coloured** when a place has a type and no place has running dynamics. Its tokens carry values, which change only when a transition fires.
- A net is **dynamically coloured** when at least one place has [dynamics](petri-net-extensions.md#differential-equations-dynamics) switched on with an equation listed, for tokens with a **Real** attribute. Those attributes move all the time.

A run of a dynamically coloured net is **continuous**: it can be viewed at any time it covers. A run of any other net is **discrete**, timed or untimed: its state changes only when a transition fires, so it has nothing to show between two firings.

A dynamically coloured net is always timed, which leaves three kinds of run:

| Net                             | Example                                                                                    | A run is read              |
| ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| Untimed                         | [Bicycle Assembly](examples.md#bicycle-assembly), [Wheel Truing](examples.md#wheel-truing) | Step by step               |
| Timed, not dynamically coloured | [Café Queue](examples.md#café-queue), [SIR](examples.md#sir-epidemic-model)                | In seconds, at its firings |
| Timed, dynamically coloured     | [Drone Patrol](examples.md#drone-patrol)                                                   | In seconds, at any time    |

The view of a discrete run rests on a firing, or on the initial state:

- dragging the scrubber, or clicking or dragging on the Timeline, lands on the last firing at or before the pointer;
- with the scrubber focused, the left and right arrow keys move to the previous and the next firing;
- **Pause** rests on the last firing played;
- the Timeline draws no ticks between the firings.

A timed discrete run still takes its time to play. The readout and the playhead move through the seconds between two firings, and playback that reaches the end of the run stops at its end time.

## Stochastic and deterministic nets

Petrinaut works out whether two runs of a net from one initial state can differ.

- A net is **stochastic** when at least one transition has a **Stochastic rate**, or when its code draws at random: a kernel that uses a [distribution](petri-net-extensions.md#distributions) or generates a UUID, or a call to `Math.random()` in a firing rate, a kernel or a differential equation.
- Every other net is **deterministic**. Every run of it is the same, whatever the seed, so a [Stochastic simulation](#stochastic-simulation) of it computes one run many times.

This is read from the code, so it needs the code to compile. While some of it has errors and nothing else makes the net stochastic, Diagnostics reads **Unknown**.

## Running a simulation

Press **Play** in the bottom toolbar. The simulation:

1. Initializes with a fixed random seed, the selected simulator's parameters, and parameter values, so pressing Play twice with the same configuration reproduces the same trajectory. Many runs at once, and a search over parameters, are an [experiment](experiments.md).
2. Computes the run in a background Web Worker, only as far ahead of the viewed time as the play mode asks for.
3. Streams the recorded states to the UI for playback.

If you need multiple runs of the same configuration -- e.g. to compare a stochastic model under different conditions -- use a Monte Carlo [experiment](experiments.md).

If there are unresolved error-severity [diagnostics](petri-net-extensions.md#diagnostics) (code errors), pressing Play opens the Diagnostics tab instead of starting the simulation. Fix all errors first -- warnings and hints don't block simulation.

<img width="1018" height="354" alt="simulation-settings" src="https://github.com/user-attachments/assets/8736a52e-6455-40fd-bede-51e0439a3e5b" />

### Navigating Simulation Settings

Use arrow keys to move between the scenario picker, its action buttons, the run settings, and the tables below. Enter opens a picker or edits a selected table value. Text fields keep Left and Right for moving the caret until it reaches an edge. Tab follows the usual browser order.

The uppercase section headers stack at the top as you scroll each column. Earlier headers fade slightly; click one to return to that section. Upcoming section headers stay at the bottom; click one to jump ahead. A soft fade marks the edge where content scrolls beneath the headers and clears when you return to the section's start. Informational tooltips are skipped by Tab and arrow-key navigation. Scrollbars overlay the content when you hover over a scrollable area, without shifting the columns. Initial state starts with the places marked **Default starting place** in their properties. Turn on the compact **Show all places** switch beside the Initial state title and info icon to inspect the rest. The switch appears only when the model contains other places. Left collapses an expanded place; Left again moves to the neighbouring focus group.

## Stochastic simulation

With the mode set to **Stochastic**, the simulator's popover gains two fields after the simulator's own, and the capsule reads them after the simulator's values, such as `0.1 s · 100 runs · to 60 s`:

- **Runs** -- how many independent runs are computed. Default: `100`. More runs give a steadier mean and a truer spread, and take longer.
- **End time** -- the simulated time every run stops at. Runs are compared at the same times, so a Stochastic simulation needs one; switching to Stochastic sets `60` seconds when none was set.

Press **Play**. The runs are computed in background workers, or on the graphics card with the WebGPU simulator, and the canvas shows what they add up to. A fixed-step simulator is sampled at its time step; the adaptive one, which has none, every tenth of a simulated second. An [untimed net](#timed-and-untimed-nets) is sampled at every step, whichever simulator computes it:

- **Places** -- each place's badge reads the mean token count across runs at the viewed time, followed by its spread (one standard deviation) when the runs differ, such as `12.9 ±2.9`.
- **Transitions** -- nothing fires on the canvas: there is no single run to show.
- **Timeline** -- one line per place, the mean token count across runs over time. **Stacked** adds the places up as bands. There is no Metric picker in this mode.
- **Playback bar** -- Play, Pause, the time readout and the scrubber move the viewed time, which never passes what every run has reached. Pause stops the viewed time only; the runs go on computing. The bar also shows how many runs have finished.

**Keep as experiment** on the playback bar lists the simulation under **Simulate → Experiments**, named after its scenario and run count, with a chart of each place's token count across runs. It then outlives a reset, and from there it is cancelled or removed like any other [experiment](experiments.md). A simulation that was not kept is discarded by **Stop / Reset**.

The same seed gives the same result every time for a given simulator. The WebGPU simulator uses a different random generator than the JS one, so the two agree on the distributions, not on the individual numbers.

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

If transitions are structurally enabled but their lambdas prevent firing, the simulation continues stepping. A run in [steps](#steps) is the exception, alone or among the runs of a Stochastic simulation or an experiment: a step in which nothing fires ends it, whatever stays structurally enabled.

A transition blocked only because its output place is at [capacity](drawing-a-net.md#token-capacity) is _not_ structurally enabled, so a net whose remaining transitions are all blocked by full places reports deadlock rather than stepping on with nothing happening.

## Playback controls

The bottom toolbar provides playback controls:

| Control          | Description                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Play**         | Start or resume playback.                                                                                                    |
| **Pause**        | Pause at the current point in the run. A [discrete](#coloured-nets-and-continuous-runs) run rests on the last firing played. |
| **Stop / Reset** | Stop playback and reset to the run start.                                                                                    |

The time readout shows the viewed simulation time and the time the run is
computed up to, to the millisecond. Both values include
**s** for seconds: the current time is prominent, with **of** and the total below it.
The toolbar expands with a quick start and gentle settle to reveal the time readout and scrubber when a run starts.

A run in [steps](#steps) reads **Step** and the step being viewed, with **of** and the number of steps computed below it.

Playback widens the toolbar, so in a narrow window it keeps Play and folds the
scrubber, the time readout and the playback settings away until you point at
it.

<img width="717" height="62" alt="simulation-toolbar" src="https://github.com/user-attachments/assets/fc39afbe-8603-4be5-88b1-83d5b09d5367" />

### Speed

Choose a playback speed multiplier via playback settings: **1x**, **2x**, **5x**, **10x**, **30x**, **60x**, **120x**, or **Max** (as fast as possible).

For a run in [steps](#steps) the section reads **Steps per second**, with the same values.

### Play mode

Controls how computation and playback interact:

| Mode                         | Behavior                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| **Play computed steps only** | Replay what is already computed without further computation. |
| **Play + compute buffer**    | Compute only a small buffer ahead of the playhead.           |
| **Play + compute max**       | Compute as fast as possible while playing.                   |

A Stochastic simulation is not paced by the playhead: once started, its runs compute to the end time in every mode.

### Stopping condition

- **Run indefinitely** -- simulation continues until manually paused or deadlock. Not available for a Stochastic simulation, which needs an end time.
- **End at fixed time** -- simulation stops after a set number of seconds (simulation time). For a run in [steps](#steps) it reads **End at step**, with a whole number.

Stopping conditions are **locked after the simulation starts**. Reset the simulation to change them.

## Timeline

The **Timeline** tab appears in the bottom panel during and after simulation. It shows token counts per place over time as a chart. Resetting the simulation closes the tab and returns the panel to **Simulation Settings**, where the next run is set up.

<img width="1444" height="471" alt="timeline" src="https://github.com/user-attachments/assets/11e4070b-5b5e-44e9-9f30-2e4e8ae2a1cb" />

- **Chart type** -- toggle between **Run** (line chart) and **Stacked** (area chart) using the control in the tab header.
- **Scrub** -- click the chart to view that time, or drag across it. A playhead indicator shows the viewed time. For a run in [steps](#steps) the axis counts steps and the tooltip names the step under the pointer. In a [discrete](#coloured-nets-and-continuous-runs) run the playhead lands on the last firing at or before the pointer.
- **Closing the panel** -- a closed timeline stops reading the run and stops drawing, so a run costs nothing on its account while it is out of sight. Reopen it and it catches up on everything it missed.
  The timeline shows the run's events. Token counts per place or per type are drawn as steps that change at the events, and **Transition firings** shows one lane per transition with a mark at every firing. The Metric picker groups user metrics by what their code reads: a **discrete** metric reads only token counts and attributes that change at events, so it is drawn as steps read at the events; a **continuous** metric reads an attribute that follows a differential equation, so it is drawn as a curve read from the interpolated state between events. With the **Adaptive** solver the picker also offers **Solver › Accumulated error**: one series per place with dynamics, the error the solver has accumulated for that place's attributes since the start of the run, stepped at the events it was recorded on, in the attributes' own units. A place advanced exactly stays at zero. Every firing is also marked on the ruler above the chart, and pointing at one names the transitions that fired; in a continuous run, fainter ticks mark the frames recorded between firings. Click anywhere in the chart to view that exact time and drag to scrub; a drag that starts on the playhead keeps it under the pointer. Scroll sideways to pan, and pinch or scroll up and down to zoom around the pointer; **Fit to run** returns to the whole run. With the chart focused, the arrow keys step between firings, and Home and End jump to the start and to the end of what is computed. The playback bar gains **Previous event** and **Next event** buttons that move between firings and the initial state, and its scrubber moves through time rather than frames. **Stacked** adds the traces up as bands, for token counts and for a metric; the chart type control is not offered for **Transition firings** or **Accumulated error**, which have no stacked form.

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
