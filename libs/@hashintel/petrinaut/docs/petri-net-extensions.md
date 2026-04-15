# Petri Net Extensions

Petrinaut extends basic Petri nets with typed tokens, continuous dynamics, stochastic firing, and more. This page covers each extension.

## Typed vs untyped places

By default, places hold **untyped tokens** -- they only track a count. Tokens are indistinguishable from each other. This is sufficient for simple flow models.

To give tokens structure, assign a **type** to a place. Each token then carries named dimensions (e.g. `x`, `y`, `velocity`), enabling dynamics, visualization, and data-dependent transition logic.

**To create a type:**

1. Open the **Token Types** tab in the left sidebar.
2. Click **+** to add a new type.
3. Give it a **name** and **display colour**.

<img width="1707" height="1058" alt="token-type" src="https://github.com/user-attachments/assets/eb88fbc9-828e-4f12-842a-968fa86b2038" />

**To assign a type to a place:** select the place, then choose the type from the **Accepted token type** dropdown in the properties panel.

Once a place has a type, its tokens are accessible in code as structured objects. For example, a type with dimensions `x` and `y` means each token is `{ x: number, y: number }`.

## Global parameters

Parameters are named values available in all user-authored code: dynamics, firing rate, kernels, and visualizers. They are accessed via the `parameters` argument.

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

The function receives the current token values and global parameters. It must return an array of derivative objects -- one per token, with the same dimension names.

<img width="1707" height="1055" alt="diff-equations" src="https://github.com/user-attachments/assets/bb18dc15-e43c-4233-974a-70ff9a0c1978" />

**Example:** in [Satellites in Orbit](examples.md#satellites-in-orbit), the orbital dynamics equation computes gravitational acceleration to update satellite position and velocity each step.

## Visualizer

A visualizer renders a custom view of a place's tokens during simulation. It is a React component that returns JSX (SVG is recommended).

**To enable:** select a place, then toggle **Visualizer** in its properties. A code editor opens.

```tsx
export default Visualization(({ tokens, parameters }) => {
  return <svg viewBox="0 0 800 600">
    {tokens.map(({ x, y }, i) => (
      <circle key={i} cx={x} cy={y} r={5} fill="red" />
    ))}
  </svg>
});
```

The component receives `tokens` (array of token objects) and `parameters` (global parameter values). It renders in the properties panel. During simulation, it updates live as token state changes.

<img width="474" height="385" alt="visauliser-preview" src="https://github.com/user-attachments/assets/303f51f3-0a53-480b-9639-52c4b77aa6e0" />

Use the menu in the code editor header to **Load default template** for a starting point.

You can also toggle between the code, a preview, and both at once.

**Example:** the [Satellites in Orbit](examples.md#satellites-in-orbit) example includes a visualizer that renders Earth and orbiting satellites with velocity vectors.

## Transition kernel

The transition kernel defines how input tokens are transformed into output tokens when a transition fires.

```ts
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    OutputPlace: [{ x: tokensByPlace.InputPlace[0].x + 1 }],
  };
});
```

`tokensByPlace` is keyed by **place name**. Each value is an array of token objects from that input place. The return value is keyed by **output place name**, each containing an array of token objects to produce.

Use the menu in the code editor header to **Load default template** for a starting point.

### Distributions

Kernel output values can be numbers or `Distribution` objects for stochastic output:

- `Distribution.Gaussian(mean, standardDeviation)`
- `Distribution.Uniform(min, max)`
- `Distribution.Lognormal(mu, sigma)`

Use `.map(fn)` to transform a sampled value:

```ts
const angle = Distribution.Uniform(0, 2 * Math.PI);
return {
  Space: [{
    x: angle.map(a => Math.cos(a) * 80),
    y: angle.map(a => Math.sin(a) * 80),
  }],
};
```

The underlying random sample is drawn once and shared across chained `.map()` calls, so `x` and `y` above are derived from the same angle.

### Empty kernels

For transitions where all output places are **untyped**, the kernel code can be left empty. The engine produces the correct number of black tokens automatically.

## Firing rate / predicate

Each transition has a **firing rate** that controls when it fires, once structurally enabled (sufficient tokens in input places). Choose between two modes in the transition properties:

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

## Inhibitor arcs

An inhibitor arc is a special input arc that **prevents** a transition from firing when the source place has tokens equal to or greater than the arc weight -- the opposite of a normal arc.

**To set:** select an input arc (place to transition) and switch its **Type** to **Inhibitor** in the properties panel. Only input arcs can be inhibitor.

**Semantics:** the transition is enabled (on this arc) when the source place has **fewer tokens than the arc weight**. With the default weight of 1, this means the place must be empty.

Inhibitor arcs **do not consume tokens** when the transition fires.

<img width="479" height="401" alt="inhibitor-arc-deployment" src="https://github.com/user-attachments/assets/86e6995a-b7d3-4727-9d7f-2c0e0a63816c" />

**Example:** in [Deployment Pipeline](examples.md#deployment-pipeline), inhibitor arcs from "IncidentBeingInvestigated" and "DeploymentInProgress" block new deployments while an incident is open or a deployment is already running.

## Diagnostics

The **Diagnostics** tab in the bottom panel shows TypeScript errors in your code (dynamics, firing rate, kernels, visualizers), grouped by entity. Click a diagnostic to select the relevant entity and see the error in context.

Diagnostics must be resolved before running a simulation -- pressing Play with unresolved errors opens the Diagnostics tab instead of starting the simulation.
