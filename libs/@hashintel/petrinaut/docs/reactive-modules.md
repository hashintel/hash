# Zeroth Reactive Modules

The **Zeroth Reactive Modules** window shows the current net compiled for [Zeroth's reactive modules](https://github.com/zeroth-research/reactive-modules): first as a small Petri net IR, then as a Python module that `zrth` can run and verify. It recompiles as you edit the net.

## Opening the window

Open the Command Palette and run **Show Zeroth Reactive Modules**. A floating window opens over the workspace.

- Drag the title to move the window, or focus the title and use the arrow keys.
- Drag any edge or corner to resize it.
- Close it with the **×** button. Run the command again to reopen it.

The window cannot dock into a side panel yet.

## The two tabs

**Petri Net IR** is a YAML document that describes the net and nothing else: its places with their initial token count and capacity, its transitions with their weighted arcs, and for a stochastic net one `rate` per transition. Keys are UpperCamelCase names derived from your place and transition names, and a field at its default is left out, so an empty, unbounded place is a bare `Name:` line. Transitions appear in the order a simulation step sweeps them.

**Python Reactive Module** is a Python file that builds the module with `zrth.sugar`: one module variable per place, the initial marking as `init`, and one Petrinaut simulation step as `update`. A plain transition fires whenever it is enabled. A stochastic transition with rate λ is tested against an external uniform draw and fires when the draw is at least e^(−λ·dt), so the module and a Petrinaut run agree step for step.

Both tabs are read-only code editors with syntax highlighting and line numbers. The arrows in the gutter collapse a place, a transition or a function; select text and copy it as usual.

## What it compiles from

The initial state and the parameter values come from the **Simulation Settings** tab of the bottom panel: the selected scenario with its scenario parameter values, or the ad-hoc scenario when no scenario is selected. The time step from the same tab sets the `dt` a stochastic rate is tested over. Change any of them and the window recompiles.

Firing conditions are baked into the net as constants. `return true` keeps a plain transition, `return parameters.rate * 2` gives a stochastic transition its rate. A transition whose condition is `false`, or whose rate is 0, can never fire and is left out with a note under the output.

## Nets that compile

The IR describes uncoloured nets with standard arcs and no continuous dynamics, and a net is either plain (every transition has a predicate condition) or stochastic (every transition has a rate). Coloured tokens, inhibitor and read arcs, differential equations, component instances, and conditions that read their input tokens or draw random numbers are outside it. When the net uses one of these, the window lists the places and transitions that stop the export, with the reason for each.
