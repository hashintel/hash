import type { SDCPNType } from "./types/sdcpn";

export function generateDefaultVisualizerCode(type: SDCPNType): string {
  return `// This function defines how to visualize the tokens in the place of type "${type.name}".
// It receives the current tokens and parameters.
export default Visualization(({ tokens, parameters }) => {
  return <svg viewBox="0 0 800 600">
    {tokens.map(({ ${type.elements.map((el) => el.name).join(", ")} }, index) => (
      // Example: simple circle for each token
      <circle />
    ))}
  </svg>
});`;
}

export const DEFAULT_VISUALIZER_CODE = `// This function defines how to visualize the tokens in the place.
// It receives the current tokens and parameters.
export default Visualization(({ tokens, parameters }) => {
  // Example: simple console log visualization
  return <svg>
    <circle cx="50" cy="50" r="40" stroke="black" strokeWidth="3" fill="red" />
  </svg>
});`;

export function generateDefaultDifferentialEquationCode(
  type: SDCPNType,
): string {
  return `// This function defines the differential equation for the place of type "${type.name}".
// The function receives the current tokens in all places and the parameters.
// It should return the derivative of the token value in this place.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ ${type.elements.map((el) => el.name).join(", ")} }) => {
    // ...Do some computation with input token here if needed

    return {
      ${type.elements.map((el) => `${el.name}: 1`).join(",\n      ")}
    }; // Example: all derivatives = 1
  });
});`;
}

export const DEFAULT_DIFFERENTIAL_EQUATION_CODE = `// This function defines the differential equation for the place.
// The function receives the current tokens in all places and the parameters.
// It should return the derivative of the token value in this place.
export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, y }) => {
    return { x: 1, y: 1 }; // dx/dt = 1, dy/dt = 1
  });
});`;

export const generateDefaultLambdaCode = (
  lambdaType: "predicate" | "stochastic",
): string => `/**
* This function controls when the transition will fire,
* once enabled by sufficient tokens in its input places.
* It receives tokens from input places keyed by place name,
* and any global parameters defined.
*/
export default Lambda((tokensByPlace, parameters) => {
  // tokensByPlace is an object which looks like:
  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }
  // where 'x' and 'y' are examples of dimensions (properties)
  // of the token's type.

  // When defining a predicate check,
  // return a boolean (true = enabled, false = disabled).
  //
  // When defining a stochastic firing rate, return a number:
  //  1. 0 means disabled
  //  2. Infinity means always enabled
  //  3. Any other number is the average rate per second

  ${lambdaType === "predicate" ? "return true; // Always enabled (alternative: return Infinity;)" : "return 1.0; // Average firing rate of once per second"}
});`;

export function generateDefaultTransitionKernelCode(
  _inputs: { placeName: string; type: SDCPNType; weight: number }[],
  outputs: { placeName: string; type: SDCPNType; weight: number }[],
): string {
  return `/**
* This function defines the kernel for the transition.
* It receives tokens from input places,
* and any global parameters defined,
* and should return tokens for output places keyed by place name.
*/
export default TransitionKernel((tokensByPlace, parameters) => {
  // tokensByPlace is an object which looks like:
  //   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }
  // where 'x' and 'y' are examples of dimensions (properties)
  // of the token's type.

  // Return an object with output place names as keys
  return {
    ${outputs
      .map(
        (arc) => `${arc.placeName}: [
      ${Array.from({ length: arc.weight })
        .map(
          () =>
            `{ ${arc.type.elements.map((el) => `${el.name}: 0`).join(", ")} }`,
        )
        .join(",\n      ")}
    ],`,
      )
      .join("\n    ")}
  };
});`;
}

export const DEFAULT_TRANSITION_KERNEL_CODE = `/**
* This function defines the kernel for the transition.
* It receives tokens from input places,
* and any global parameters defined,
* and should return tokens for output places keyed by place name.
*/
export default TransitionKernel((placesTokens, parameters) => {
  // Return an object with output place names as keys
  return {
    // Example: tokens for output place named "OutputPlace"
    OutputPlace: [
      { x: 0, y: 0 } // Each token is an object with named dimensions
    ],
    // If there are more output places, add them here
  };
});`;
