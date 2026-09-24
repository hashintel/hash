# Zeroth Reactive Modules

The **Zeroth Reactive Modules** window shows the current net compiled for [Zeroth's reactive modules](https://github.com/zeroth-research/reactive-modules): first as a small Petri net IR, then as a Python module that `zrth` can run and verify. It recompiles as you edit the net.

## Opening the window

Open the Command Palette and run **Show Zeroth Reactive Modules**. The window opens over the workspace, floating the first time.

- While floating, drag the title to move the window, or focus the title and use the arrow keys.
- Drag any edge or corner to resize it.
- Close it with the **×** button. Run the command again to reopen it.
- If the window fails to load, run the command again to try once more.

## Docking the window

**Dock Zeroth Reactive Modules** in the title bar turns the window into a column beside the canvas: to the right of the properties panel and to the left of the AI assistant, when either is open. Drag the column's left edge to resize it. **Float Zeroth Reactive Modules** turns it back into a window. The placement and the width are kept while the editor is open, so a window closed while docked reopens docked.

## The two tabs

**Petri Net IR** is a YAML document that describes the net and nothing else, in three sections: `places`, each with its capacity when it has one; `marking`, the tokens each place starts with; and `transitions`, each with its weighted arcs and, for a stochastic net, its `rate`. Keys are UpperCamelCase names derived from your place and transition names, and a field at its default is left out, so an unbounded place is a bare `Name:` line and a place that starts empty is absent from `marking`. Transitions appear in the order a simulation step sweeps them.

**Python Reactive Module** is a Python file that builds the module with `zrth.sugar`: the initial marking as `init` and one Petrinaut simulation step as `update`. A plain transition fires whenever it is enabled. A stochastic transition with rate λ is tested against an external uniform draw and fires when the draw is at least e^(−λ·dt), so given the same draw per transition and step, the module and a Petrinaut run take the same step. A Petrinaut run draws from one seeded stream, and only for the transitions whose tokens allow a firing, so a Petrinaut seed does not transfer to the module.

Both tabs are read-only code editors with syntax highlighting and line numbers. The arrows in the gutter collapse a place, a transition or a function; select text and copy it as usual.

## Compiler flags

The header of the **Python Reactive Module** tab holds the compiler flags. Each flag picks a strategy for the generated module, and the IR records every flag you change from its default in a `zeroth` section, so the IR alone reproduces the Python. A flag that has no effect on the current net is greyed out, with the reason in its tooltip.

**Shape** decides how the net becomes modules.

- **Monolithic** (default) generates one module that drives every place. Its `update` is the whole step: transitions swept in order, tokens consumed at once, produced tokens landing at the end, and a capped place tracked as what it would hold if the step ended now.
- **Modular** generates one module per transition and one per place, composed into the system with `compose`. A transition module drives a Bool flag, `fire_Name`, that says it fires this round; a place module awaits the flags of its transitions and applies their tokens. A transition reads its places as they were at the start of the step, so when an earlier transition takes from the same place, or moves tokens in a capped place it fills, it awaits that transition's flag and rebuilds the count the sweep would give it. The firings and the markings are the same as the monolithic module's, step for step. Each module has its own interface, so another module, such as a controller, can be composed with the transitions and places it awaits.

**Marking** applies to a stochastic net and decides what a place counts in. A plain net always counts in Int.

- **Real** (default) types every place as Real, because each transition's guard compares its draw, a Real, in the same module.
- **Int** types every place as Int and moves each draw test into a module of its own, `Draw_Name`, that turns the draw into a Bool flag the guard reads. Whole-number markings suit invariants and other analyses over the places.

**Control** applies when a transition's metadata marks it `control: controllable`, the convention the flexible manufacturing cell model follows.

- **Closed** (default) compiles such a transition like any other: it fires whenever it is enabled, as in Petrinaut.
- **Open** adds an external Bool, `go_Name`, for each controllable transition, which then fires only when it is enabled and chosen. The system is open to a controller module that drives the choices, the starting point for controller synthesis.

**dt**, shown for a stochastic net, is the time step from the Simulation Settings; a rate is tested over it.

Closing the window resets the flags to their defaults. They are not saved with the net.

## What it compiles from

The initial state and the parameter values come from the **Simulation Settings** tab of the bottom panel: the selected scenario with its scenario parameter values, or the ad-hoc scenario when no scenario is selected. The time step from the same tab sets the `dt` a stochastic rate is tested over. Change any of them and the window recompiles.

Firing conditions are baked into the net as constants. `return true` keeps a plain transition, `return parameters.rate * 2` gives a stochastic transition its rate. A transition whose condition is `false`, or whose rate is 0, can never fire and is left out with a note under the output.

## Nets that compile

The IR describes uncoloured nets with standard arcs and no continuous dynamics, and a net is either plain (every transition has a predicate condition) or stochastic (every transition has a rate). Coloured tokens, inhibitor and read arcs, differential equations, component instances, and conditions that read their input tokens or draw random numbers are outside it. When the net uses one of these, the window lists the places and transitions that stop the export, with the reason for each.
