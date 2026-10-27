import { createElement, Fragment, type ReactNode } from "react";

import {
  interpretViewHir,
  isSafeViewValue,
  VIEW_ELEMENT_ATTRIBUTES,
  VIEW_ELEMENT_TAGS,
  VIEW_FRAGMENT_TAG,
  VIEW_STYLE_PROPERTIES,
  ViewElementValue,
  type HirValue,
  type ViewHir,
  type ViewValue,
} from "@hashintel/petrinaut-core";

export type VisualizerTokens = readonly Readonly<
  Record<string, number | boolean | bigint | string>
>[];

export type VisualizerParameters = Readonly<Record<string, number | boolean>>;

const isRecord = (
  value: HirValue,
): value is { readonly [key: string]: HirValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unsafeValue = (name: string): Error =>
  new Error(
    `\`${name}\` may only reference an element of this picture with \`url(#id)\`.`,
  );

const toStyle = (
  value: HirValue,
): Record<string, string | number> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const style: Record<string, string | number> = {};
  for (const [property, raw] of Object.entries(value)) {
    if (!VIEW_STYLE_PROPERTIES.has(property)) {
      throw new Error(
        `\`${property}\` is not a style property a visualizer can set.`,
      );
    }
    if (typeof raw === "string") {
      if (!isSafeViewValue(raw)) {
        throw unsafeValue(property);
      }
      style[property] = raw;
    } else if (typeof raw === "number") {
      style[property] = raw;
    } else if (typeof raw === "bigint") {
      style[property] = String(raw);
    }
  }
  return style;
};

const toAttributeValue = (
  name: string,
  raw: HirValue,
): string | number | boolean | Record<string, string | number> | undefined => {
  if (name === "style") {
    return toStyle(raw);
  }
  switch (typeof raw) {
    case "string":
      if (!isSafeViewValue(raw)) {
        throw unsafeValue(name);
      }
      return raw;
    case "number":
    case "boolean":
      return raw;
    case "bigint":
      return String(raw);
    default:
      // `null` and anything structural leave the attribute unset.
      return undefined;
  }
};

const elementToReactNode = (element: ViewElementValue): ReactNode => {
  const { tag } = element;
  if (tag !== VIEW_FRAGMENT_TAG && !VIEW_ELEMENT_TAGS.has(tag)) {
    throw new Error(`\`<${tag}>\` cannot be drawn by a visualizer.`);
  }
  const props: Record<string, unknown> = {};
  for (const [name, raw] of element.attributes) {
    if (!VIEW_ELEMENT_ATTRIBUTES.has(name)) {
      throw new Error(`\`${name}\` is not an attribute a visualizer can set.`);
    }
    const value = toAttributeValue(name, raw);
    if (value !== undefined) {
      props[name] = value;
    }
  }
  const { key } = element;
  if (typeof key === "string" || typeof key === "number") {
    props.key = key;
  } else if (typeof key === "bigint") {
    props.key = String(key);
  }
  return createElement(
    tag === VIEW_FRAGMENT_TAG ? Fragment : tag,
    props,
    // eslint-disable-next-line no-use-before-define -- mutual recursion
    ...element.children.map(toReactNode),
  );
};

const toReactNode = (value: ViewValue): ReactNode => {
  if (value === null || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return (value as readonly ViewValue[]).map(toReactNode);
  }
  if (value instanceof ViewElementValue) {
    return elementToReactNode(value);
  }
  return null;
};

/**
 * Draws one frame of a lowered visualizer: interprets the view over the
 * place's tokens and the net's parameters, then turns the element values
 * into React elements.
 *
 * The lowering already restricted the picture to the allowlisted elements,
 * attributes and style properties, and the checker refused literal remote
 * URLs; values computed at run time are checked here again, so nothing
 * outside those sets reaches the DOM. A violation throws, which the
 * surrounding error boundary shows as a runtime error.
 */
export const renderVisualizerHir = (
  view: ViewHir,
  tokens: VisualizerTokens,
  parameters: VisualizerParameters,
): ReactNode => toReactNode(interpretViewHir(view, { tokens, parameters }));
