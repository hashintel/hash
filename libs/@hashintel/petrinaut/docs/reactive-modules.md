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

**Petri Net IR** is a YAML document that describes the net and nothing else. Its sections, in order:

- `colours`: each token colour with its attributes and their types. A string attribute the net only ever writes from a fixed set of values is closed to that set as an `enum`, in first-seen order.
- `dynamics`: each differential equation, with the colour it moves and its code.
- `places`: each place, with its `capacity`, its `colour` and its `dynamics` when it has them. A place with none is a bare `Name:` line.
- `marking`: the tokens each place starts with: a count for a plain place, one record per token for a coloured one. A place that starts empty is absent.
- `transitions`: each transition's arcs and firing rule. Input arcs carry a `weight` and a `kind` when they are not standard arcs of one token; `read` needs the tokens and leaves them, `inhibitor` needs fewer than the weight. A stochastic transition has a `rate`; a predicate transition has a `guard` when its condition reads its tokens. A transition producing coloured tokens has a `kernel`.
- `zeroth`: the compiler flags you changed from their defaults.

Guards, rates, kernels and equations appear as code: the body of the function you wrote, with the net's parameters replaced by their values and the places named as the IR names them. A condition or rate that does not read its tokens is evaluated to a constant instead, so a plain net still reads as a plain net. Keys are UpperCamelCase names derived from your names, and transitions appear in the order a simulation step sweeps them.

**Python Reactive Module** is a Python file that builds the module with `zrth.sugar`: the initial marking as `init` and one Petrinaut simulation step as `update`. A plain transition fires whenever it is enabled. A stochastic transition with rate λ is tested against an external uniform draw and fires when the draw is at least e^(−λ·dt), so given the same draw per transition and step, the module and a Petrinaut run take the same step. A Petrinaut run draws from one seeded stream, and only for the transitions whose tokens allow a firing, so a Petrinaut seed does not transfer to the module. The **Rates** flag below can compile a stochastic net with clocks in continuous time instead.

<!-- prose-check: off -->

A coloured place becomes a fixed number of slots, its capacity or the **slots** flag, each with a present flag and one variable per attribute; a string attribute holds the index of its value. A transition tries its tokens in the order the simulation does and fires on the first that passes; a rate that depends on the tokens is compared with an external exponential draw, `−ln(u) / dt`, which decides exactly as the uniform test does. Dynamics take one Euler step of `dt` on every present token before the transitions fire, as the simulation does. At the end of a step the surviving tokens close up in slot order and the produced tokens land after them; a token that finds no free slot sets the place's overflow flag.

<!-- prose-check: on -->

Both tabs are read-only code editors with syntax highlighting and line numbers. The arrows in the gutter collapse a place, a transition or a function; select text and copy it as usual.

The **Explain lines on hover** button in the window's header, off when the window opens, adds a hover to both tabs. With it on, hover a line to read what it is, why the compiler wrote it, and the IR path and net item it comes from. While the pointer is on a place's or a transition's lines, the item lights up on the canvas; hold ⌘ or Ctrl and click to select it.

When the layout writes more than one file, the Python tab lists them on the right: the main file, then the transitions, the places and the draws. Select a file to show it; the list is one Tab stop, the arrow keys walk the files, and each file keeps its own scroll position. The panel button at the end of the flags row hides the list and brings it back. The flags themselves stay on one line and scroll sideways when the window is narrow.

## Compiler flags

The header of the **Python Reactive Module** tab holds the compiler flags. Each flag picks a strategy for the generated module, and the IR records every flag you change from its default in a `zeroth` section, so the IR alone reproduces the Python. A flag that has no effect on the current net is greyed out, with the reason in its tooltip.

**Shape** decides how the net becomes modules.

- **Monolithic** (default) generates one module that drives every place. Its `update` is the whole step: transitions swept in order, tokens consumed at once, produced tokens landing at the end, and a capped place tracked as what it would hold if the step ended now.
- **Modular** generates one module per transition and one per place, composed into the system with `compose`. A transition module drives a Bool flag, `fire_Name`, that says it fires this round; a place module awaits the flags of its transitions and applies their tokens. A transition reads its places as they were at the start of the step, so when an earlier transition takes from the same place, or moves tokens in a capped place it fills, it awaits that transition's flag and rebuilds the count the sweep would give it. The firings and the markings are the same as the monolithic module's, step for step. Each module has its own interface, so another module, such as a controller, can be composed with the transitions and places it awaits.

**Rates** applies to a stochastic net without colours or dynamics and decides how a rate becomes a firing.

- **Coin** (default) tests each rate against a uniform draw each step of `dt`, as described above, in a linear theory.
- **Clock** compiles the net in Zeroth's SPN theory, as Zeroth's own `birth_death.py` is written. Each transition owns a clock, `clk_Name`, armed with an exponential delay at its rate and run down against the external time reference `t` while its input arcs allow a firing, and an event, `ev_Name`, that it toggles when the clock expires. Each place is a Nat counter that reads the events with `fired` and moves one token at a time. The modules have `next` and `flow` methods and are composed with the clocks hidden, so Shape, Marking, Control, dt and Syntax do not apply; Layout does. A place applies one exclusive case per transition that moves its tokens, so two events in one step leave the count unchanged; Zeroth's executor advances time to the first expiry, so it never produces one.

**Layout** applies to a composed system, the modular shape or Clock rates, and decides how many files the Python is written as.

- **Single file** (default) holds the variables, every module class and the `compose` call in `net.py`.
- **File per module** writes each module class to a file named after it, `transition_infection.py` or `place_susceptible.py`, and keeps the variables, the imports and the `compose` call in `net.py`. Run from the directory the files are written to, `net.py` imports each module by its file name.

**Marking** applies to a stochastic net under Coin rates and decides what a place counts in. A plain net always counts in Int, and Clock rates count in Nat.

- **Real** (default) types every place as Real, because each transition's guard compares its draw, a Real, in the same module.
- **Int** types every place as Int and moves each draw test into a module of its own, `Draw_Name`, that turns the draw into a Bool flag the guard reads. Whole-number markings suit invariants and other analyses over the places.

**Control** applies when a transition's metadata marks it `control: controllable`, the convention the flexible manufacturing cell model follows.

- **Closed** (default) compiles such a transition like any other: it fires whenever it is enabled, as in Petrinaut.
- **Open** adds an external Bool, `go_Name`, for each controllable transition, which then fires only when it is enabled and chosen. The system is open to a controller module that drives the choices, the starting point for controller synthesis. Clock rates take no external choice.

**Syntax** names the step method of every generated module under Coin rates; under Clock rates the methods are `next` and `flow`.

- **init / update** (default) is the name every zrth release accepts.
- **init / next** is the name zrth's tangent work introduces beside `flow`, and needs a zrth that knows it.

The time step a rate is tested over and dynamics step by is the `dt` of the Simulation Settings; the IR records it under `zeroth` when it is not 1. Under Clock rates there is no step, and `dt` is not recorded.

<!-- prose-check: off -->

**Slots** is the number of slots a coloured place without a capacity gets. Set a capacity on the place to fix it per place.

<!-- prose-check: on -->

Closing the window resets the flags to their defaults. They are not saved with the net.

## What it compiles from

The initial state and the parameter values come from the **Simulation Settings** tab of the bottom panel: the selected scenario with its scenario parameter values, or the ad-hoc scenario when no scenario is selected. The time step from the same tab sets the `dt` a stochastic rate is tested over and dynamics step by. Change any of them and the window recompiles.

Parameters are baked into the net as constants. `return true` keeps a plain transition, `return parameters.rate * 2` gives a stochastic transition its rate, and a condition that reads its tokens is carried as code. A transition whose condition is `false`, or whose rate is 0, can never fire and is left out with a note under the output.

## Nets that compile

The IR holds every net that has no component instances: plain, stochastic and mixed transitions, coloured tokens with real, integer, boolean and string attributes, read and inhibitor arcs, kernels and differential equations. When something stops the IR, the window lists the places and transitions concerned, with the reason for each.

The Python module holds what Zeroth's linear theories can express. Guards, rates, kernels and equations may add, subtract, scale by a constant, compare, combine with `&&`, `||` and `!`, branch with `?:`, use `Math.max`, `Math.min` and `Math.abs`, compare string attributes for equality, and draw `Distribution.Gaussian` or `Distribution.Uniform` with constant spreads. Refused, each with its reason under the output: a product or quotient of two token values, powers, `Math.exp`, `Math.log` and the other nonlinear functions, `Math.random`, `Distribution.Lognormal`, uuid attributes, string methods, and a coloured net under the modular shape. The IR tab still shows the whole document when the Python tab refuses.

Clock rates hold less, because the SPN theory tests a count against zero and moves one token at a time. Refused by name: a transition without a rate, a rate that reads its tokens, a rate that is not positive, an arc that carries more than one token, a capacity, a coloured place and dynamics. Switch to Coin rates for such a net.
