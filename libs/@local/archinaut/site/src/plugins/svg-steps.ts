/**
 * Steps the parts of a drawing inlined on a slide. Any element whose classes
 * include a step class (see `step-classes.mjs`) is wrapped in a
 * `DiagramPart`, which shows it, draws it, runs dashes along it, focuses it
 * or sends a token along it on the steps it names. The elements beside a
 * stepped part are marked as parts too, so a focus fades them with the rest
 * of the drawing.
 */

import {
  numberAttribute,
  numbersAttribute,
  stringAttribute,
} from "./mdx-jsx.mjs";
import { stepClass } from "./step-classes.mjs";

import type { Element, ElementContent } from "hast";

/** What a part's step classes ask of it. */
export interface PartPlan {
  at: number;
  until: number | null;
  draw: number | null;
  flow: number[];
  focus: number[];
  token: number[];
}

export const classesOf = (element: Element): string[] => {
  const { className } = element.properties;
  return Array.isArray(className) ? className.map(String) : [];
};

/** What an element's classes ask of it, or null when they name no step. */
export const planOf = (classes: readonly string[]): PartPlan | null => {
  const plan: PartPlan = {
    at: 0,
    until: null,
    draw: null,
    flow: [],
    focus: [],
    token: [],
  };
  let stepped = false;
  for (const name of classes) {
    const match = stepClass.exec(name);
    if (match === null) {
      continue;
    }
    stepped = true;
    const step = Number(match[2]);
    switch (match[1]) {
      case "at":
        plan.at = Math.max(plan.at, step);
        break;
      case "until":
        plan.until = Math.min(plan.until ?? step, step);
        break;
      case "draw":
        plan.draw = Math.max(plan.draw ?? 0, step);
        break;
      case "flow":
      case "focus":
      case "token":
        plan[match[1]].push(step);
        break;
    }
  }
  return stepped ? plan : null;
};

/** Elements that draw nothing themselves, which a focus leaves alone. */
const undrawn = new Set([
  "clipPath",
  "defs",
  "desc",
  "filter",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "pattern",
  "radialGradient",
  "style",
  "symbol",
  "title",
]);

const isElement = (node: ElementContent): node is Element =>
  node.type === "element";

/** The outline of the element's first path, which a token travels. */
const firstPath = (element: Element): string | null => {
  if (element.tagName === "path" && typeof element.properties.d === "string") {
    return element.properties.d;
  }
  for (const child of element.children.filter(isElement)) {
    const found = firstPath(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
};

/**
 * When each token sets off and whether it goes on arrival, read from a
 * `data-token-timing` of `<step>:<wait>:<handed on>` entries; a token the
 * attribute does not name sets off at once and stays.
 */
const tokenTiming = (
  element: Element,
  steps: readonly number[],
): { waits: number[]; handedOn: number[] } => {
  const entries = new Map(
    String(element.properties.dataTokenTiming ?? "")
      .split(" ")
      .filter((entry) => entry !== "")
      .map((entry) => {
        const [step, wait, handedOn] = entry.split(":").map(Number);
        return [step, { wait: wait ?? 0, handedOn: handedOn ?? 0 }] as const;
      }),
  );
  return {
    waits: steps.map((step) => entries.get(step)?.wait ?? 0),
    handedOn: steps.map((step) => entries.get(step)?.handedOn ?? 0),
  };
};

const partOf = (element: Element, plan: PartPlan): ElementContent => {
  const path = plan.token.length > 0 ? firstPath(element) : null;
  const timing = tokenTiming(element, plan.token);
  if (plan.token.length > 0 && path === null) {
    throw new Error(
      `token-${plan.token[0]} needs a line to travel; put it on a connection or a path`,
    );
  }
  return {
    type: "mdxJsxFlowElement",
    name: "DiagramPart",
    attributes: [
      ...(plan.at > 0 ? [numberAttribute("at", plan.at)] : []),
      ...(plan.until === null ? [] : [numberAttribute("until", plan.until)]),
      ...(plan.draw === null ? [] : [numberAttribute("draw", plan.draw)]),
      ...(plan.flow.length > 0 ? [numbersAttribute("flow", plan.flow)] : []),
      ...(plan.focus.length > 0 ? [numbersAttribute("focus", plan.focus)] : []),
      ...(path === null
        ? []
        : [
            numbersAttribute("tokens", plan.token),
            stringAttribute("path", path),
            ...(timing.waits.some((wait) => wait > 0)
              ? [numbersAttribute("tokenWaits", timing.waits)]
              : []),
            ...(timing.handedOn.some((handedOn) => handedOn > 0)
              ? [numbersAttribute("tokensHandedOn", timing.handedOn)]
              : []),
          ]),
    ],
    children: [element],
  } as unknown as ElementContent;
};

/**
 * Wraps every stepped element under `root`, innermost first, and marks the
 * drawn elements beside each wrapped one as parts. Returns whether any
 * element was wrapped.
 */
export const wrapSteppedParts = (root: Element): boolean => {
  let wrappedAny = false;
  let wrappedHere = false;
  const children = root.children.map((child) => {
    if (!isElement(child)) {
      return child;
    }
    wrappedAny = wrapSteppedParts(child) || wrappedAny;
    const plan = planOf(classesOf(child));
    if (plan === null) {
      return child;
    }
    wrappedHere = true;
    return partOf(child, plan);
  });
  if (wrappedHere) {
    for (const child of children) {
      if (isElement(child) && !undrawn.has(child.tagName)) {
        child.properties.className = [...classesOf(child), "deck-part"];
      }
    }
  }
  root.children = children;
  return wrappedAny || wrappedHere;
};
