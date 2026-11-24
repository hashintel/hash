/**
 * Readies a rendered d2 drawing for stepping. d2 draws every shape and
 * connection as a group whose first class is its id in base64, `website` or
 * `(website -> core)[0]`, followed by the d2 classes the source gave it.
 * Here each part learns the steps of what it hangs on: a connection waits
 * for both its ends and a shape for its container, so marking a shape
 * brings its connections with it, and tokens moving on one step travel one
 * after another along a chain. `svg-steps.ts` then wraps the parts.
 */

import { classesOf, planOf } from "./svg-steps.ts";

import type { Element, ElementContent } from "hast";

/** When a part is first and last shown: its own steps and those of what it hangs on. */
export interface PartSteps {
  at: number;
  until: number | null;
}

/** A connection's id: the container it is declared in, if any, its two ends, and its index between them. */
const connection = /^(?:(.+?)\.)?\((.+?) (?:->|<-|<->|--) (.+)\)\[\d+\]$/u;

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** The d2 id a part's first class encodes, with the markup escapes d2 wrote into it undone. */
export const partIdOf = (token: string): string | null =>
  /^[A-Za-z0-9+/]+=*$/u.test(token) && token.length % 4 === 0
    ? Buffer.from(token, "base64")
        .toString("utf8")
        .replace(
          /&(?:amp|lt|gt|quot|#39);/gu,
          (entity) => entities[entity] ?? entity,
        )
    : null;

const ownSteps = (classes: readonly string[]): PartSteps => {
  const plan = planOf(classes);
  return plan === null
    ? { at: 0, until: null }
    : { at: Math.max(plan.at, plan.draw ?? 0), until: plan.until };
};

/** A part is shown only while everything it hangs on is. */
const within = (own: PartSteps, others: readonly PartSteps[]): PartSteps =>
  others.reduce<PartSteps>(
    (steps, other) => ({
      at: Math.max(steps.at, other.at),
      until:
        other.until === null
          ? steps.until
          : Math.min(steps.until ?? other.until, other.until),
    }),
    own,
  );

/** Every part's steps, from its own classes and those of what it hangs on. */
export const partSteps = (
  parts: ReadonlyMap<string, readonly string[]>,
): Map<string, PartSteps> => {
  const resolved = new Map<string, PartSteps>();
  const resolve = (id: string): PartSteps => {
    const known = resolved.get(id);
    if (known !== undefined) {
      return known;
    }
    const edge = connection.exec(id);
    const scoped = (end: string): string =>
      edge?.[1] === undefined ? end : `${edge[1]}.${end}`;
    const dot = id.lastIndexOf(".");
    const hangsOn =
      edge === null
        ? dot === -1
          ? []
          : [id.slice(0, dot)]
        : [scoped(edge[2] ?? ""), scoped(edge[3] ?? "")];
    const steps = within(ownSteps(parts.get(id) ?? []), hangsOn.map(resolve));
    resolved.set(id, steps);
    return steps;
  };
  for (const id of parts.keys()) {
    resolve(id);
  }
  return resolved;
};

const isElement = (node: ElementContent): node is Element =>
  node.type === "element";

/** Every `marker` inside an element, taken out of it. */
const takeMarkers = (element: Element): Element[] => {
  const markers = element.children.filter(
    (child): child is Element => isElement(child) && child.tagName === "marker",
  );
  element.children = element.children.filter(
    (child) => !markers.includes(child as Element),
  );
  return [
    ...markers,
    ...element.children.filter(isElement).flatMap(takeMarkers),
  ];
};

/**
 * Orders the tokens of one step along the drawing, as a Petri net fires: a
 * token leaving a node waits for each token that, earlier in the source,
 * arrives at that node on the same step, and a token handed on like that
 * goes when it arrives. Each connection's timing is written as
 * `data-token-timing`, `<step>:<wait>:<handed on>` per step, which
 * `svg-steps.ts` passes to its part.
 */
const chainTokens = (
  parts: ReadonlyMap<Element, { id: string; classes: string[] }>,
): void => {
  const legs = [...parts].flatMap(([element, { id, classes }]) => {
    const edge = connection.exec(id);
    const steps = planOf(classes)?.token ?? [];
    if (edge === null || steps.length === 0) {
      return [];
    }
    const scoped = (end: string): string =>
      edge[1] === undefined ? end : `${edge[1]}.${end}`;
    return [
      {
        element,
        from: scoped(edge[2] ?? ""),
        to: scoped(edge[3] ?? ""),
        steps,
      },
    ];
  });
  const timing = new Map<Element, string[]>();
  for (const step of new Set(legs.flatMap((leg) => leg.steps))) {
    const moving = legs.filter((leg) => leg.steps.includes(step));
    const waits = moving.map(() => 0);
    const handedOn = moving.map(() => false);
    moving.forEach((leg, index) => {
      moving.slice(0, index).forEach((earlier, before) => {
        if (earlier.to === leg.from) {
          waits[index] = Math.max(waits[index] ?? 0, (waits[before] ?? 0) + 1);
          handedOn[before] = true;
        }
      });
    });
    moving.forEach((leg, index) => {
      timing.set(leg.element, [
        ...(timing.get(leg.element) ?? []),
        `${step}:${waits[index]}:${handedOn[index] ? 1 : 0}`,
      ]);
    });
  }
  for (const [element, entries] of timing) {
    element.properties.dataTokenTiming = entries.join(" ");
  }
};

/**
 * Gives each part of a d2 drawing the step classes it inherits, and moves
 * the arrowheads to the top of the drawing: d2 defines each one inside the
 * first connection that draws it, and hiding that connection would hide
 * every arrow drawn with it. A class list written with commas fails: d2
 * separates a list with `;`, and reads a comma list as one class it does
 * not know, silently dropping the styles of every name in it.
 */
export const prepareD2Parts = (svg: Element): void => {
  const drawing =
    svg.children.filter(isElement).find((child) => child.tagName === "svg") ??
    svg;
  const parts = new Map<Element, { id: string; classes: string[] }>();
  for (const child of drawing.children.filter(isElement)) {
    const [first = "", ...classes] = classesOf(child);
    const id = child.tagName === "g" ? partIdOf(first) : null;
    if (id === null) {
      continue;
    }
    if (classes.some((name) => name.endsWith(","))) {
      throw new Error(
        `a d2 class list separates its names with ";", as in [react; at-1], not with commas: "${classes.join(" ")}"`,
      );
    }
    parts.set(child, { id, classes });
  }
  const steps = partSteps(
    new Map([...parts.values()].map(({ id, classes }) => [id, classes])),
  );
  for (const [element, { id }] of parts) {
    const inherited = steps.get(id);
    if (inherited === undefined) {
      continue;
    }
    element.properties.className = [
      ...classesOf(element),
      ...(inherited.at > 0 ? [`at-${inherited.at}`] : []),
      ...(inherited.until === null ? [] : [`until-${inherited.until}`]),
    ];
  }
  chainTokens(parts);
  const markers = [...parts.keys()].flatMap(takeMarkers);
  if (markers.length > 0) {
    drawing.children.unshift({
      type: "element",
      tagName: "defs",
      properties: {},
      children: markers,
    });
  }
};
