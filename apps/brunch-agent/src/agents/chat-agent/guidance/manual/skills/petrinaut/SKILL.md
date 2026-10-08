---
name: petrinaut
description: Using the Petrinaut tools and writing net code. Use before the first net change, before writing lambda, kernel, dynamics, visualizer, metric or scenario code, and when the USER asks how something in the Petrinaut UI works.
---

# Petrinaut

## Routing

When the USER asks how a Petrinaut UI workflow works, or you need to confirm a UI detail before instructing them, read `references/docs.md` for the user-guide pages `readPetrinautDoc` can return.

When you need a worked example of a complete net definition (coloured tokens, stochastic and predicate transitions, kernels with distributions, continuous dynamics, parameters, visualizer code, metrics and scenarios), read `references/examples.md`.

## Tools

Use the provided tools to directly modify the current net. The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions.
You can check the current net state at any point using the getLatestNetDefinition tool, which returns `{ title, definition, extensions }` — the user-visible net title, the complete SDCPN, and the active extension capabilities for this document. Use it before making changes that depend on existing places, transitions, arcs, scenarios, metrics, parameters, or types; consult `extensions` before authoring extension-specific content; and consult the `title` when deciding whether the net could use a more descriptive name.
You can check current TypeScript compilation diagnostics at any point using the getNetCompilationErrors tool.
You can rename the net at any point using the setNetTitle tool.

## Extensions

- Check the active `extensions` from getLatestNetDefinition before using optional SDCPN features. If an extension is disabled, do not create or rely on its data.
- Use coloured-token types when tokens need attributes and `extensions.colors` is true.
- Use parameters for values the USER may want to tune when `extensions.parameters` is true.
- When adding scenarios, prefer scenario parameters for key assumptions the USER may want to modify between runs. Reference them as scenario.identifier in parameter overrides and initial-state expressions.
- Use stochastic transition lambdas for rate-based firing when `extensions.stochasticity` is true.
- Use predicate transition lambdas for boolean firing conditions when `extensions.stochasticity` is true, or when `extensions.colors` is true and the transition has at least one standard or read input arc from a coloured place.
- Leave transition lambda code empty when neither stochasticity nor coloured standard/read inputs are available; the runtime treats the transition as always enabled once its arc weights are satisfied.
- Use transition kernels to transform or generate coloured output tokens. Use stochastic distributions in kernel outputs only when `extensions.stochasticity` is true. Leave kernel code empty when the transition has no coloured output places.
- Use differential equations only when `extensions.colors` and `extensions.dynamics` are both true, and only for places whose coloured tokens have continuous dynamics.

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
- Parameter access in any code surface: use `parameters.<variableName>` where `<variableName>` is the parameter's lower_snake_case `variableName` value (e.g. `parameters.crash_threshold`, never `parameters.crashThreshold`).

### After a code change

Validate every code-writing change. After any tool call that writes code — lambda, transition kernel, dynamics, visualizer, metric, or scenario code-mode initial state — call getNetCompilationErrors before continuing and fix any reported diagnostics before relying on the new code. Do not assume a code edit is correct just because the tool call succeeded; mutations only validate the schema, not the runtime contract.

Place names are part of the code surface: lambdas/kernels read `input.PlaceName`, metrics read `state.places.PlaceName.count`, and scenario code-mode initial state keys are place names. Renaming a place via `updatePlace` requires updating every dependent lambda, kernel, dynamics, metric, visualizer, and scenario in the same batch — otherwise you will silently break references.

## Finishing a change

- Prefer small, meaningful mutations rather than replacing unrelated content.
- Keep executable code self-contained and readable.
- Title the net. After building or substantially extending a model, check the title returned by `getLatestNetDefinition`. If it is `Untitled` or an obvious placeholder, call `setNetTitle` with a concise, descriptive title (sentence case, ideally under ~60 characters). Don't overwrite a USER-chosen title without being asked.
- Suggest place visualisations. Once the structure is agreed, proactively propose 1–2 vivid, domain-specific `visualizerCode` ideas (e.g. a queue as a stacked bar, satellites as orbit dots, infected population as a heat-dot grid, machines as a row of state-coloured rectangles, inventory as a shelf of boxes) and offer to add them. Default to compact, single-glance SVGs sized for a place node, following the place visualizer rules under Code surfaces.

Auto-layout policy. Once you've finished adding or restructuring places and transitions, call `applyAutoLayout` so the canvas isn't littered with overlapping nodes at the origin. Pass `askUserFirst: false` ONLY when the net was empty at the start of the conversation and you built it from scratch. If USER-arranged content existed beforehand — even if you only added a few nodes to it — pass `askUserFirst: true` and the USER will be shown a Yes/No prompt. If they decline, leave the layout alone and continue without retrying unless they ask.
