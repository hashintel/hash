import { svgIconBaseCss, svgIconClassName } from "./define-icon";
import { svgIcons } from "./icons";

import type { SvgIconNode } from "./define-icon";
import type { SvgIconName } from "./icons";

const escapeAttribute = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");

const nodeToString = ([tag, attributes, children]: SvgIconNode): string => {
  const attributeText = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join("");
  return children?.length
    ? `<${tag}${attributeText}>${children.map(nodeToString).join("")}</${tag}>`
    : `<${tag}${attributeText}/>`;
};

/**
 * Renders a standalone SVG file. Its `<style>` carries the motion, so the
 * icon animates without React once it is inlined into an HTML page.
 */
export const svgIconToString = (name: SvgIconName) => {
  const { nodes, css } = svgIcons[name];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="${svgIconClassName(name)}" aria-hidden="true" focusable="false">`,
    `<style>${svgIconBaseCss}${css}</style>`,
    ...nodes.map(nodeToString),
    "</svg>",
  ].join("");
};
