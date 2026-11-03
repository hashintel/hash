import { TYPE_POLICIES } from "./simulation/engine/type-policies";

import type { Color } from "./types/sdcpn";

const defaultTokenAttributeSource = (
  element: Color["elements"][number],
): string => TYPE_POLICIES[element.type].defaultValueSource;

export function generateDefaultVisualizerCode(type: Color): string {
  return `// This function defines how to visualize the tokens in the place of type "${
    type.name
  }".
// \`tokens\` and \`parameters\` hold the model state. \`width\` and \`height\` track the window.
const columns = Math.max(1, Math.floor(width / 40));
return <Visualizer.Svg>
  {tokens.map((_token, index) => (
    // Example: simple circle for each token
    <circle key={index} cx={20 + (index % columns) * 40} cy={20 + Math.floor(index / columns) * 40} r={14} fill="#2563eb" />
  ))}
</Visualizer.Svg>;`;
}

export const DEFAULT_VISUALIZER_CODE = `// This function defines how to visualize the tokens in the place.
// \`tokens\` and \`parameters\` hold the model state. \`width\` and \`height\` track the window.
return <Visualizer.Svg origin="center">
  <circle r={Math.min(width, height) * 0.4} stroke="black" strokeWidth="3" fill="red" />
</Visualizer.Svg>;`;

/** `a`, `b`, … `z`, then `t26`, `t27`, … for the tokens of a coupled equation. */
const tokenParameterName = (position: number): string =>
  position < 26 ? String.fromCharCode(97 + position) : `t${position}`;

/**
 * The starting code of a differential equation over `type`: the whole-place
 * form without `arity`, otherwise a body over a tuple of `arity` tokens that
 * returns one derivative record (arity 1) or one per token.
 */
export function generateDefaultDifferentialEquationCode(
  type: Color,
  arity?: number,
): string {
  const realElements = type.elements.filter(
    (element) => element.type === "real",
  );
  const derivativeSource = (indent: string): string =>
    realElements.length > 0
      ? `{
${indent}  ${realElements.map((el) => `${el.name}: 1`).join(`,\n${indent}  `)}
${indent}}`
      : `{}`;
  const derivativeNote =
    realElements.length > 0
      ? "// Example: all real-valued derivatives = 1"
      : "// This type has no real-valued attributes; discrete values are unchanged by dynamics";
  const elementNames = type.elements.map((el) => el.name).join(", ");

  if (arity === undefined) {
    return `// This code defines the differential equation for the place of type "${
      type.name
    }".
// \`tokens\` holds the current tokens in this place, and \`parameters\` any
// global parameters defined.
// Return derivatives for real-valued token attributes in this place.
return tokens.map(({ ${elementNames} }) => {
  // ...Do some computation with input token here if needed

  return ${derivativeSource("  ")}; ${derivativeNote}
});`;
  }

  if (arity === 1) {
    return `// This code defines the differential equation for one token of type "${
      type.name
    }".
// \`tokens\` is a tuple holding that token, and \`parameters\` any global
// parameters defined. It runs once per token in the place.
// Return the derivatives of the token's real-valued attributes.
const [token] = tokens;
const { ${elementNames} } = token;

return ${derivativeSource("")}; ${derivativeNote}`;
  }

  const names = Array.from({ length: arity }, (_, position) =>
    tokenParameterName(position),
  );
  return `// This code couples every combination of ${arity} tokens of type "${
    type.name
  }".
// \`tokens\` is a tuple of the ${arity} tokens, in the place's order, and
// \`parameters\` any global parameters defined. It runs once per combination
// and its contributions are summed into each token's derivative.
// Return one derivative record per token, in the same order.
const [${names.join(", ")}] = tokens;

return [
${names
  .map((name) => `  ${derivativeSource("  ")}, // derivatives of \`${name}\``)
  .join("\n")}
];`;
}

export const DEFAULT_DIFFERENTIAL_EQUATION_CODE = `// This code defines the differential equation for the place.
// \`tokens\` holds the current tokens in this place, and \`parameters\` any
// global parameters defined.
// Return derivatives for real-valued token attributes in this place.
return tokens.map(({ x, y }) => {
  return { x: 1, y: 1 }; // dx/dt = 1, dy/dt = 1
});`;

export const generateDefaultLambdaCode = (
  lambdaType: "predicate" | "stochastic",
): string => `/**
* This code controls when the transition will fire,
* once enabled by sufficient tokens in its input places.
* \`input\` holds each input place keyed by place name, and
* \`parameters\` any global parameters defined.
*/

// input is an object which looks like:
//   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }
// where 'x' and 'y' are examples of dimensions (properties)
// of the token's type. input.PlaceA.count is how many tokens
// PlaceA holds, for typed and untyped places alike.

// When defining a predicate check,
// return a boolean (true = enabled, false = disabled).
//
// When defining a stochastic firing rate, return a number:
//  1. 0 means disabled
//  2. Infinity means always enabled
//  3. Any other number is the average rate per second

${
  lambdaType === "predicate"
    ? "return true; // Always enabled"
    : "return 1.0; // Average firing rate of once per second"
}`;

export function generateDefaultTransitionKernelCode(
  _inputs: { placeName: string; type: Color; weight: number }[],
  outputs: { placeName: string; type: Color; weight: number }[],
): string {
  return `/**
* This code defines the kernel for the transition.
* \`input\` holds each input place keyed by place name, and
* \`parameters\` any global parameters defined.
* Return tokens for output places keyed by place name.
*/

// input is an object which looks like:
//   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }
// where 'x' and 'y' are examples of dimensions (properties)
// of the token's type. input.PlaceA.count is how many tokens
// PlaceA holds, for typed and untyped places alike.

// Return an object with output place names as keys
return {
  ${outputs
    .map(
      (arc) => `${arc.placeName}: [
    ${Array.from({ length: arc.weight })
      .map(
        () =>
          `{ ${arc.type.elements
            .map((el) => `${el.name}: ${defaultTokenAttributeSource(el)}`)
            .join(", ")} }`,
      )
      .join(",\n    ")}
  ],`,
    )
    .join("\n  ")}
};`;
}

export const DEFAULT_TRANSITION_KERNEL_CODE = `/**
* This code defines the kernel for the transition.
* \`input\` holds each input place keyed by place name, and
* \`parameters\` any global parameters defined.
* Return tokens for output places keyed by place name.
*/

// Return an object with output place names as keys
return {
  // Example: tokens for output place named "OutputPlace"
  OutputPlace: [
    { x: 0, y: 0 } // Each token is an object with named dimensions
  ],
  // If there are more output places, add them here
};`;
