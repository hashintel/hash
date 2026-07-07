# Scenarios

A **scenario** is a saved, named configuration for running the current net: a set of initial token values, optional scenario-only parameters, and overrides for net-level parameters. Scenarios make it easy to compare several "what if" setups without editing the net itself.

Scenarios live under the **Simulate** [global mode](drawing-a-net.md#global-modes). To open the scenarios list, switch the mode selector in the top bar from **Edit** to **Simulate**, then choose the **Scenarios** tab in the Simulate sidebar.

## What a scenario contains

A scenario has four parts:

1. **Name** and optional description.
2. **Scenario parameters** -- numeric variables scoped to this scenario. Referenced in code as `scenario.<identifier>`.
3. **Parameter bindings** -- expressions that override the default value of each net-level parameter, for this scenario only.
4. **Initial state** -- the starting marking of each place. Authored either per-place or as a single function (see below).

You can save as many scenarios as you like; they are stored on the net alongside places, transitions, and parameters.

## No built-in default scenario

A new net starts with the scenario list empty and **no scenario selected** (the Simulation Settings dropdown shows "No scenario"). In that state the simulation uses each place's manually-entered initial marking and the net-level parameter defaults.

You will need scenarios when you want to:

- Switch between several pre-configured starting states with one click.
- Drive the initial marking from expressions and a small set of high-level variables (population size, infection rate, machine count, ...).
- Run [Monte Carlo experiments](experiments.md) against different scenarios.

## Creating a scenario

1. Switch to **Simulate** mode and open the **Scenarios** tab.
2. Click **Create**. The Create Scenario drawer opens.
3. Fill in **Name** (required, must be unique among scenarios) and an optional description.
4. Add **Scenario parameters** if you need variables scoped to this scenario. Each parameter has an identifier (snake_case, lowercase; the form auto-converts on blur), a type (Real / Integer / Boolean / Ratio), and a default value. Ratios are clamped to `[0, 1]`; booleans are stored as `1` or `0`.
5. Set **Parameter bindings** for any net-level parameters whose default you want to override. Each binding is a TypeScript expression; leaving it empty keeps the net default (shown in the placeholder).
6. Configure **Initial state** for each place that should start with tokens.
7. Click **Create**. Save is blocked while the form has validation or LSP errors -- hover the disabled button to see why.

The view drawer (opened by clicking a row in the Scenarios list) is the same form populated with the existing values. It has **Close** and **Save** buttons.

## Initial state: per-place vs code

The Initial State section has a **Define as code** toggle.

### Per-place mode (default)

You see a row per place. Which places appear depends on the **Show all places** toggle:

- Off (default): only places whose **Default starting place** flag is on (configured in the place's properties panel). If no places are marked, the section is empty and shows a hint.
- On: every place in the net, with default-starting places listed first.

What you enter per place depends on whether it has a type:

- **Uncoloured places**: a single-line TypeScript expression that evaluates to the token count. The result is rounded down and clamped to `>= 0`. You can reference `parameters.<variable_name>` and `scenario.<identifier>`. Empty/missing means zero tokens.
- **Coloured places**: a small spreadsheet, one row per token, one column per element of the place's type. Cell values are literal values matching each column's type — numbers for Real/Integer, true/false for Boolean, free text for String, and identifiers for UUID; expressions are not supported in the spreadsheet. UUID columns accept any text: a UUID string is used as-is, and any other text (e.g. `order-1`) is converted deterministically to a UUID, so the same text always produces the same identifier. If you later edit the type itself, existing rows follow along: added elements get a default column, removed elements' columns are dropped, reordered elements keep their values, and changing an element's type converts each stored value (falling back to the new type's default when a value can't be converted).

### Code mode (Define as code)

You write a single function body (no `function` keyword, no `export default`) that returns an object keyed by **place name**:

```ts
return {
  RawMaterial: scenario.raw_material,
  AvailableMachines: Array.from({ length: scenario.machines_count }, () => ({
    machine_damage_ratio: scenario.initial_machine_damage,
  })),
};
```

`parameters` (net-level) and `scenario` (this scenario's parameters) are in scope. For each returned key:

- An **uncoloured** place takes a number (rounded, clamped to `>= 0`).
- A **coloured** place takes an array of token objects, with one property per type element.

> Place keys are **names** in code mode, but **IDs** in per-place mode. This asymmetry is by design.
> Unknown place names in code mode are **silently ignored** -- there is no warning if you typo a name.

The TypeScript editor type-checks against the current net's place names and types as you write, so unrecognised names show up as compile errors before save.

## Parameter bindings

Each net-level parameter gets one row. The placeholder shows that parameter's default. A bound expression replaces the default whenever this scenario is active.

Common patterns:

- Hard-coded override: `1.5`
- Derived from a scenario parameter: `scenario.peak_demand * 1.2`
- Combination of both: `parameters.base_rate * scenario.surge_multiplier`

Bindings are evaluated once at the start of each run, before the initial state is computed, so you can safely reference parameter values from inside initial-state expressions or code.

## Running a scenario

In **Edit** mode, open **Simulation Settings** (bottom panel). The **Scenario** dropdown lists "No scenario" plus every saved scenario. While a scenario is selected:

- The **Parameters** section in Simulation Settings shows the **scenario parameters** (with the scenario's defaults pre-filled). Adjust them per run; net-level parameter values are not editable here, since they are fixed by the scenario's bindings.
- The Properties panel **State** sub-view for each place becomes read-only ("Defined by scenario").
- Pressing **Play** runs the simulation with the scenario's overrides and initial state.

Selecting a different scenario resets the scenario-parameter inputs to that scenario's defaults. The picker is locked while a simulation is running or paused; reset the simulation to switch.

Quick-action buttons next to the dropdown let you edit the selected scenario, create a new one, or jump to the Scenarios management view.

## Pre-bundled scenarios in the example nets

Several of the built-in examples ship with scenarios so you can see realistic configurations. See [Examples](examples.md) for the full list; highlights:

- **SIR Epidemic Model** -- "Seasonal Flu" and "High Virulence Outbreak", driven by `population` and `infected_ratio` scenario parameters plus parameter overrides for infection and recovery rates.
- **Production Machines** -- "Default Production", driven by `raw_material`, `machines_count`, and `initial_machine_damage`.
- **Probabilistic Satellites Launcher** -- four orbit scenarios (Moon, Earth, Mars, Solar).

Loading any of these examples is the fastest way to see a working scenario authored in both modes.
