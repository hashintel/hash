# Ad-hoc Scenarios

An **ad-hoc scenario** is an initial state and a set of parameter values defined inline, right where you run -- without saving a [scenario](scenarios.md) first. Petrinaut compiles what you enter through a scenario generated for that run. Nothing is added to the net's scenario list, and leaving the form discards nothing: your entries stay until you clear them.

Use an ad-hoc scenario for one-off runs and quick exploration. When you want to keep a configuration, name it, or compare several setups, [create a scenario](scenarios.md#creating-a-scenario).

## Where the form appears

The same form appears in three places, always when **no scenario is selected**:

1. **Quick simulation** -- in the [Simulation Settings](simulation.md#simulation-settings) tab, with "No scenario" selected, the **Initial state** column edits token counts and values directly in the panel -- no separate dialog. A **Clear** button appears next to the column's title once you have entries. This embedding shows only the initial state: the panel's own parameter inputs set parameter values, and there are no Variables here. The next simulation run uses what you defined. Any [compile error](#errors) appears in the settings panel's error banner.
2. **Experiments** -- in the [create-experiment drawer](experiments.md#creating-an-experiment), choosing "No scenario" shows the form inside the Scenario section. The experiment's runs start from the state you defined, and the experiments table shows "Ad-hoc scenario" in its Scenario column.
3. **Optimizations** -- in the [create-optimization drawer](optimization.md#creating-an-optimization), the scenario picker offers **Ad-hoc (define inline)**. This is the only surface where the form shows **Optimize** controls (see below).

## The form

The form has up to three sections:

- **Parameters** -- one row per [net-level parameter](petri-net-extensions.md#global-parameters), showing its type and its value. An untouched parameter shows its default quietly, marked with a small `default` tag; enter an expression to override the value for this run. In the quick-simulation embedding this section is its own panel beside Initial state.
- **Variables** -- named values (real, integer, or boolean) written as `scenario.<name>` in every expression below, exactly as scenario parameters are written in scenario code. Use them to drive many values from one number. Add one from the dimmed **Add a variable** line at the bottom of the list: like any cell, a first click selects it and a second click (or Enter, or its gutter's `+`) adds the variable -- or reach it with the down arrow from the last row; the fresh name opens ready to type. Each row starts with a small variable-glyph gutter whose menu offers **Delete variable**, and the add line's gutter shows a `+`. A variable's name edits like any other cell: select it, then press Enter (or click again) to edit, and Enter or Escape to leave. Its type select is a cell too: arrow keys move past it, Enter opens it. In the quick-simulation embedding, Variables sit above Parameters in the left column.
- **Initial state** -- one block per place in the net.

In the experiment and optimization drawers each section collapses: click the chevron in its header, or focus the header and press Left to collapse and Right to expand. Place headers inside Initial state collapse the same way everywhere, and a collapsed place shows a one-line summary of its rows and token total.

Every value in the form is an expression. A first click selects a value; a second click, a double-click, or Enter opens the editor in place: a code input with completion and type checking at exactly the cell's position, the value's path (for example `Space › item 0 › x`) above it, and -- in the optimization drawer -- the Optimize control below it. Expressions may use your Variables (`scenario.<name>`), net parameters (`parameters.<name>`), and arithmetic -- the same [expression language](scenarios.md) scenarios use. Press Enter, Escape, or click elsewhere to close the editor; closing tidies a valid expression's formatting (spacing, redundant parentheses) without changing its meaning. A value may also be left **empty**: an empty cell reads as its type's neutral value -- 0 for numbers, `false` for booleans, `""` for text, the nil UUID -- shown grayed in the cell, and it is never an error. An empty dynamic-row count means 1 token; an empty place count means 0.

Opening a value with Enter or a second click selects its whole content, so typing replaces it. Opening by typing keeps the caret right after what you typed.

### Keyboard editing and undo

Every table in the form is a keyboard grid: arrow keys move between cells, phantom rows and type selects included, and moving up from a dynamic row's cells lands on its count strip, so counts and bounds are editable without the mouse. While an editor is open on a value that is just a number (or empty), the up and down arrows step it by 1 (by 10 with Shift held); on a boolean value, Up sets `true` and Down sets `false`; text and UUID values leave the arrows to the editor. Where the form lays its sections out as side-by-side columns (the quick-simulation embedding), vertical arrows stay within a column, and a horizontal arrow at a table's edge crosses into the neighbouring column, returning you to the cell you last used there. Tab keeps its usual browser behaviour throughout the form (inside an open row menu it dismisses the menu, as menus do). A token table's column headers are the grid's top line. In a token table, the left arrow from a row's first cell reaches the **row gutter**: focusing it highlights and selects the whole row, Enter opens the row's menu, and Delete removes the row. The menu is a keyboard menu too: it opens with the current kind focused, arrow keys move through the items, Enter chooses, and Escape returns to the gutter. Every row action lives in that menu -- the row kinds and **Delete row**.

The walk does not stop at a table's edge: moving down from a table's last row continues to the next part of the form -- a section header, a place header, the next table -- and moving up continues backwards the same way. Collapsed sections are skipped.

The whole form has one undo history: Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z (or Ctrl+Y) redoes any edit -- a changed value, an added or deleted row, a shared column, an Optimize toggle. Typing in one value counts as a single step, however long the pause; editing another value starts the next step. Redo restores exactly the state you undid from. An open text editor keeps its own text-level undo until you close it.

### Connections around the focused value

Focusing a value highlights what it is connected to, in amber. A cell that reads a Variable or a net parameter highlights those rows; focusing a Variable or a Parameter row highlights every cell whose expression reads it. The highlight follows the vocabulary: `scenario.<name>` connects to a top-level Variable, `parameters.<name>` to a net parameter, and a bare name to a variable of the same place.

### Places without a token type

A place without a token type is one line: the place's name and a single **token count** slot after a `×` mark.

### Places with a token type

A place with a [token type](petri-net-extensions.md#typed-vs-untyped-places) is a token table with one column per field of the type. Each row is one of three kinds, chosen from the **row menu**: a click on the row's gutter selects the row, and the menu opens from the `⋯` button that appears there (or by pressing Enter on the gutter):

- **Fixed** (`#1`, `#2`, ...) -- the row emits exactly one token.
- **Dynamic** (`i`, blue) -- the row emits many tokens: a quiet strip above the cells shows `×` and the row's **count expression**, and each cell is evaluated once per token with `i` running from `0` to `count - 1` (`count` is also available). The gutter's tooltip shows the row number.
- **Count-optimized** (`i`, purple; optimizations only) -- a dynamic row whose count is an optimization parameter: the strip shows the count's bounds, `× 0 … 12`.

Changing a row's kind never loses anything: its count (bounds included) is restored when you change back. The dimmed trailing row is a **phantom row**, and its cells follow the same selection model as every other cell: a first click selects one, and a second click (or Enter, or the row's `+` gutter) materializes a new fixed row. Remove a row from its gutter: the menu offers **Delete row**, and the Delete key removes it directly. In fixed rows, `i` is the row's position in the list and `count` is `1`.

Below the table, at the right, the place's **token total**: a number when every count resolves, otherwise the unresolved counts printed as they are (for example `2 + scenario.n_satellites tokens`).

### Shared columns

Click a column header to give the whole column **one shared value**: the column takes a subtle wash, the shared value slot appears directly below the header, and the cells beneath turn dimmed and chevron-prefixed -- clicking one edits the shared value. Click the header again to release the column: every cell returns exactly to what it held before, and the shared value is remembered in case you share again.

### Per-place variables

Each place block can declare its own variables from its **Add a variable** line, scoped to that place's rows and referenced by bare name. They are evaluated per row, so they may read `i` -- use one for a per-token intermediate value such as an angle.

A dynamic row's **count** may read the place's variables too, as long as their values don't use `i` or `count` -- the count runs once, before any token exists. A count that reads an `i`-dependent variable shows an error on the count itself.

## Type checking

Every expression is type-checked as you work. The open editor marks problems inline; a closed value with a problem underlines in red and shows the message when you hover it. Cells inherit their type from the token type's field; declared types exist on Variables and counts only. Structural rules (duplicate names, bounds that do not resolve, optimizing a text field) surface the same way, on the value they belong to.

## Optimize selections (optimizations only)

In the optimization drawer, every value slot -- cells, counts, variables, shared columns, and net parameters -- carries a labeled **Optimize** toggle, purple while on: under the open cell editor, and on the row for Variables and Parameters. Turning it on replaces the expression input with a small labeled spreadsheet: **Min**, **Max**, and **Scale** (linear or logarithmic) cells, plus **Step** for integer values other than counts. Each bound is an expression cell with the same selection model as the rest of the form -- select it, press Enter (or click again) to edit, Enter or Escape to leave; Escape from a selected cell closes the editor. A bound may be any expression, but it must resolve to a constant -- one that depends on a Variable or parameter shows an error. Turning Optimize off restores the expression you had, and the bounds are remembered too. An optimized value shows its bounds (`0 … 12`) on a purple slot.

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
