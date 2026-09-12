# Scenarios

A **scenario** is a saved, named configuration for running the current net: a set of initial token values, optional scenario-only parameters, and overrides for net-level parameters. Scenarios make it easy to compare several "what if" setups without editing the net itself.

Scenarios live under the **Simulate** [global mode](drawing-a-net.md#global-modes). To open the scenarios list, switch the mode selector in the top bar from **Edit** to **Simulate**, then choose the **Scenarios** tab in the Simulate sidebar.

## What a scenario contains

A scenario has four parts:

1. **Name** and optional description.
2. **Scenario parameters** -- numeric variables scoped to this scenario. Referenced in expressions as `scenario.<identifier>`.
3. **Parameter overrides** -- expressions that override the default value of net-level parameters, for this scenario only (the form's **Parameters** section).
4. **Initial state** -- the starting marking of each place, authored in the scenario form: one block per place, every value an expression.

You can save as many scenarios as you like; they are stored on the net alongside places, transitions, and parameters.

## No built-in default scenario

A new net starts with the scenario list empty and **no scenario selected** (the Simulation Settings dropdown shows "No scenario"). In that state the simulation uses each place's manually-entered initial marking and the values in the panel's Parameters inputs (pre-filled with the net-level defaults) — unless you define an [ad-hoc initial state](ad-hoc-scenarios.md) in the panel's Initial state column, which overrides the manual marking for every place it defines.

You will need scenarios when you want to:

- Switch between several pre-configured starting states with one click.
- Drive the initial marking from expressions and a small set of high-level variables (population size, infection rate, machine count, ...).
- Run [Monte Carlo experiments](experiments.md) against different scenarios.

## Creating a scenario

1. Switch to **Simulate** mode and open the **Scenarios** tab.
2. Click **Create**. The Create Scenario drawer opens.
3. Fill in **Scenario name** (required, unique among scenarios) and an optional description.
4. Add **Variables** -- one per value you want to drive from a single number, written `scenario.<name>` in every expression below. Turn **Scenario Parameter** on to expose a Variable as a tunable parameter of the saved scenario: it needs a snake_case name, a constant expression as its default, and a value between 0 and 1 for a ratio.
5. Fill in **Parameters** -- an expression per net-level parameter whose default you want to override; the `default` tag marks the untouched ones.
6. Configure **Initial state** -- a count expression per untyped place, rows of cells per typed place (a Dynamic row builds many tokens from one count). See [Ad-hoc Scenarios](ad-hoc-scenarios.md#the-form) for the form itself.
7. Click **Create**. It is disabled while the name or any value has an error -- hover it to read the first.

The view drawer opens from the Scenarios list, which works like the other Simulate-mode lists: the first click selects a row, and a click on the selected row (or Enter) opens it. The list is a single Tab stop whose rows the arrow keys walk. The drawer shows the same form populated with the existing values, with **Close** and **Save** buttons.

## Expression language

Every value in the form is an expression: `parameters` (net-level) and `scenario` (this scenario's Variables) are in scope, along with the `range` helper:

- `range(end)` -- integers from `0` (inclusive) to `end` (exclusive): `range(3)` is `[0, 1, 2]`.
- `range(start, end)` -- from `start` (inclusive) to `end` (exclusive).
- `range(start, end, step)` -- stepping by `step`; a negative step counts down.

`range` mirrors Python's `range` and is handy with `.map` for building token arrays, e.g. `range(scenario.number_of_satellites).map((i) => ({ x: 10 * i, y: 10 * i }))`. A single `range` call is capped at 1,000,000 elements; larger calls fail with an error rather than freezing the editor.

Scenario code compiles through the same restricted TypeScript subset as the other code surfaces (lambdas, kernels, dynamics, metrics) — it never runs as raw JavaScript. The subset covers `const` bindings, arithmetic and comparisons, ternaries and guard `if`s, `Math.*`, object and array literals, `.map(...)` (with an optional index parameter), `.reduce(...)`, `.concat(...)`, `range(...)`, and `Array.from({ length: n }, ...)`. Other constructs — loops, `.filter`/`.slice`/spread, template literals, `let` — are rejected with an error pointing at the offending code.

The subset is strict about booleans and equality: conditions and `&&`/`||` take booleans (write `parameters.x > 0`, not `parameters.x`), `==` is strict (comparing a boolean with a number is flagged as always false — use the boolean directly, e.g. `scenario.enabled ? 1 : 0`), and arithmetic takes numbers.

## Scenarios stored as code

Net files, the AI assistant and earlier versions of Petrinaut may store a scenario's initial state per place (one expression or one token spreadsheet per place) or as a single code block. Both run unchanged, and both preview as computed rows in Simulation Settings and the experiment drawer. Editing opens each in the form: a per-place scenario opens converted -- its parameters as exposed Variables, its expressions and rows as the form's blocks -- and saving stores it in the form's format; a code scenario opens with its name, description, Variables and Parameters editable and its code shown read-only in the Initial state slot -- edit its values here, change the code from the AI assistant or the net file, or recreate the scenario from the form (a Dynamic row builds many tokens from one count). A code scenario stores no form entries, only its scenario parameters: every Variable must be marked **Scenario Parameter** (the form refuses to save one that is not), and each is kept as its computed default. The code is a function body that returns an object keyed by **place name** -- a number for an untyped place (rounded, clamped to `>= 0`), an array of token objects for a typed one -- with `parameters`, `scenario` and `range` in scope; a key that is not a place name is a compile error, so a typo'd name fails the scenario instead of being silently ignored:

```ts
return {
  RawMaterial: scenario.raw_material,
  AvailableMachines: range(scenario.machines_count).map(() => ({
    machine_damage_ratio: scenario.initial_machine_damage,
  })),
};
```

## Parameters

Each net-level parameter gets one row in the form's **Parameters** section. An untouched row shows the parameter's default with a `default` tag; enter an expression to replace it whenever this scenario is active.

Common patterns:

- Hard-coded override: `1.5`
- Derived from a scenario parameter: `scenario.peak_demand * 1.2`
- Combination of both: `parameters.base_rate * scenario.surge_multiplier`

Overrides are evaluated once at the start of each run, before the initial state is computed, so you can safely reference parameter values from inside initial-state expressions or code.

## Running a scenario

In **Edit** mode, open **Simulation Settings** (bottom panel). The **Scenario** dropdown lists "No scenario" plus every saved scenario. While a scenario is selected:

- The form shows the **scenario parameters** editable on the left (with the scenario's defaults pre-filled); the parameter overrides and initial state sit read-only on the right. Adjust the parameters per run; net-level parameter values are fixed by the scenario's overrides.
- The Properties panel **State** sub-view for each place becomes read-only ("Defined by scenario").
- Pressing **Play** runs the simulation with the scenario's overrides and initial state.

Selecting a different scenario resets the scenario-parameter inputs to that scenario's defaults. The picker is locked while a simulation is running or paused; reset the simulation to switch.

If the selected scenario fails to compile (for example an override expression or the initial-state code throws), a red callout appears below the Scenario dropdown listing each error, and the scenario's overrides and initial state are **not** applied until the errors are fixed.

Quick-action buttons next to the dropdown let you edit the selected scenario, create a new one, or jump to the Scenarios management view.

## Pre-bundled scenarios in the example nets

Several of the built-in examples ship with scenarios so you can see realistic configurations. See [Examples](examples.md) for the full list; highlights:

- **SIR Epidemic Model** -- "Seasonal Flu" and "High Virulence Outbreak", driven by `population` and `infected_ratio` scenario parameters plus parameter overrides for infection and recovery rates.
- **Production Machines** -- "Default Production", driven by `raw_material`, `machines_count`, and `initial_machine_damage`.
- **Probabilistic Satellites Launcher** -- four orbit scenarios (Moon, Earth, Mars, Solar), plus "Pre-deployed Constellation", which defines its initial state as code: `range(scenario.number_of_satellites).map(...)` builds a ring of satellites at a configurable altitude, each already travelling at circular-orbit speed so the ring holds its orbit as soon as you press play.

Loading any of these examples is the fastest way to see working scenarios, including one stored as code.
