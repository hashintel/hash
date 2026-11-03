/**
 * Which step each part of a rendered d2 drawing appears on, and the parts
 * wrapped so they do.
 *
 * d2 draws every shape and connection as a group whose first class is its
 * id in base64, `website` or `(website -> core)[0]`, followed by the d2
 * classes the source gave it. A class `at-<n>` shows the part from step n,
 * and `until-<n>` hides it again from step n, as a `Reveal` does. A
 * connection waits for both its ends and a shape for its container, so
 * marking a shape brings its connections with it.
 */

import { numberAttribute } from "./mdx-jsx.mjs";

import type { Element, ElementContent } from "hast";

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

const ownSteps = (classes: readonly string[]): PartSteps =>
  classes.reduce<PartSteps>(
    (steps, name) => {
      const match = /^(at|until)-(\d+)$/u.exec(name);
      const step = Number(match?.[2]);
      if (match?.[1] === "at") {
        return { ...steps, at: Math.max(steps.at, step) };
      }
      if (match?.[1] === "until") {
        return {
          ...steps,
          until: steps.until === null ? step : Math.min(steps.until, step),
        };
      }
      return steps;
    },
    { at: 0, until: null },
  );

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

/**
 * The classes hast read off a part. d2 separates a class list with `;`; a
 * list written with commas is one class d2 does not know, which silently
 * drops the styles of every name in it, so it fails here instead.
 */
const classesOf = (element: Element): string[] => {
  const { className } = element.properties;
  const names = Array.isArray(className) ? className.map(String) : [];
  const listed = names.find((name) => name.endsWith(","));
  if (listed !== undefined) {
    throw new Error(
      `a d2 class list separates its names with ";", as in [react; at-1], not with commas: "${names.slice(1).join(" ")}"`,
    );
  }
  return names;
};

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
 * Wraps each part of a d2 drawing that a step shows or hides in a
 * `RevealGroup`. The parts are the groups directly inside the drawing's
 * inner `svg`; anything else d2 draws is left as it is. d2 defines each
 * arrowhead inside the first connection that draws it, so the arrowheads
 * move to the top of the drawing first: hiding that connection would hide
 * every arrow drawn with them.
 */
export const wrapDiagramParts = (svg: Element): void => {
  const drawing =
    svg.children.filter(isElement).find((child) => child.tagName === "svg") ??
    svg;
  const parts = new Map<Element, { id: string; classes: string[] }>();
  for (const child of drawing.children.filter(isElement)) {
    const [first = "", ...classes] = classesOf(child);
    const id = child.tagName === "g" ? partIdOf(first) : null;
    if (id !== null) {
      parts.set(child, { id, classes });
    }
  }
  const steps = partSteps(
    new Map([...parts.values()].map(({ id, classes }) => [id, classes])),
  );
  const markers = [...parts.keys()].flatMap(takeMarkers);
  if (markers.length > 0) {
    drawing.children.unshift({
      type: "element",
      tagName: "defs",
      properties: {},
      children: markers,
    });
  }
  drawing.children = drawing.children.map((child) => {
    const part = isElement(child) ? parts.get(child) : undefined;
    const shown = part === undefined ? undefined : steps.get(part.id);
    if (shown === undefined || (shown.at === 0 && shown.until === null)) {
      return child;
    }
    return {
      type: "mdxJsxFlowElement",
      name: "RevealGroup",
      attributes: [
        ...(shown.at === 0 ? [] : [numberAttribute("at", shown.at)]),
        ...(shown.until === null
          ? []
          : [numberAttribute("until", shown.until)]),
      ],
      children: [child],
    } as unknown as ElementContent;
  });
};
