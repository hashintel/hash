import { TYPE_POLICIES } from "../tokens/type-policies";

import type { Color } from "../types/sdcpn";

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

/** `places.Name`, or `places["A name"]` for a name that is no identifier. */
const placeStateSource = (placeName: string): string =>
  /^[A-Za-z_$][\w$]*$/u.test(placeName)
    ? `places.${placeName}`
    : `places[${JSON.stringify(placeName)}]`;

/**
 * The starting code of a net's visualizer: one bar per place of the net,
 * as long as the place's share of the fullest place's tokens.
 */
export function generateDefaultNetVisualizerCode(
  placeNames: readonly string[],
): string {
  const header = `// This function draws the state of the whole net.
// \`places\` holds every place by name, each with its \`count\` and its \`tokens\`.
// \`parameters\` holds the net's parameters. \`width\` and \`height\` track the viewport.`;
  // A place is read by its name, so the names are written out: one row each.
  const names = [...new Set(placeNames)];
  if (names.length === 0) {
    return `${header}
return <Visualizer.Svg>
  <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
    No places yet
  </text>
</Visualizer.Svg>;`;
  }
  const counts = names.map((name) => `${placeStateSource(name)}.count`);
  return `${header}
const rows = [
${names
  .map(
    (name, index) =>
      `  { name: ${JSON.stringify(name)}, count: ${counts[index]} },`,
  )
  .join("\n")}
];
const most = Math.max(1, ${counts.join(", ")});
const rowHeight = Math.min(22, (height - 8) / rows.length);
return <Visualizer.Svg>
  {rows.map((row, index) => (
    <g key={row.name} transform={\`translate(8 \${4 + index * rowHeight})\`}>
      <rect width={((width - 16) * row.count) / most} height={rowHeight - 4} rx="3" fill="#bfdbfe" />
      <text x="6" y={rowHeight / 2 - 2} dominantBaseline="middle" fontSize="11" fill="#1e3a8a">
        {row.name}: {row.count}
      </text>
    </g>
  ))}
</Visualizer.Svg>;`;
}

/** `a`, `b`, … `z`, then `t26`, `t27`, … for the tokens of a coupled equation. */
const tokenParameterName = (position: number): string =>
  position < 26 ? String.fromCharCode(97 + position) : `t${position}`;

/**
 * The starting code of a differential equation over `type`: a body over
 * `token` that returns its derivative record (arity 1), or a body over the
 * `tokens` tuple that returns one record per token.
 */
export function generateDefaultDifferentialEquationCode(
  type: Color,
  arity: number,
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

  if (arity === 1) {
    return `// This code defines the differential equation for one token of type "${
      type.name
    }".
// \`token\` is that token, and \`parameters\` any global parameters
// defined. It runs once per token in the place.
// Return the derivatives of the token's real-valued attributes.
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

export const DEFAULT_DIFFERENTIAL_EQUATION_CODE = `// This code defines the differential equation for one token in the place.
// \`token\` is that token, and \`parameters\` any global parameters
// defined. It runs once per token in the place.
// Return the derivatives of the token's real-valued attributes.
const { x, y } = token;

return { x: 1, y: 1 }; // dx/dt = 1, dy/dt = 1`;

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
