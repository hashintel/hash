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
- **Variables** -- named values (real, integer, or boolean) you can reference by bare name in every expression below. Variables replace scenario parameters in this form: use them to drive many cells from one number.
- **Initial state** -- one block per place in the net.

Every value in the form is an expression. Expressions may use your variables, net parameters as `parameters.<variable_name>`, and arithmetic -- the same [expression language](scenarios.md) scenarios use.

### Places without a token type

A place without a token type is a single **token count** slot.

### Places with a token type

A place with a [token type](petri-net-extensions.md#typed-vs-untyped-places) is a token table with one column per field of the type. Two kinds of rows mix freely:

- **Fixed rows** (numbered `#1`, `#2`, ...) each produce exactly one token. **Add row** appends one.
- **Template rows** (marked `i`) produce many tokens from one row: set the row's **count** in the strip beneath it, and each column's expression is evaluated once per token with `i` running from `0` to `count - 1` (`count` is also available). **Add template** appends one.

### Shared columns

Click a column header to give the whole column **one shared value**. The cells beneath turn dimmed and read-only, showing the value they now derive from; clicking a dimmed cell edits the shared value. Click the header again to un-share: every cell returns exactly to what it held before, and the shared value is remembered in case you share again.

### Per-place variables

Each place block can declare its own variables, scoped to that place's rows. In a template row they may reference `i`, so a per-place variable can express a per-token intermediate value.

## Optimize selections (optimizations only)

In the optimization drawer, every value slot -- cells, counts, variables, shared columns, and net parameters -- carries an **Optimize** toggle. Turning it on replaces the expression with a search domain: **Min**, **Max**, and **Scale** (linear or logarithmic), plus **Step** for integer values. Turning it off restores the expression you had, and the bounds are remembered too.

At least one Optimize selection is required to run. Boolean values and text fields cannot be optimized.

Each selection becomes a generated scenario parameter with a deterministic name, and optimization results attribute back to your selections by these names:

- `adhoc.<place>.r<row>.<field>` -- a cell in a fixed or template row.
- `adhoc.<place>.col.<field>` -- a shared column value.
- `adhoc.count.<place>` -- an untyped place's count; `adhoc.count.<place>.r<row>` for a template row's count.
- `adhoc.var.net.<name>` -- a top-level variable; place-scoped variables use the place's name as the scope.
- `adhoc.param.<variable_name>` -- a net parameter override.

Optimized values follow the same rules as [scenario parameter domains](optimization.md#search-domains): bounds must be finite constants, integer domains need integer bounds and a positive step, and logarithmic domains need a positive minimum. One optimized value cannot appear in another optimized value's bounds.

## Errors

Ad-hoc definitions are validated when you run, with the same checks as scenario code: variable names must be valid identifiers and unique, expressions must evaluate, and typed cells must match their column's type. Errors name the value that failed -- in quick simulation they appear in the Simulation Settings error banner, in the experiment and optimization drawers in the footer.
