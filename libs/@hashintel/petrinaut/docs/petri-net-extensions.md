# Petri Net Extensions

Petrinaut extends basic Petri nets with typed tokens, continuous dynamics, stochastic firing, and more. This page covers each extension.

Some embedded Petrinaut documents can disable one or more extensions. When an extension is unavailable for the current document, its sidebar sections and property editors are hidden or disabled, diagnostics for its code surfaces are skipped, and saved extension data is ignored by simulation.

## Typed vs untyped places

By default, places hold **untyped tokens** -- they only track a count. Tokens are indistinguishable from each other. This is sufficient for simple flow models.

To give tokens structure, assign a **type** to a place. Each token then carries named dimensions (e.g. `x`, `y`, `velocity`), enabling dynamics, visualization, and data-dependent transition logic.

Each dimension has one of five value types, chosen with the dropdown next to the dimension's name:

- **Real** -- a continuous number. This is the only kind of dimension that differential equations (dynamics) can update.
- **Integer** -- a whole number. Values are rounded when stored, and are exact up to ±2^53 (about 9 quadrillion); beyond that they lose precision.
- **Boolean** -- `true` or `false`.
- **UUID** -- a 128-bit identifier, useful for tracking individual entities across places. In code a UUID dimension is a `bigint`. In transition kernel outputs a UUID dimension is optional: leave it out and the engine generates a fresh UUID automatically (deterministically per simulation seed), or set it explicitly with `Uuid.generate()`, a UUID string, or an input token's UUID (to carry an identity through the transition). To derive an identifier from a number or free text such as `order-1`, wrap the value in `Uuid.from(value)`; supplying the non-UUID value directly is a type error.
- **String** -- free-form text, such as a status label or a category name. In code a String dimension is a plain JavaScript string, and strings are compared by value (`token.status === "shipped"` works as expected). Strings are stored efficiently: each distinct value is kept once per simulation run, no matter how many tokens carry it. Kernels and initial markings write String values; dynamics can read them but never change them.

Integer, Boolean, UUID, and String dimensions are **discrete**: their values only change when a transition fires (via a transition kernel), never through dynamics.

**To create a type:**

1. Open the **Token Types** tab in the left sidebar.
2. Click **+** to add a new type.
3. Give it a **name** and **display colour**.
4. Add dimensions, giving each a name and a value type.

<img width="1707" height="1058" alt="token-type" src="https://github.com/user-attachments/assets/eb88fbc9-828e-4f12-842a-968fa86b2038" />

**To assign a type to a place:** select the place, then choose the type from the **Accepted token type** dropdown in the properties panel.

Once a place has a type, its tokens are accessible in code as structured objects, with each dimension typed accordingly. For example, a type with Real dimensions `x` and `y` and a Boolean dimension `active` means each token is `{ x: number, y: number, active: boolean }`.

## Global parameters

Parameters are named values available in all user-authored code: dynamics, firing rate, kernels, and visualizers. They are accessed via the `parameters` argument. In metric code they are available ambiently as `parameters.<variable name>` (there is no `parameters` argument to declare — see the [supported code subset](#supported-code-subset) below). Note that metrics can read these **net parameters** but not scenario parameters.

**To create a parameter:**

1. Open the **Parameters** tab in the left sidebar.
2. Click **+** to add a new parameter.
3. Set a **name** (display label), **variable name** (used in code), and **default value** (can be overridden in the simulation settings).

<img width="1697" height="847" alt="parameters-SIR" src="https://github.com/user-attachments/assets/1b1df756-1fac-4201-8262-187473f2aeb6" />

Override parameter values before running a simulation in the **Simulation Settings** panel (see [Simulation](simulation.md#simulation-settings)). This lets you experiment with different values without editing code.

**Example:** the [SIR Epidemic Model](examples.md#sir-epidemic-model) defines `infection_rate` and `recovery_rate` as parameters, used in its transition lambdas.

## Differential equations (dynamics)

Differential equations define how token data evolves continuously over time. They are integrated at each simulation step using the Euler method.

**Setup:**

1. Create a differential equation in the **Differential Equations** tab (left sidebar).
2. Give it a name and associate it with a **type** (the equation applies to tokens of that type).
3. Select a place, enable **Dynamics**, and choose an equation that matches the type assigned to the place.

**Function signature:**

```ts
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, y }) => {
    return { x: /* dx/dt */, y: /* dy/dt */ };
  });
});
```

The function receives the current token values and global parameters. It must return an array of derivative objects -- one per token, with entries for the type's **Real** dimensions only. Integer, Boolean, UUID, and String dimensions are discrete: dynamics leave them unchanged (they can be read from the input tokens, but returning a derivative for them is a type error). A type with no Real dimensions has no dynamics to run.

<img width="1707" height="1055" alt="diff-equations" src="https://github.com/user-attachments/assets/bb18dc15-e43c-4233-974a-70ff9a0c1978" />

**Example:** in [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher), the orbital dynamics equation computes gravitational acceleration to update satellite position and velocity each step.

## Visualizer

A visualizer renders a custom view of a place's tokens during simulation. It is a React component that returns JSX (SVG is recommended).

**To enable:** select a place, then toggle **Visualizer** in its properties. A code editor opens.

```tsx
export default Visualization(({ tokens, parameters }) => {
  return (
    <svg viewBox="0 0 800 600">
      {tokens.map(({ x, y }, i) => (
        <circle key={i} cx={x} cy={y} r={5} fill="red" />
      ))}
    </svg>
  );
});
```

The component receives `tokens` (array of token objects) and `parameters` (global parameter values). It renders in the properties panel. During simulation, it updates live as token state changes.

<img width="474" height="385" alt="visauliser-preview" src="https://github.com/user-attachments/assets/303f51f3-0a53-480b-9639-52c4b77aa6e0" />

Use the menu in the code editor header to **Load default template** for a starting point.

You can also toggle between the code, a preview, and both at once.

**Example:** the [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher) example includes a visualizer that renders the planet and orbiting satellites with velocity vectors. The [Supply Chain with Disruption](examples.md#supply-chain-with-disruption) and [Deployment Pipeline](examples.md#deployment-pipeline) examples add visualizers on several places at once.

## Transition kernel

The transition kernel defines how input tokens are transformed into output tokens when a transition fires.

The **Transition Results** editor is shown only when the transition has at least one coloured output place. If every output place is uncoloured, leave the kernel empty; the engine creates the right number of plain tokens from the output arc weights.

When a coloured output arc first makes a kernel available, Petrinaut inserts a starter template based on the transition's typed output places. You can replace or edit that code directly.

```ts
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    OutputPlace: [{ x: tokensByPlace.InputPlace[0].x + 1 }],
  };
});
```

`tokensByPlace` is keyed by **place name**. Each value is a tuple of token objects -- one entry per token consumed from that arc, sized to the arc weight. The return value is keyed by **output place name**, each containing an array of token objects to produce sized to the output arc weight. Output values must match each dimension's type: numbers for Real and Integer dimensions (Integer values are rounded), `true`/`false` for Boolean dimensions, plain text for String dimensions (the editor requires the field; a value that is missing at runtime falls back to the empty string), and for UUID dimensions either nothing at all (omit the field to auto-generate a fresh identifier from the simulation seed), `Uuid.generate()`, `Uuid.from(value)`, a UUID string, or a forwarded input token's UUID. Transition kernels are the only place discrete (Integer/Boolean/UUID/String) dimensions get new values.

Two important asymmetries:

- **Uncoloured input places and inhibitor arcs are not included in `tokensByPlace`**. Only typed input places appear, and only for normal (non-inhibitor) arcs.
- **Uncoloured output places do not need to appear in the return value** -- the engine generates the correct number of plain tokens automatically based on the output arc weight. Coloured output places must appear with one token object per token produced.

Tokens from **read arcs** are included in `tokensByPlace` like standard input arcs, but are not consumed when the transition fires. Tokens from inhibitor arcs are not included.

Use the menu in the code editor header to **Load default template** for a starting point.

### Distributions

Kernel output values are plain numbers, booleans, or strings. When stochasticity is enabled for the document, values for **Real** dimensions can also be `Distribution` objects for stochastic output (discrete dimensions -- Integer, Boolean, UUID, and String -- always take plain values):

- `Distribution.Gaussian(mean, standardDeviation)`
- `Distribution.Uniform(min, max)`
- `Distribution.Lognormal(mu, sigma)`

Use `.map(fn)` to transform a sampled value:

```ts
const angle = Distribution.Uniform(0, 2 * Math.PI);
return {
  Space: [
    {
      x: angle.map((a) => Math.cos(a) * 80),
      y: angle.map((a) => Math.sin(a) * 80),
    },
  ],
};
```

The underlying random sample is drawn once and shared across chained `.map()` calls, so `x` and `y` above are derived from the same angle.

If stochasticity is disabled, `Distribution` is not available in transition kernels. Use fixed output values instead.

## Firing rate / predicate

A transition can have a **firing rate** or **predicate** that controls when it fires, once structurally enabled (sufficient tokens in input places). When both modes are meaningful, choose between them in the transition properties:

The **Firing Time** editor is shown when at least one lambda mode is meaningful:

- **Stochastic rate** is available when stochasticity is enabled for the document.
- **Predicate** is available when stochasticity is enabled for the document, or when colours are enabled and the transition has at least one standard or read input arc from a coloured place.

If neither condition applies, the transition has no lambda editor. It fires whenever its structural arc conditions are satisfied.

### Predicate

The function returns a **boolean**. The transition fires immediately when it returns `true`.

```ts
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.MyPlace[0].progress >= 1.0;
});
```

Use predicates for deterministic guards based on token state.

### Stochastic rate

The function returns a **number** representing the average firing rate per second:

- `0` -- disabled (will not fire).
- Any positive number -- average rate (e.g. `2.0` means roughly twice per second).
- `Infinity` -- fires immediately when enabled.

```ts
export default Lambda((tokensByPlace, parameters) => {
  return parameters.rate;
});
```

The same `tokensByPlace` rules from the [Transition kernel](#transition-kernel) section apply: only typed input places appear, and only for normal arcs. A transition with **no input arcs** therefore sees an empty `tokensByPlace` and is always structurally enabled -- this is how you model exogenous arrivals (see [Source transitions](useful-patterns.md#source-transitions-exogenous-arrivals)).

## Inhibitor arcs

An inhibitor arc is a special input arc that **prevents** a transition from firing when the source place has tokens equal to or greater than the arc weight -- the opposite of a normal arc.

**To set:** select an input arc (place to transition) and switch its **Type** to **Inhibitor** in the properties panel. Only input arcs can be inhibitor.

**Semantics:** the transition is enabled (on this arc) when the source place has **fewer tokens than the arc weight**. With the default weight of 1, this means the place must be empty.

Inhibitor arcs **do not consume tokens** when the transition fires.

<img width="757" height="577" alt="Visual appearance of inhibitor arcs: a solid line crossed by evenly spaced perpendicular tick marks" src="https://github.com/user-attachments/assets/84bcc51a-5dbb-476f-9c01-081c77ecf06f" />

**Example:** in [Deployment Pipeline](examples.md#deployment-pipeline), inhibitor arcs from "IncidentBeingInvestigated" and "DeploymentInProgress" block new deployments while an incident is open or a deployment is already running.

## Read arcs

A read arc is a special input arc that **requires** tokens to be present and exposes those tokens to the transition lambda and kernel, but **does not consume** them when the transition fires.

**To set:** select an input arc (place to transition) and switch its **Type** to **Read** in the properties panel. Only input arcs can be read arcs.

**Semantics:** the transition is enabled (on this arc) when the source place has **at least the arc weight** in tokens. For coloured places, the lambda and transition kernel receive a tuple of tokens under `tokensByPlace.SourcePlaceName`, sized to the arc weight. If the transition fires, those read tokens remain in the source place.

Use read arcs when a transition needs to inspect shared state, permission tokens, sensor readings, or another entity's attributes without moving that token through the transition.

## Diagnostics

The **Diagnostics** tab in the bottom panel shows problems in your code (dynamics, firing rate, kernels, visualizers), grouped by entity. Click a diagnostic to select the relevant entity and see the problem in context.

Petrinaut only reports diagnostics for code surfaces that are active for the current document and graph shape. For example, a hidden firing-time editor or a transition with no coloured outputs will not produce lambda or kernel diagnostics.

Diagnostics come in two flavours:

- **Errors** (red) -- TypeScript type/syntax errors, plus code that falls outside Petrinaut's supported code subset (see below). These must be resolved before running a simulation: pressing Play with unresolved errors opens the Diagnostics tab instead of starting the simulation. The status indicator in the bottom toolbar shows a red cross while errors remain.
- **Warnings and hints** (amber indicator) -- semantic advice that does not block simulation. Examples: `Math.random()` makes runs non-reproducible (prefer `Distribution.Uniform`), a firing rate that is always 0 so the transition can never fire, a `const` binding that is never used, or one distribution feeding several output attributes (they all receive the same sampled value).

### Supported code subset

Dynamics, firing-rate, transition-kernel and metric code is compiled by Petrinaut's own compiler, which accepts a focused expression subset of TypeScript rather than arbitrary programs:

- `const` bindings (including destructuring like `const { a, b } = parameters` or `const [first] = input.Place`), a final `return`, and guard clauses (`if (condition) return value;`).
- Arithmetic, comparisons, boolean logic, ternaries, and `Math.*` functions.
- Token access (`input.Place[0].attr`, `.length`) and `Distribution.*` constructors (with `.map` transforms).
- Collection operators depend on the code surface: dynamics and statically sized transition token arrays support `.map(...)`; metric place-token arrays support `.reduce(...)` and `.concat(...)`, but not `.map(...)`.
- In metric code, place state access via `state.places.<Name>.count` and `state.places.<Name>.tokens` (a metric must `return` a number). Net parameters are available ambiently as `parameters.<variable name>` (scenario parameters are not).

Loops, `let`/`var`, object spread and arbitrary function calls are rejected with an error pointing at the offending code and suggesting the idiomatic alternative. This is what lets Petrinaut analyze your model (e.g. which parameters a rate depends on) and compile it to fast code that reads token values directly from the simulation's internal buffers — metrics included, so they stay cheap even across thousands of Monte Carlo runs. Scenario code is not affected by this subset.
