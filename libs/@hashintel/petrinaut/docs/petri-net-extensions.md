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

1. Open the **Token Types** group in the left sidebar.
2. Click **+** to add a new type.
3. Give it a **name** and **display colour**.
4. Add dimensions, giving each a name and a value type.

<img width="1707" height="1058" alt="token-type" src="https://github.com/user-attachments/assets/eb88fbc9-828e-4f12-842a-968fa86b2038" />

**To assign a type to a place:** select the place, then choose the type from the **Accepted token type** dropdown in the properties panel.

Once a place has a type, its tokens are accessible in code as structured objects, with each dimension typed accordingly. For example, a type with Real dimensions `x` and `y` and a Boolean dimension `active` means each token is `{ x: number, y: number, active: boolean }`.

## Global parameters

Parameters are named values available in all user-authored code: dynamics, firing rate, kernels, metrics, scenarios, and visualizers. Read them as `parameters.<variable name>` — the `parameters` object is in scope without declaring it (see [Code surfaces and their variables](#code-surfaces-and-their-variables) below). Note that metrics can read these **net parameters** but not scenario parameters.

**To create a parameter:**

1. Open the **Parameters** group in the left sidebar.
2. Click **+** to add a new parameter.
3. Set a **name** (display label), **variable name** (used in code), and **default value** (can be overridden in the simulation settings). Variable names must be lower_snake_case (e.g. `infection_rate`) and must not be a reserved JavaScript property name such as `constructor`.

<img width="1697" height="847" alt="parameters-SIR" src="https://github.com/user-attachments/assets/1b1df756-1fac-4201-8262-187473f2aeb6" />

Override parameter values before running a simulation in the **Simulation Settings** panel (see [Simulation](simulation.md#simulation-settings)). This lets you experiment with different values without editing code.

**Example:** the [SIR Epidemic Model](examples.md#sir-epidemic-model) defines `infection_rate` and `recovery_rate` as parameters, used in its transition lambdas.

## Code surfaces and their variables

Kernel, firing rate/predicate, differential equation, visualizer, metric, and scenario code is a plain function body ending in `return`. The variables each surface needs are in scope without declaring them:

| Code surface                                              | Variables in scope                        | Must return                                               |
| --------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| [Transition kernel](#transition-kernel)                   | `input`, `parameters`                     | tokens for each typed output place, keyed by place name   |
| [Firing rate / predicate](#firing-rate--predicate)        | `input`, `parameters`                     | `true`/`false` (predicate) or a rate (stochastic)         |
| [Differential equation](#differential-equations-dynamics) | `tokens`, `parameters`                    | one derivative object per token, or one per coupled token |
| [Visualizer](#visualizer)                                 | `tokens`, `parameters`, `width`, `height` | one `<Visualizer.Svg>` element                            |
| Metric (see [Experiments](experiments.md#metric-charts))  | `state`, `parameters`                     | a finite number                                           |
| Scenario initial state (see [Scenarios](scenarios.md))    | `parameters`, `scenario`, `range`         | tokens or counts, keyed by place name                     |

`input` holds one entry per input place of the transition, keyed by place name: the tokens it delivers and the place's token count (see [Reading input places](#reading-input-places)); `tokens` is the current tokens of the place a differential equation runs on; `state` exposes every place's tokens and counts to a metric.

Legacy `TransitionKernel(...)`, `Lambda(...)`, `Dynamics(...)`, and `Visualization(...)` exports still run. Deprecation hints explain how to migrate them to function bodies.

### Migrating older code

Remove the export, wrapper call, and callback declaration, keeping the callback's body. For an expression callback, add `return`:

```ts
// Before
export default Lambda(
  (input, parameters) => input.Queue[0].priority > parameters.threshold,
);

// After
return input.Queue[0].priority > parameters.threshold;
```

If the callback renamed or destructured its arguments, keep equivalent local bindings using the ambient variables before the body. For example, replace a kernel parameter `{ Queue: queue }` with `const { Queue: queue } = input;`.

For visualizers, replace the root `<svg>` and its closing tag with `<Visualizer.Svg>`. Move `style.backgroundColor` to the `backgroundColor` property, retain an explicit `viewBox` when the drawing needs fixed coordinates, and remove root `width`, `height`, `style`, `borderRadius`, and `preserveAspectRatio`. Move inherited paint or text styles such as `fill` and `fontSize` to a child `<g>`. Nested legacy SVG viewports retain their sizing and clipping; do not nest `Visualizer.Svg`.

Use function bodies and `Visualizer.Svg` for new code, including AI-generated code. Preserve the drawing’s behavior when migrating older code.

## Differential equations (dynamics)

Differential equations define how token data evolves continuously over time. They are integrated at each simulation step using the Euler method.

**Setup:**

1. Create a differential equation in the **Differential Equations** group (left sidebar).
2. Give it a name and associate it with a **type** (the equation applies to tokens of that type).
3. Select a place, enable **Dynamics**, and choose an equation that matches the type assigned to the place. Click **View equation** below the dropdown to open its definition.

**Function body:**

```ts
return tokens.map(({ x, y }) => {
  return { x: /* dx/dt */, y: /* dy/dt */ };
});
```

The code is a plain function body ending in `return`, with `tokens` (the current token values) and `parameters` (the global parameters) in scope. Older documents may wrap the same code as `export default Dynamics((tokens, parameters) => { ... })`; that form still works. It must return an array of derivative objects -- one per token, with entries for the type's **Real** dimensions only. Integer, Boolean, UUID, and String dimensions are discrete: dynamics leave them unchanged (they can be read from the input tokens, but returning a derivative for them is a type error). A type with no Real dimensions has no dynamics to run.

<img width="1707" height="1055" alt="diff-equations" src="https://github.com/user-attachments/assets/bb18dc15-e43c-4233-974a-70ff9a0c1978" />

**Example:** in [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher), the orbital dynamics equation computes gravitational acceleration to update satellite position and velocity each step.

### Equations over one or several tokens

By default an equation runs over the whole place: `tokens` is every token and the body returns one derivative object per token. The **Tokens** select in the equation's properties changes how it sees tokens:

- **Whole place** -- the form above.
- **1 token** -- the body runs once per token. `tokens` is a tuple holding that one token (`const [satellite] = tokens;`) and the body returns one derivative object.
- **2 tokens** and above -- the body runs once per combination of that many distinct tokens, taken in the place's order, and returns an array with one derivative object per token in the same order. The simulator adds every combination's contribution to each token's derivative, so a pairwise force written once pulls on both tokens of every pair. A place holding fewer tokens than the equation couples gets no contribution from it.

Switching the form replaces the starting template; code you have edited is kept for you to adapt. In the older module style the equation declares one parameter per token: `export default Dynamics((a, b, parameters) => [ ... ])`.

```ts
// A mutual attraction over every pair of tokens
const k = parameters.attraction_constant;
const [a, b] = tokens;
const dx = b.x - a.x;
return [{ vx: k * dx }, { vx: -k * dx }];
```

### Composing equations

A place can run several equations at once. The dropdown under its **Dynamics** section selects the first; the **Composed dynamics** section below lists further equations of the place's type, added with its **+** button, reordered with the arrows and removed with the trash icon. Each step, every equation's derivatives are summed before the integration step, so an orbit equation over one token and an attraction over every pair combine into one motion. Removing an equation from the net removes it from every place that composed it.

Composed and multi-token dynamics run on the CPU. The [GPU backend](experiments.md#compute-backend) refuses such a net and names the place.

**Example:** [Satellites with Attraction](examples.md#satellites-with-attraction) composes a one-token orbit equation with a two-token mutual attraction.

## Visualizer

Visualizers draw a place’s tokens before or during simulation. Enable **Visualizer** in the place’s properties, then open its code editor. Use **Load default template** to start.

### Preview and edit

- Hover or focus the place’s eye button for a temporary preview; click to keep it open. Close it with **×** or Escape.
- Drag the picture to move it; resize from an edge or corner. Hold Alt to resize from the center. Keyboard users can focus the move or resize handle and use arrow keys, with Shift for larger steps.
- Windows follow their place and keep a constant screen size when the Canvas zooms. Use **Fix position on screen** to stop following, or **Follow place** to resume. Windows stay within the viewport; a small attachment identifies their place.
- **Edit visualizer code** opens the expanded editor. Editor focus shows a highlighted preview. You can edit during simulation without restarting it; the previous drawing remains visible while code compiles.

### Drawing

Return one `<Visualizer.Svg>` from a JavaScript function body. `tokens`, `parameters`, `width`, and `height` are already in scope; dimensions are the drawable window size in pixels.

```jsx
return (
  <Visualizer.Svg backgroundColor="#eff6ff">
    {tokens.map(({ x, y }, index) => (
      <circle key={index} cx={x * width} cy={y * height} r={5} fill="red" />
    ))}
  </Visualizer.Svg>
);
```

This example expects token coordinates between 0 and 1.

| Property          | Default      | Purpose                                                                     |
| ----------------- | ------------ | --------------------------------------------------------------------------- |
| `backgroundColor` | Transparent  | Fill the whole window.                                                      |
| `origin`          | `"top-left"` | Use `"center"` to put `(0, 0)` at the center; positive Y points down.       |
| `viewBox`         | Automatic    | Fit fixed `"x y width height"` bounds proportionally. Use this or `origin`. |
| `navigation`      | `"none"`     | Use `"pan-zoom"` to navigate inside the drawing.                            |

Without `viewBox`, one drawing unit is one screen pixel. Use `width` and `height` for layouts that adapt to resizing, or `viewBox` for fixed drawings. Petrinaut controls the root SVG’s size and window styling; use drawing attributes and styles on child elements.

With `navigation="pan-zoom"`, activate the hand button to drag the scene and scroll or pinch to zoom. Drag the top strip to move the window instead. Arrow keys pan, +/− zoom, and **Reset view** or 0 restores the initial framing. Escape exits navigation. Before navigation, the drawing fits the window as it resizes. After navigation, the camera stays where you left it through simulation updates, edits, and resizing.

### Supported code

Visualizers support the [expression subset](#supported-code-subset), token collection methods (`map`, `filter`, `slice`, `reduce`), template literals, and `toFixed`. Use SVG shapes, groups, text, gradients, and definitions; use `<text>` or `<tspan>` for labels.

Types are inferred. The [code editor](code-editor.md) reports errors as you type. Imports, hooks, arbitrary function calls, scripts, HTML, event handlers, and external URLs are rejected. Visualizer errors do not stop simulation.

Attribute and style values support CSS colors, gradients, shapes, math, transforms, and local references such as `url(#marker)`. Image-loading functions, escaped external URLs, and unsupported CSS functions are rejected, including values computed from tokens or parameters. Text children are unaffected.

Older `Visualization(...)` wrappers and native `<svg>` remain supported with deprecation hints. See [Migrating older code](#migrating-older-code).

See [Satellites](examples.md#probabilistic-satellite-launcher) for a centered scene and [Supply Chain](examples.md#supply-chain-with-disruption) for responsive charts.

## Transition kernel

The transition kernel defines how input tokens are transformed into output tokens when a transition fires.

The **Transition Results** editor is shown only when the transition has at least one coloured output place. If every output place is uncoloured, leave the kernel empty; the engine creates the right number of plain tokens from the output arc weights.

When a coloured output arc first makes a kernel available, Petrinaut inserts a starter template based on the transition's typed output places. You can replace or edit that code directly.

```ts
return {
  OutputPlace: [{ x: input.InputPlace[0].x + 1 }],
};
```

The code is a plain function body ending in `return`, with `input` and `parameters` in scope. Older documents may wrap the same code as `export default TransitionKernel((input, parameters) => { ... })`; that form still works.

`input` is keyed by **place name** (see [Reading input places](#reading-input-places)). For a typed place, the value is a tuple of token objects -- one entry per token consumed from that arc, sized to the arc weight. The return value is keyed by **output place name**, each containing an array of token objects to produce sized to the output arc weight. Output values must match each dimension's type: numbers for Real and Integer dimensions (Integer values are rounded), `true`/`false` for Boolean dimensions, plain text for String dimensions (the editor requires the field; a value that is missing at runtime falls back to the empty string), and for UUID dimensions either nothing at all (omit the field to auto-generate a fresh identifier from the simulation seed), `Uuid.generate()`, `Uuid.from(value)`, a UUID string, or a forwarded input token's UUID. Transition kernels are the only place discrete (Integer/Boolean/UUID/String) dimensions get new values.

**Uncoloured output places do not need to appear in the return value** -- the engine generates the correct number of plain tokens automatically based on the output arc weight. Coloured output places must appear with one token object per token produced.

### Reading input places

Every place joined to the transition by an input arc -- standard, read or inhibitor, typed or not -- appears in `input` under its name. Output-only places do not appear.

| Input place                        | `input.Place[0]`, `input.Place[1]`, ...                     | `input.Place.count`     |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------- |
| Typed, on a standard or read arc   | the tokens the transition takes, one per unit of arc weight | the place's token count |
| Uncoloured, or on an inhibitor arc | not available                                               | the place's token count |

`input.Place.count` is how many tokens the place holds when the transition is evaluated, including the ones this firing would consume. It is the same whichever tokens the transition picks, so a rate can follow the marking. A mass-action rate, for example, multiplies a rate constant by the counts of the input places:

```ts
return parameters.beta * input.Susceptible.count * input.Infected.count;
```

Tokens from **read arcs** are delivered like standard input arcs, but are not consumed when the transition fires. Inhibitor arcs deliver no tokens, but their place's count is readable.

`input.Place.length` still works but is deprecated: it is the arc weight, a constant. The editor strikes it through; write the number instead, or read `.count` for the place's token count.

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
return input.MyPlace[0].progress >= 1.0;
```

Like kernels, lambda code is a plain function body with `input` and `parameters` in scope (the older `export default Lambda((input, parameters) => { ... })` form still works).

Use predicates for deterministic guards based on token state.

### Stochastic rate

The function returns a **number** representing the average firing rate per second:

- `0` -- disabled (will not fire).
- Any positive number -- average rate (e.g. `2.0` means roughly twice per second).
- `Infinity` -- fires immediately when enabled.

```ts
return parameters.rate;
```

The same `input` rules from the [Transition kernel](#transition-kernel) section apply (see [Reading input places](#reading-input-places)). A rate can read the token counts of its input places, which is how to write mass-action and other population-dependent rates: `parameters.gamma * input.Infected.count` fires more often the more tokens Infected holds. The rate is the transition's total rate, not a rate per token. A transition with **no input arcs** therefore sees an empty `input` and is always structurally enabled -- this is how you model exogenous arrivals (see [Source transitions](useful-patterns.md#source-transitions-exogenous-arrivals)).

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

**Semantics:** the transition is enabled (on this arc) when the source place has **at least the arc weight** in tokens. For coloured places, the lambda and transition kernel receive a tuple of tokens under `input.SourcePlaceName`, sized to the arc weight. If the transition fires, those read tokens remain in the source place.

Use read arcs when a transition needs to inspect shared state, permission tokens, sensor readings, or another entity's attributes without moving that token through the transition.

## Diagnostics

The **Diagnostics** tab in the bottom panel shows problems in your code (dynamics, firing rate, kernels, visualizers), grouped by entity. Click a diagnostic to select the relevant entity and see the problem in context.

Petrinaut only reports diagnostics for code surfaces that are active for the current document and graph shape. For example, a hidden firing-time editor or a transition with no coloured outputs will not produce lambda or kernel diagnostics.

Diagnostics come in two flavours:

- **Errors** (red) -- TypeScript type/syntax errors, plus code that falls outside Petrinaut's supported code subset (see below). These must be resolved before running a simulation: pressing Play with unresolved errors opens the Diagnostics tab instead of starting the simulation. The status indicator in the bottom toolbar shows a red cross while errors remain. Errors in a [visualizer](#visualizer) are the exception: they are listed under the place, but they never stop a run.
- **Warnings and hints** (amber indicator) -- semantic advice that does not block simulation. Examples: `Math.random()` makes runs non-reproducible (prefer `Distribution.Uniform`), a firing rate that is always 0 so the transition can never fire, a `const` binding that is never used, or one distribution feeding several output attributes (they all receive the same sampled value).

### Supported code subset

Dynamics, firing-rate, transition-kernel, metric and visualizer code is compiled by Petrinaut's own compiler, which accepts a focused expression subset rather than arbitrary programs:

- `const` bindings (including destructuring like `const { a, b } = parameters` or `const [first] = input.Place`), a final `return`, and guard clauses (`if (condition) return value;`).
- Arithmetic, comparisons, boolean logic, ternaries, and `Math.*` functions.
- Token access (`input.Place[0].attr`), input place counts (`input.Place.count`), and `Distribution.*` constructors (with `.map` transforms). `input.Place.length` is deprecated (see [Reading input places](#reading-input-places)).
- Collection operators depend on the code surface: dynamics and statically sized transition token arrays support `.map(...)`; metric place-token arrays support `.reduce(...)` and `.concat(...)`, but not `.map(...)`. On the GPU, `.reduce(...)` over one place's tokens compiles to a loop; `.concat(...)` keeps a metric on the CPU.
- In metric code, place state access via `state.places.<Name>.count` and `state.places.<Name>.tokens` (a metric must `return` a number). `state.places.<Name>.tokens.length` is deprecated: read `state.places.<Name>.count`. Net parameters are available ambiently as `parameters.<variable name>` (scenario parameters are not).

Loops, `let`/`var`, object spread and arbitrary function calls are rejected with an error pointing at the offending code and suggesting the idiomatic alternative. Visualizers add JSX elements from a fixed SVG set, template literals, `.filter`, `.slice` and `.toFixed`; see [Visualizer](#visualizer). This is what lets Petrinaut analyze your model (e.g. which parameters a rate depends on) and compile it to fast code that reads token values directly from the simulation's internal buffers — metrics included, so they stay cheap even across thousands of Monte Carlo runs. Scenario code is not affected by this subset.
