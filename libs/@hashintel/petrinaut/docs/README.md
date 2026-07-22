# Petrinaut User Guide

Petrinaut is a visual editor for [Petri nets](https://en.wikipedia.org/wiki/Petri_net).

It lets you build, configure, and simulate Petri nets. It has support for various extensions including typed tokens (colours), continuous dynamics, and stochastic transitions.

## Live site

Petrinaut is available at [demo.petrinaut.org](https://demo.petrinaut.org).

Net data will be stored in local browser storage. You can also export and import nets as JSON files for transfer between devices and browsers.

## Concepts

A quick map of the things you'll encounter:

- **Net** -- the document you're editing: places, transitions, arcs, types, parameters, differential equations.
- **Scenario** -- a saved, named configuration for running the net (initial markings, scenario parameters, parameter overrides). Optional.
- **Metric** -- a built-in or user-authored function over simulation state that returns a number to plot on the Timeline.
- **Experiment** -- a Monte Carlo batch: many independent simulation runs of the current net, optionally against one scenario, aggregated as distributions over time.
- **Optimization** -- a search over a flat set of scenario parameters,
  targeting one saved or run-local custom metric.

Petrinaut has three global modes in the top bar, though **Actual** is only enabled when the host application provides a live execution source:

- **Edit** -- the drawing/configuration workspace plus single-run simulation playback.
- **Simulate** -- a separate management surface for scenarios and experiments,
  with optimizations when the host application provides an optimizer.
- **Actual** -- a read-only live-execution view supplied by a host such as Brunch.

## Contents

- [Drawing a Net](drawing-a-net.md) -- Top bar, canvas, sidebars, adding nodes and connecting arcs, selection, keyboard shortcuts, import/export, auto-layout.
- [Petri Net Extensions](petri-net-extensions.md) -- Types, dynamics, transition kernels, firing rules, read/inhibitor arcs, as well as parameters and state visualizers.
- [Useful Patterns](useful-patterns.md) -- Common modelling techniques, including duration and resource pools.
- [Simulation](simulation.md) -- Set initial state, run a single simulation, use the timeline, control playback.
- [Scenarios](scenarios.md) -- Save and switch between named simulation configurations.
- [Experiments](experiments.md) -- Run Monte Carlo batches and inspect token-count distributions over time.
- [Optimization](optimization.md) -- Search scenario parameter ranges to maximize or minimize a metric.
- [Actual Mode](actual-mode.md) -- View a host-provided live Petri net execution, currently via Brunch.
- [AI Assistant](ai-assistant.md) -- Build, review, and revise nets using natural language.
- [Visual Settings](visual-settings.md) -- Configure the editor appearance and behavior.
- [Examples](examples.md) -- Walkthrough of the built-in example nets.
