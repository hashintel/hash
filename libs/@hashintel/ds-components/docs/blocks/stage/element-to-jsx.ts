import { isValidElement } from "react";

/**
 * Serializes the live example elements a docs Stage renders into the JSX
 * source shown on its Code tab, so preview and code can never drift apart.
 * Only the prop shapes docs examples use are supported: strings, numbers,
 * booleans (`true` as a bare flag, `false` as `={false}`), `null`, element
 * values such as `suffix={<span>12</span>}`, and plain objects/arrays of
 * those, serialized inline as JS literals. Functions serialize as the noop
 * `() => {}` — which is what Stage examples actually pass; an example whose
 * handler body matters belongs in a fenced block. Elements without a
 * trustworthy name — anything other than a host element or a component with
 * an identifier-like, optionally dotted `displayName` such as `Banner.Title`
 * (names from `Function.name` disappear under minification) — serialize
 * transparently, as their children only;
 * that also unwraps the paragraph wrappers MDX inserts around multiline JSX
 * children.
 */

const componentNamePattern = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;

const componentName = (type: unknown): string | null => {
  if (typeof type === "string") {
    return type === "p" ? null : type;
  }
  if (
    typeof type === "function" ||
    (typeof type === "object" && type !== null)
  ) {
    const { displayName } = type as { displayName?: unknown };
    if (
      typeof displayName === "string" &&
      componentNamePattern.test(displayName)
    ) {
      return displayName;
    }
  }
  return null;
};

const identifierPattern = /^[A-Za-z_$][\w$]*$/;

const toJsLiteral = (
  value: unknown,
  serializeElement: (node: React.ReactNode) => string[],
): string | null => {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "function") {
    return "() => {}";
  }
  if (isValidElement(value)) {
    const lines = serializeElement(value);
    return lines.length > 0 ? lines.map((line) => line.trim()).join(" ") : null;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => toJsLiteral(item, serializeElement));
    return items.every((item): item is string => item !== null)
      ? `[${items.join(", ")}]`
      : null;
  }
  if (typeof value === "object") {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return null;
    }
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => {
        const literal = toJsLiteral(fieldValue, serializeElement);
        if (literal === null) {
          return null;
        }
        const safeKey = identifierPattern.test(key) ? key : JSON.stringify(key);
        return `${safeKey}: ${literal}`;
      });
    return fields.every((field): field is string => field !== null)
      ? `{ ${fields.join(", ")} }`
      : null;
  }
  return null;
};

const formatProps = (
  props: Record<string, unknown>,
  serializeElement: (node: React.ReactNode) => string[],
): string => {
  const parts: string[] = [];
  for (const [propName, propValue] of Object.entries(props)) {
    if (propName === "children" || propValue === undefined) {
      continue;
    }
    if (propValue === null) {
      parts.push(`${propName}={null}`);
    } else if (propValue === true) {
      parts.push(propName);
    } else if (propValue === false) {
      parts.push(`${propName}={false}`);
    } else if (typeof propValue === "string") {
      parts.push(`${propName}="${propValue}"`);
    } else if (typeof propValue === "number") {
      parts.push(`${propName}={${propValue}}`);
    } else if (isValidElement(propValue)) {
      const lines = serializeElement(propValue);
      if (lines.length > 0) {
        parts.push(
          `${propName}={${lines.map((line) => line.trim()).join(" ")}}`,
        );
      }
    } else if (typeof propValue === "function") {
      parts.push(`${propName}={() => {}}`);
    } else if (typeof propValue === "object" || Array.isArray(propValue)) {
      const literal = toJsLiteral(propValue, serializeElement);
      if (literal !== null) {
        parts.push(`${propName}={${literal}}`);
      }
    }
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
};

const nodeToLines = (node: React.ReactNode, indent: string): string[] => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }
  if (typeof node === "string" || typeof node === "number") {
    const text = String(node).trim();
    return text === "" ? [] : [`${indent}${text}`];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) =>
      nodeToLines(child as React.ReactNode, indent),
    );
  }
  if (!isValidElement(node)) {
    return [];
  }

  const props = node.props as Record<string, unknown> & {
    children?: React.ReactNode;
  };
  const name = componentName(node.type);
  if (name === null) {
    return nodeToLines(props.children, indent);
  }

  const attrs = formatProps(props, (child) => nodeToLines(child, ""));
  const inner = nodeToLines(props.children, `${indent}  `);
  if (inner.length === 0) {
    return [`${indent}<${name}${attrs} />`];
  }
  if (inner.length === 1) {
    const oneLine = `${indent}<${name}${attrs}>${inner[0]?.trim() ?? ""}</${name}>`;
    if (oneLine.length <= 80) {
      return [oneLine];
    }
  }
  return [`${indent}<${name}${attrs}>`, ...inner, `${indent}</${name}>`];
};

export const elementToJsx = (node: React.ReactNode): string =>
  nodeToLines(node, "").join("\n");
