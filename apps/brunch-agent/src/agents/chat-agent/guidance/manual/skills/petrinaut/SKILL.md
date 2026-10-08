---
name: petrinaut
description: Using the Petrinaut tools and writing net code. Use before the first net change, before writing lambda, kernel, dynamics, visualizer, metric or scenario code, before drafting or creating an experiment, and when the USER asks how something in the Petrinaut UI works.
---

# Petrinaut

## Routing

When the USER asks how a Petrinaut UI workflow works, or you need to confirm a UI detail before instructing them, read `references/docs.md` for the user-guide pages `readPetrinautDoc` can return.

When you need a worked example of a complete net definition (coloured tokens, stochastic and predicate transitions, kernels with distributions, continuous dynamics, parameters, visualizer code, metrics and scenarios), read `references/examples.md`.

Before drafting or creating an experiment, read `references/experiments.md` for the request's fields and limits and what the draft and run tools do.

## Tools

Make every net change through the mounted tools; never emit free-form net JSON. They use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions. The mounted schemas, not this prose, govern exact payload fields.

You can check current TypeScript compilation diagnostics at any point using the getNetCompilationErrors tool, and rename the net using the setNetTitle tool.

### Reading the net

Three tools read the current net, each returning `{ title, definition, extensions }`: the user-visible net title, the SDCPN, and the active extension capabilities for this document.

- `readNetOutline` leaves out code bodies, canvas positions and visual settings.
- `readNetStructure` adds lambda, kernel, equation, scenario and metric code.
- `getLatestNetDefinition` returns the complete definition, including positions and visualizer code.

A change is refused unless a current read of the net is in context, so read it before the first change, and again when the USER may have edited the net since. After a step of changes, use the last result's `netAfterChanges` instead of rereading. Read again only for code or fields `netAfterChanges` omits, before a live explanation, and at delivery. Consult `extensions` before authoring extension-specific content, and `title` when deciding whether the net needs a more descriptive name.

### Making changes

Send one bounded connected fragment in one step, as parallel mutation calls in dependency order: the types, parameters and differential equations it needs; then places and transitions; then arcs. The host runs a step's calls in that order. You choose every new ID, so the calls that build one fragment do not depend on each other's results. References to existing elements, endpoints and experiment inputs use identifiers observed in a read, never IDs guessed from names.

The host owns immutable binding, protocol correlation, document-base checks, persistence and record attachment. Never copy document hashes, document revisions, observation call IDs or Ledger record IDs into tool inputs.

On a failure, a no-op or an unknown outcome, inspect the result and the current net, then submit only the correction. Never repeat a change that succeeded or may have.

### Keep incidental choices small

Required `x` and `y` are provisional presentation values: place new nodes on a rough grid, then use layout. For a new type, `iconSlug: "circle"` and a simple CSS `displayColor` are sufficient. Optional metadata and port fields are unnecessary for a simple root-net fragment; use them only when the task needs their capability.

For separately wired transitions, start with empty `inputArcs` and `outputArcs`, then use `addArc` operations. Uncoloured places use `colorId: null`; disabled dynamics use `dynamicsEnabled: false` and `differentialEquationId: null`. Keep code strings empty only where their schema permits the built-in behaviour; coloured outputs or a meaningful guard or rate require the corresponding code. Arc weights are token multiplicities, never branch probabilities.

### Acceptance

An accepted call establishes conformance to its input schema, and nothing more. After each step check that:

- every intended call was accepted, or its rejection remains explicitly unresolved;
- `netAfterChanges` contains each accepted element under the ID you supplied or the tool returned;
- every referenced endpoint exists;
- arc weights are positive;
- no later step depends on a rejected or absent change.

Describe this result as tool-schema accepted, not valid, runnable or simulated.

## Extensions

- Check the active `extensions` from your latest read before using optional SDCPN features. If an extension is disabled, do not create or rely on its data.
- Coloured-token types require `extensions.colors`.
- Parameters require `extensions.parameters`.
- Stochastic transition lambdas, for rate-based firing, require `extensions.stochasticity`.
- Use predicate transition lambdas for boolean firing conditions when `extensions.stochasticity` is true, or when `extensions.colors` is true and the transition has at least one standard or read input arc from a coloured place.
- Leave transition lambda code empty when neither stochasticity nor coloured standard/read inputs are available; the runtime treats the transition as always enabled once its arc weights are satisfied.
- Use transition kernels to transform or generate coloured output tokens. Use stochastic distributions in kernel outputs only when `extensions.stochasticity` is true. Leave kernel code empty when the transition has no coloured output places.
- Differential equations require both `extensions.colors` and `extensions.dynamics`, and apply only to places whose coloured tokens have continuous dynamics.

## Writing net code

Lambda, kernel, and dynamics code is a plain function body ending in `return` — no module, no `export default`, no wrapper — with the input object and `parameters` available ambiently. (The legacy `export default Lambda((input, parameters) => …)` / `TransitionKernel(…)` / `Dynamics(…)` module form is still accepted, but write new code as a bare body.)

### Code surfaces

The exact shapes the runtime expects:

- Transition lambda (`transition.lambdaCode`): function body returning the firing condition; `input` and `parameters` are ambient. Available when stochasticity is enabled OR when colours are enabled and the transition has at least one standard or read input arc from a coloured place. `input.PlaceName` is a tuple sized to the input arc weight for coloured standard and read input arcs; token attributes are typed by the colour element: real/integer → number, boolean → boolean, uuid → bigint, string → string (plain JS strings everywhere, compared by value). Read arcs expose tokens in `input` but do not consume them when the transition fires. Inhibitor arcs and uncoloured input places are NOT in `input`. Predicate → return a boolean; stochastic → return a non-negative rate in firings per simulation second (0 disables, Infinity always fires). Must be deterministic. If unavailable or empty, the runtime uses true for predicate-style transitions and Infinity for stochastic-style transitions. Example: `return input.Queue[0].priority > parameters.threshold;`.
- Transition kernel (`transition.transitionKernelCode`): function body returning `{ OutputPlaceName: [token, …] }` sized to the output arc weight; `input` and `parameters` are ambient. Available only for transitions with coloured output places. Include only coloured output places; uncoloured output places are auto-populated. Output values must match element types: real/integer use numbers, boolean uses booleans, string uses plain strings (REQUIRED in the token type; a missing/undefined value becomes the empty string `""`, and non-string values are stringified via `String(value)`). uuid attributes are OPTIONAL in output tokens: omit them to auto-generate a fresh UUID deterministically from the seeded simulation RNG, use `Uuid.generate()` for an explicit fresh UUID, `Uuid.from(value)` to derive one from a number or arbitrary string, use a UUID string directly, or forward an input token's uuid bigint unchanged. Plain non-UUID values must be wrapped in `Uuid.from(...)`; supplying them directly is a type error. When stochasticity is enabled, real attributes may use `Distribution.Gaussian(mean, sd)` / `Distribution.Uniform(min, max)` / `Distribution.Lognormal(mu, sigma)` (never integer/boolean/uuid/string attributes), and chained `.map(fn)` on the same distribution shares one draw. When stochasticity is disabled, kernel outputs must use plain values only. Leave empty when no coloured outputs exist. Example: `return { Processed: [{ id: input.Queue[0].id, done: true }] };`.
- Differential equation (`differentialEquation.code`): function body returning the derivatives array; `tokens` and `parameters` are ambient. `tokens` is THIS place's tokens only. Return an array of the same length whose entries provide derivatives for real-valued elements only (i.e. dx/dt, not the new value); integer, boolean, uuid, and string elements are discrete and remain unchanged by dynamics (they can be read from input tokens but never written). The equation's `colorId` MUST match every referencing place's `colorId`. Example: `return tokens.map(({ level }) => ({ level: -level * parameters.decay_rate }));`.
- Place visualizer (`place.visualizerCode`): `export default Visualization(({ tokens, parameters }) => <JSX/>)`. Classic React runtime — do NOT import React, do NOT use `<>…</>` fragments, do NOT use hooks. Convention: return a sized `<svg viewBox="0 0 W H">…</svg>`.
- Metric (`metric.code`): a plain function body — NOT a module, no `export default`, no wrapper. `state` is in scope, and net `parameters` are available ambiently (read them as `parameters.<variableName>`). Must `return` a finite number. Example: `return state.places.Infected.count / (state.places.Susceptible.count + state.places.Infected.count + state.places.Recovered.count);`. `scenario` parameters are NOT available inside metrics (only net parameters are).
- Scenario per_place initial state: `content` keys are place IDs; uncoloured values are expressions with `parameters` and `scenario` in scope; coloured values are row arrays in colour element order using numbers and booleans; string columns take literal text; uuid columns accept UUID strings (any other text converts deterministically to a UUID via UUIDv5).
- Scenario code-mode initial state: function body returning `{ PlaceName: tokens }` keyed by NAME (asymmetric with per_place IDs); unknown names are silently dropped.
- Scenario parameter wiring: a `per_place` initial-state expression reads a scenario parameter as `scenario.<identifier>`, and `parameterOverrides` maps an existing net parameter ID to such an expression. A value that transition code reads through `parameters.<variableName>` therefore needs both the net parameter and the override. Metrics cannot read scenario parameters.
- Parameter access in any code surface: use `parameters.<variableName>` where `<variableName>` is the parameter's lower_snake_case `variableName` value (e.g. `parameters.crash_threshold`, never `parameters.crashThreshold`).

### After a code change

Validate every code-writing change. After the step that writes code — lambda, transition kernel, dynamics, visualizer, metric, or scenario code-mode initial state — call getNetCompilationErrors once for the whole step, and send every repair it calls for in one further step before relying on the new code. Mutations validate only the schema, not the runtime contract. Saved scenario and metric code is compiled separately, when an experiment is created, so a clean diagnostic does not prove it.

Place names are part of the code surface: lambdas/kernels read `input.PlaceName`, metrics read `state.places.PlaceName.count`, and scenario code-mode initial state keys are place names. Renaming a place via `updatePlace` requires updating every dependent lambda, kernel, dynamics, metric, visualizer, and scenario in the same batch — otherwise you will silently break references.

## Finishing a change

- Keep executable code self-contained and readable.
- Title the net. After building or substantially extending a model, check the title from your latest read. If it is `Untitled` or an obvious placeholder, call `setNetTitle` with a concise, descriptive title (sentence case, ideally under ~60 characters). Don't overwrite a USER-chosen title without being asked.
- Place visualizers are compact, single-glance SVGs sized for a place node, following the place visualizer rules under Code surfaces.

Auto-layout policy. Once you've finished adding or restructuring places and transitions, call `applyAutoLayout` so the canvas isn't littered with overlapping nodes at the origin. Pass `askUserFirst: false` ONLY when the net was empty at the start of the conversation and you built it from scratch. If USER-arranged content existed beforehand — even if you only added a few nodes to it — pass `askUserFirst: true` and the USER will be shown a Yes/No prompt. If they decline, leave the layout alone and continue without retrying unless they ask.
