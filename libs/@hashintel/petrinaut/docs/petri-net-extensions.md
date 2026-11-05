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

Parameters are named values available in all user-authored code: dynamics, firing rate, kernels, metrics, scenarios, and visualizers. Read them as `parameters.<variable name>` — the `parameters` object is in scope without declaring it (see [Code surfaces and their variables](#code-surfaces-and-their-variables) below; in a visualizer it arrives as part of the component's props). Note that metrics can read these **net parameters** but not scenario parameters.

**To create a parameter:**

1. Open the **Parameters** group in the left sidebar.
2. Click **+** to add a new parameter.
3. Set a **name** (display label), **variable name** (used in code), and **default value** (can be overridden in the simulation settings). Variable names must be lower_snake_case (e.g. `infection_rate`) and must not be a reserved JavaScript property name such as `constructor`.

<img width="1697" height="847" alt="parameters-SIR" src="https://github.com/user-attachments/assets/1b1df756-1fac-4201-8262-187473f2aeb6" />

Override parameter values before running a simulation in the **Simulation Settings** panel (see [Simulation](simulation.md#simulation-settings)). This lets you experiment with different values without editing code.

**Example:** the [SIR Epidemic Model](examples.md#sir-epidemic-model) defines `infection_rate` and `recovery_rate` as parameters, used in its transition lambdas.

## Code surfaces and their variables

Kernel, firing rate/predicate, differential equation, metric, and scenario code is a plain function body ending in `return`. The variables each surface needs are in scope without declaring them:

| Code surface                                              | Variables in scope                | Must return                                             |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| [Transition kernel](#transition-kernel)                   | `input`, `parameters`             | tokens for each typed output place, keyed by place name |
| [Firing rate / predicate](#firing-rate--predicate)        | `input`, `parameters`             | `true`/`false` (predicate) or a rate (stochastic)       |
| [Differential equation](#differential-equations-dynamics) | `tokens`, `parameters`            | one derivative object per token                         |
| Metric (see [Experiments](experiments.md#metric-charts))  | `state`, `parameters`             | a finite number                                         |
| Scenario initial state (see [Scenarios](scenarios.md))    | `parameters`, `scenario`, `range` | tokens or counts, keyed by place name                   |

`input` is the tokens from the transition's typed input places, keyed by place name; `tokens` is the current tokens of the place a differential equation runs on; `state` exposes every place's tokens and counts to a metric.

Kernel, firing rate, and differential equation code written in the older module style — `export default TransitionKernel((input, parameters) => { ... })` and the `Lambda(...)` / `Dynamics(...)` equivalents — still works. The [visualizer](#visualizer) is the exception to all of the above: it stays a module, `export default Visualization(({ tokens, parameters }) => ...)`.

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

## Visualizer

A visualizer renders a custom view of a place's tokens during simulation. Write a JavaScript function body with JSX that returns one `<Visualizer.Svg>` element.

**To enable:** select a place, then turn on the **Visualizer** switch in its properties. Click the **Visualizer** header to expand its code editor.

```jsx
return (
  <Visualizer.Svg backgroundColor="#eff6ff">
    {tokens.map(({ x, y }, index) => (
      <circle key={index} cx={x * width} cy={y * height} r={5} fill="red" />
    ))}
  </Visualizer.Svg>
);
```

`tokens` (this place's token objects), `parameters` (global parameter values), `width`, and `height` are already in scope. Dimensions are the window's drawable width and height in screen pixels, independent of Canvas zoom. In the example above, token coordinates range from 0 to 1. Local constants can shadow the ambient dimensions when a drawing needs a fixed coordinate system. No function declaration or export is needed. Existing `export default Visualization(({ tokens, parameters }) => …)` wrappers remain supported; their return value must also be one `<Visualizer.Svg>`. The preview renders in a floating Canvas window and updates live as token state changes.

The code editor checks a visualizer as you type. `tokens` is typed from the place's type and `parameters` from the net's parameters, so completion and hover show the attributes and values available, and a misspelt SVG attribute, an attribute the type does not have, or a name such as `window` or `fetch` that visualizers cannot use is underlined in the editor and listed in the [Diagnostics](#diagnostics) tab under the place. Visualizer errors never block a simulation: a visualizer with errors draws nothing while the rest of the net runs.

Visualizer code is JavaScript: the types are inferred, and a type annotation or a cast is an error. Like the other code surfaces, a visualizer is compiled by Petrinaut's own compiler to a restricted subset, so it stays a pure function of its tokens, parameters, and viewport dimensions:

- `const` bindings, destructuring, ternaries, `&&` and `||`, arithmetic, comparisons, `Math.*`, template literals and string concatenation.
- `.map`, `.filter`, `.slice` and `.reduce` over tokens, `.length`, and `.toFixed` for numbers.
- SVG drawing elements such as `g`, `rect`, `circle`, `line`, `path`, `polygon`, `text`, `defs`, `marker` and gradients, with their geometry, paint and text attributes, `key`, and a `style` object of common properties. Use `<text>` and `<tspan>` for labels. Fragments are allowed inside the SVG, but cannot replace its root.

Native `<svg>` elements, including nested ones, are not supported. `Visualizer.Svg` must be the single root on every return path and cannot be nested. Imports, hooks and other function calls, event handlers such as `onClick`, images, links, `href`, and `url(...)` values other than references to this picture (`url(#marker)`) are rejected with an error at the offending code.

Point at or select a place, then hover or focus **Show state visualizer** to open its Canvas preview after 15 milliseconds. It chooses an initial position near the place. Before a run it draws the initial marking; during a run it draws the displayed simulation frame.

Move the pointer or keyboard focus away to close a temporary preview. Click the eye button to keep it open without changing its position or size. Moving or resizing a preview also keeps it open. You can keep several windows open while scrubbing the [timeline](simulation.md#timeline), until you close them or reload the page.

Clicking, dragging, resizing, or focusing a window brings it in front of other visualizers. Focusing its code editor also brings its preview forward. It stays in front until you activate another visualizer; hovering alone does not change the order.

By default, a window follows its place when you move the place, pan, or zoom. Its size stays constant on screen. Hover or focus the window to reveal its controls in the top-right corner; touch devices always show them. Use the pin button, **Fix position on screen**, to hold the window in place while navigating the Canvas. The pin turns blue when fixed. Click it again, **Follow place**, to resume following from the current position without a jump. **Close state visualizer** or Escape dismisses the window. Escape also returns keyboard focus to its place.

Drag anywhere on the picture to move it. A following window remembers its new distance from the place; dragging does not change whether it follows or stays fixed. The cursor changes from an open hand to a closed hand, and the window lifts slightly while dragging. Resize from any edge or corner with the same handles as the AI panel and User Settings. Width and height change independently; hold Alt to keep the center fixed. Focus the invisible drag area along the top or the bottom-right resize handle to use the arrow keys, with Shift for larger steps.

A window opens at 360 × 240 pixels, with limits of 180 × 120 to 800 × 600. It fits into a smaller available area when necessary.

`Visualizer.Svg` controls the SVG viewport. Its root properties are:

| Property          | Default      | Behavior                                                                                                                                                  |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundColor` | Transparent  | Colors the whole window, including space around the drawing.                                                                                              |
| `origin`          | `"top-left"` | `"center"` places coordinate `(0, 0)` at the center. Positive Y points down in both modes.                                                                |
| `viewBox`         | Automatic    | Optional `"x y width height"` bounds for an existing drawing. It fits proportionally without distorting shapes or text. Use either `viewBox` or `origin`. |
| `navigation`      | `"none"`     | `"pan-zoom"` enables scene exploration independently of the Canvas and window position.                                                                   |

Without `viewBox`, one drawing unit is one screen pixel. Use ambient `width` and `height` to make a chart fill its window as it resizes, as in the Supply Chain example. With `origin="center"`, a circle at `(0, 0)` remains centered. An explicit `viewBox` is useful for fixed drawings that should scale proportionally instead of rearranging.

Use `backgroundColor="#eff6ff"` directly on `Visualizer.Svg`; the background always fills the window and stays still during scene navigation. Remove old root `style`, `width`, `height`, `borderRadius` and `preserveAspectRatio` attributes: they are not supported on this root. Geometry attributes such as a rectangle's `width` and `height` still control its shape. SVG children keep their existing drawing attributes and painting styles.

For a scene such as Satellites, set `navigation="pan-zoom"`. Hover or focus the window to reveal the hand icon, **Pan and zoom**, at the bottom-left. Turn it on to drag the scene, scroll to zoom around the pointer, or pinch with two fingers. The invisible strip across the top still moves the window. With the scene focused, arrow keys pan, Shift takes larger steps, +/− zoom, and 0 restores the initial framing. The **Reset view** icon appears after you pan or zoom and works even with Pan and zoom turned off. It smoothly returns to the initial framing; resizing alone does not make it appear. Escape leaves Pan and zoom first; a second Escape closes the window. Both control groups fade quickly over translucent, blurred backgrounds, with a faint white shadow beneath the icons for contrast over dark scenes. Motion follows the animation setting and your system’s reduced-motion preference.

A navigable scene retains its center and zoom through simulation updates, successful code edits, and window resizing. Resizing reveals more or less of the scene. `viewBox` supplies the initial and reset framing; it does not refit the camera on each frame. Ambient `width` and `height` remain window dimensions, not camera dimensions.

While new code compiles, the previous drawing stays visible with a small loading indicator in the bottom-right corner. The window keeps its size throughout loading and compilation.

A thin line connects the preview to its place. Windows stay within the visible area, keeping clear of Canvas controls and open panels. If a place goes offscreen or the available area shrinks, its window moves or shrinks to fit, then restores its preferred layout when space returns. Position, size, and following or fixed mode last while the preview remains open in the current Canvas view.

Click **Edit visualizer code** on the preview to select its place and expand the Visualizer section to fill the Properties Panel. This section shows only code. Focusing its editor opens a temporary Canvas preview with a blue ring and slightly desaturates other previews without changing their opacity. Hovering a preview restores its full color. Leaving the editor closes this temporary preview unless you kept it open or are pointing at it. Editing preserves an open window's position mode.

Visualizer code can be edited while a simulation runs, pauses, or displays a completed run. These edits update the picture without changing or resetting the simulation. Documents opened as read-only remain read-only.

<img width="474" height="385" alt="visauliser-preview" src="https://github.com/user-attachments/assets/303f51f3-0a53-480b-9639-52c4b77aa6e0" />

Use the menu in the code editor header to **Load default template** for a starting point.

**Example:** the [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher) example includes a visualizer that renders the planet and orbiting satellites with velocity vectors. The [Supply Chain with Disruption](examples.md#supply-chain-with-disruption) and [Deployment Pipeline](examples.md#deployment-pipeline) examples add visualizers on several places at once.

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

`input` is keyed by **place name**. Each value is a tuple of token objects -- one entry per token consumed from that arc, sized to the arc weight. The return value is keyed by **output place name**, each containing an array of token objects to produce sized to the output arc weight. Output values must match each dimension's type: numbers for Real and Integer dimensions (Integer values are rounded), `true`/`false` for Boolean dimensions, plain text for String dimensions (the editor requires the field; a value that is missing at runtime falls back to the empty string), and for UUID dimensions either nothing at all (omit the field to auto-generate a fresh identifier from the simulation seed), `Uuid.generate()`, `Uuid.from(value)`, a UUID string, or a forwarded input token's UUID. Transition kernels are the only place discrete (Integer/Boolean/UUID/String) dimensions get new values.

Two important asymmetries:

- **Uncoloured input places and inhibitor arcs are not included in `input`**. Only typed input places appear, and only for normal (non-inhibitor) arcs.
- **Uncoloured output places do not need to appear in the return value** -- the engine generates the correct number of plain tokens automatically based on the output arc weight. Coloured output places must appear with one token object per token produced.

Tokens from **read arcs** are included in `input` like standard input arcs, but are not consumed when the transition fires. Tokens from inhibitor arcs are not included.

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

The same `input` rules from the [Transition kernel](#transition-kernel) section apply: only typed input places appear, and only for normal arcs. A transition with **no input arcs** therefore sees an empty `input` and is always structurally enabled -- this is how you model exogenous arrivals (see [Source transitions](useful-patterns.md#source-transitions-exogenous-arrivals)).

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
- Token access (`input.Place[0].attr`, `.length`) and `Distribution.*` constructors (with `.map` transforms).
- Collection operators depend on the code surface: dynamics and statically sized transition token arrays support `.map(...)`; metric place-token arrays support `.reduce(...)` and `.concat(...)`, but not `.map(...)`. On the GPU, `.reduce(...)` over one place's tokens compiles to a loop; `.concat(...)` keeps a metric on the CPU.
- In metric code, place state access via `state.places.<Name>.count` and `state.places.<Name>.tokens` (a metric must `return` a number). Net parameters are available ambiently as `parameters.<variable name>` (scenario parameters are not).

Loops, `let`/`var`, object spread and arbitrary function calls are rejected with an error pointing at the offending code and suggesting the idiomatic alternative. Visualizers add JSX elements from a fixed SVG set, template literals, `.filter`, `.slice` and `.toFixed`; see [Visualizer](#visualizer). This is what lets Petrinaut analyze your model (e.g. which parameters a rate depends on) and compile it to fast code that reads token values directly from the simulation's internal buffers — metrics included, so they stay cheap even across thousands of Monte Carlo runs. Scenario code is not affected by this subset.
