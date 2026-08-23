# Ad-hoc Scenarios

An **ad-hoc scenario** is an initial state and a set of parameter values defined inline, right where you run -- without saving a [scenario](scenarios.md) first. Petrinaut compiles what you enter through a scenario generated for that run. Nothing is added to the net's scenario list, and closing the form discards nothing: your entries stay until you clear them or close the drawer that owns them.

Use an ad-hoc scenario for one-off runs and quick exploration. When you want to keep a configuration, name it, or compare several setups, [create a scenario](scenarios.md#creating-a-scenario).

## Where the form appears

The same form appears in three places, always when **no scenario is selected**:

1. **Quick simulation** -- in the [Simulation Settings](simulation.md#simulation-settings) tab, with "No scenario" selected, a pencil button next to the scenario picker opens the **Define initial state** drawer. The next simulation run uses what you defined. Any [compile error](#errors) appears in the settings panel's error banner.
2. **Experiments** -- in the [create-experiment drawer](experiments.md#creating-an-experiment), choosing "No scenario" shows the form inside the Scenario section. The experiment's runs start from the state you defined, and the experiments table shows "Ad-hoc scenario" in its Scenario column.
3. **Optimizations** -- in the [create-optimization drawer](optimization.md#creating-an-optimization), the scenario picker offers **Ad-hoc (define inline)**. This is the only surface where the form shows **Optimize** controls (see below).

## The form

The form has up to three sections:

- **Parameters** -- one row per [net-level parameter](petri-net-extensions.md#global-parameters), showing its default. Enter an expression to override a value for this run. This section appears in the experiment and optimization drawers; the quick-simulation drawer omits it because the Simulation Settings panel already has parameter inputs.
- **Variables** -- named values (real, integer, or boolean) written as `scenario.<name>` in every expression below, exactly as scenario parameters are written in scenario code. Use them to drive many values from one number. Add one from the icon button in the section header.
- **Initial state** -- one block per place in the net.

Every value in the form is an expression. Click a value to open its editor: a code input with completion and type checking, and the value's path (for example `Space › item 0 › x`) as its title. Expressions may use your Variables (`scenario.<name>`), net parameters (`parameters.<name>`), and arithmetic -- the same [expression language](scenarios.md) scenarios use. Press Enter to close the editor.

### Places without a token type

A place without a token type is a single **token count** slot after a `×` mark.

### Places with a token type

A place with a [token type](petri-net-extensions.md#typed-vs-untyped-places) is a token table with one column per field of the type. Each row is one of three kinds, and **clicking the row's gutter cycles between them**:

- **Fixed** (`#1`, `#2`, ...) -- the row emits exactly one token.
- **Dynamic** (`i`, blue) -- the row emits many tokens: a quiet strip above the cells shows `×` and the row's **count expression**, and each cell is evaluated once per token with `i` running from `0` to `count - 1` (`count` is also available). The gutter's tooltip shows the row number.
- **Count-optimized** (`i`, purple; optimizations only) -- a dynamic row whose count is an optimization parameter: the strip shows the count's bounds, `× 0 … 12`.

Cycling never loses anything: a row's count (bounds included) is restored when you cycle back. The dimmed trailing row is a **phantom row**: click any of its cells to materialize a new fixed row. In fixed rows, `i` is the row's position in the list and `count` is `1`.

The table's bottom line shows the place's **token total**: a number when every count resolves, otherwise the unresolved counts printed as they are (for example `= 2 + scenario.n_satellites tokens`).

### Shared columns

Click a column header to give the whole column **one shared value**: the column takes a subtle wash, the shared value slot appears directly below the header, and the cells beneath turn dimmed and chevron-prefixed -- clicking one edits the shared value. Click the header again to release the column: every cell returns exactly to what it held before, and the shared value is remembered in case you share again.

### Per-place variables

Each place block can declare its own variables from the icon button in its header, scoped to that place's rows and referenced by bare name. They are evaluated per row, so they may read `i` -- use one for a per-token intermediate value such as an angle.

## Type checking

Every expression is type-checked as you work. The open editor marks problems inline; a closed value with a problem underlines in red and shows the message when you hover it. Cells inherit their type from the token type's field; declared types exist on Variables and counts only. Structural rules (duplicate names, bounds that do not resolve, optimizing a text field) surface the same way, on the value they belong to.

## Optimize selections (optimizations only)

In the optimization drawer, every value slot -- cells, counts, variables, shared columns, and net parameters -- carries an **Optimize** toggle at the bottom right of its editor. Turning it on replaces the expression input with a search domain: **Min**, **Max**, and **Scale** (linear or logarithmic), plus **Step** for integer values other than counts. Turning it off restores the expression you had, and the bounds are remembered too. An optimized value shows its bounds (`0 … 12`) on a purple slot.

At least one Optimize selection is required to run; a cell muted by a shared column does not count. Text fields cannot be optimized; a boolean value optimizes as a true/false choice with no bounds.

Each selection becomes a generated scenario parameter with a deterministic name, and optimization results attribute back to your selections by these names:

- `adhoc.<place>.r<row>.<field>` -- a cell in a fixed or dynamic row.
- `adhoc.<place>.col.<field>` -- a shared column value.
- `adhoc.count.<place>` -- an untyped place's count; `adhoc.count.<place>.r<row>` for a dynamic row's count.
- `adhoc.var.net.<name>` -- a top-level Variable; place-scoped variables use the place's name as the scope.
- `adhoc.param.<variable_name>` -- a net parameter override.

Optimized values follow the same rules as [scenario parameter domains](optimization.md#search-domains): bounds must be expressions that resolve to finite constants, integer domains need integer bounds and a positive step, and logarithmic domains need a positive minimum. One optimized value cannot appear in another optimized value's bounds.

## Errors

Ad-hoc definitions are validated as you type, on the value they belong to, and again when you run. In quick simulation, compile problems also appear in the Simulation Settings error banner; in the experiment and optimization drawers, in the footer.
