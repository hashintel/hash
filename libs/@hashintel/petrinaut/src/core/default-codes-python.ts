import type { Color } from "./types/sdcpn";

export function generateDefaultDifferentialEquationCodePython(
  type: Color,
): string {
  const fields = type.elements.map((el) => el.name).join(", ");
  const derivatives = type.elements
    .map((el) => `            "${el.name}": 1`)
    .join(",\n");
  return `# This function defines the differential equation for the place of type "${type.name}".
# It receives the current tokens and parameters.
# It should return the derivative of the token value in this place.
def dynamics(tokens, parameters):
    return [
        {
${derivatives}
        }  # Example: all derivatives = 1
        for token in tokens
        for ${fields} in [${type.elements.map((el) => `token["${el.name}"]`).join(", ")}]
    ]`;
}

export const DEFAULT_DIFFERENTIAL_EQUATION_CODE_PYTHON = `# This function defines the differential equation for the place.
# It receives the current tokens and parameters.
# It should return the derivative of the token value in this place.
def dynamics(tokens, parameters):
    return [
        {"x": 1, "y": 1}  # dx/dt = 1, dy/dt = 1
        for token in tokens
    ]`;

export const generateDefaultLambdaCodePython = (
  lambdaType: "predicate" | "stochastic",
): string => `# This function controls when the transition will fire,
# once enabled by sufficient tokens in its input places.
# It receives tokens from input places keyed by place name,
# and any global parameters defined.
def lambda_fn(tokens_by_place, parameters):
    # tokens_by_place is a dict like:
    #   {"PlaceA": [{"x": 0, "y": 0}], "PlaceB": [...]}
    # where "x" and "y" are examples of dimensions (properties)
    # of the token's type.

    # When defining a predicate check,
    # return a boolean (True = enabled, False = disabled).
    #
    # When defining a stochastic firing rate, return a number:
    #  1. 0 means disabled
    #  2. float("inf") means always enabled
    #  3. Any other number is the average rate per second

    ${lambdaType === "predicate" ? "return True  # Always enabled" : "return 1.0  # Average firing rate of once per second"}`;

export function generateDefaultTransitionKernelCodePython(
  _inputs: { placeName: string; type: Color; weight: number }[],
  outputs: { placeName: string; type: Color; weight: number }[],
): string {
  const outputEntries = outputs
    .map((arc) => {
      const tokens = Array.from({ length: arc.weight })
        .map(
          () =>
            `{${arc.type.elements.map((el) => `"${el.name}": 0`).join(", ")}}`,
        )
        .join(", ");
      return `        "${arc.placeName}": [${tokens}],`;
    })
    .join("\n");

  return `# This function defines the kernel for the transition.
# It receives tokens from input places,
# and any global parameters defined,
# and should return tokens for output places keyed by place name.
def transition_kernel(tokens_by_place, parameters):
    # tokens_by_place is a dict like:
    #   {"PlaceA": [{"x": 0, "y": 0}], "PlaceB": [...]}

    # Return a dict with output place names as keys
    return {
${outputEntries}
    }`;
}

export const DEFAULT_TRANSITION_KERNEL_CODE_PYTHON = `# This function defines the kernel for the transition.
# It receives tokens from input places,
# and any global parameters defined,
# and should return tokens for output places keyed by place name.
def transition_kernel(tokens_by_place, parameters):
    # Return a dict with output place names as keys
    return {
        # Example: tokens for output place named "OutputPlace"
        "OutputPlace": [
            {"x": 0, "y": 0}  # Each token is a dict with named dimensions
        ],
        # If there are more output places, add them here
    }`;
