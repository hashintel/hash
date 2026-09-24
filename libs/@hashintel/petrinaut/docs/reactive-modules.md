# Zeroth Reactive Modules

The **Zeroth Reactive Modules** window shows the current net compiled for [Zeroth's reactive modules](https://github.com/zeroth-research/reactive-modules): a small Petri net IR, the document a reactive-module compiler reads. It recompiles as you edit the net.

## Opening the window

Open the Command Palette and run **Show Zeroth Reactive Modules**. The window opens over the workspace, floating the first time.

- While floating, drag the title to move the window, or focus the title and use the arrow keys.
- Drag any edge or corner to resize it.
- Close it with the **×** button. Run the command again to reopen it.
- If the window fails to load, run the command again to try once more.

## Docking the window

**Dock Zeroth Reactive Modules** in the title bar turns the window into a column beside the canvas: to the right of the properties panel and to the left of the AI assistant, when either is open. Drag the column's left edge to resize it. **Float Zeroth Reactive Modules** turns it back into a window. The placement and the width are kept while the editor is open, so a window closed while docked reopens docked.

## The Petri Net IR tab

**Petri Net IR** is a YAML document that describes the net and nothing else, in three sections: `places`, each with its capacity when it has one; `marking`, the tokens each place starts with; and `transitions`, each with its weighted arcs and, for a stochastic net, its `rate`. Keys are UpperCamelCase names derived from your place and transition names, and a field at its default is left out, so an unbounded place is a bare `Name:` line and a place that starts empty is absent from `marking`. Transitions appear in the order a simulation step sweeps them.

The tab is a read-only code editor with syntax highlighting and line numbers. The arrows in the gutter collapse a place or a transition; select text and copy it as usual.

## What it compiles from

The initial state and the parameter values come from the **Simulation Settings** tab of the bottom panel: the selected scenario with its scenario parameter values, or the ad-hoc scenario when no scenario is selected. Change either and the window recompiles.

Firing conditions are baked into the net as constants. `return true` keeps a plain transition, `return parameters.rate * 2` gives a stochastic transition its rate. A transition whose condition is `false`, or whose rate is 0, can never fire and is left out with a note under the output.

## Nets that compile

The IR describes uncoloured nets with standard arcs and no continuous dynamics, and a net is either plain (every transition has a predicate condition) or stochastic (every transition has a rate). Coloured tokens, inhibitor and read arcs, differential equations, component instances, and conditions that read their input tokens or draw random numbers are outside it. When the net uses one of these, the window lists the places and transitions that stop the export, with the reason for each.
