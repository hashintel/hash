import { isSafeViewValue } from "./view-elements";

export const visualizerSvgTag = "Visualizer.Svg";

export const visualizerSvgAttributes: ReadonlySet<string> = new Set([
  "backgroundColor",
  "origin",
  "navigation",
  "viewBox",
]);

export type VisualizerSvgOptions = {
  backgroundColor?: string;
  origin: "top-left" | "center";
  navigation: "none" | "pan-zoom";
  viewBox?: { x: number; y: number; width: number; height: number };
};

type OptionsResult =
  | { ok: true; options: VisualizerSvgOptions }
  | { ok: false; attribute: string; message: string };

/** Shared validation for authored literals and computed root properties. */
export const parseVisualizerSvgOptions = (
  attributes: ReadonlyMap<string, unknown>,
): OptionsResult => {
  const options: VisualizerSvgOptions = {
    origin: "top-left",
    navigation: "none",
  };
  for (const [attribute, value] of attributes) {
    if (!visualizerSvgAttributes.has(attribute)) {
      return {
        ok: false,
        attribute,
        message: `\`${attribute}\` is not a Visualizer.Svg property.`,
      };
    }
    if (typeof value !== "string") {
      return {
        ok: false,
        attribute,
        message: `\`${attribute}\` must be a string.`,
      };
    }
    switch (attribute) {
      case "origin":
        if (value !== "top-left" && value !== "center") {
          return {
            ok: false,
            attribute,
            message: 'Origin must be "top-left" or "center".',
          };
        }
        options.origin = value;
        break;
      case "navigation":
        if (value !== "none" && value !== "pan-zoom") {
          return {
            ok: false,
            attribute,
            message: 'Navigation must be "none" or "pan-zoom".',
          };
        }
        options.navigation = value;
        break;
      case "backgroundColor":
        if (!isSafeViewValue(value)) {
          return {
            ok: false,
            attribute,
            message:
              "Background color contains unsupported CSS or an external resource.",
          };
        }
        options.backgroundColor = value;
        break;
      case "viewBox": {
        const values = value
          .trim()
          .split(/[\s,]+/u)
          .map(Number);
        const [x, y, width, height] = values;
        if (
          values.length !== 4 ||
          !values.every(Number.isFinite) ||
          x === undefined ||
          y === undefined ||
          width === undefined ||
          height === undefined ||
          width <= 0 ||
          height <= 0
        ) {
          return {
            ok: false,
            attribute,
            message:
              "ViewBox must contain four finite numbers with positive width and height.",
          };
        }
        options.viewBox = { x, y, width, height };
        break;
      }
    }
  }
  if (attributes.has("origin") && attributes.has("viewBox")) {
    return {
      ok: false,
      attribute: "origin",
      message: "Use either origin or viewBox to define the coordinates.",
    };
  }
  return { ok: true, options };
};
