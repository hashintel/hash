/**
 * The vocabulary of the Petrinaut DSL, shared by the printer and by editors
 * that highlight it. Every keyword starts a declaration or an attribute; the
 * code surfaces hold TypeScript function bodies between their braces.
 */

export const dslDeclarationKeywords = [
  "net",
  "component",
  "type",
  "param",
  "dynamics",
  "place",
  "port",
  "transition",
  "instance",
  "fuse",
  "metric",
  "scenario",
] as const;

export const dslAttributeKeywords = [
  "in",
  "out",
  "inout",
  "capacity",
  "start",
  "read",
  "inhibit",
  "override",
  "components-only",
] as const;

/** Keywords that open a TypeScript function body in braces. */
export const dslCodeKeywords = [
  "dynamics",
  "rate",
  "guard",
  "kernel",
  "visualizer",
  "metric",
  "initial",
] as const;

export const dslValueTypes = [
  "real",
  "integer",
  "boolean",
  "uuid",
  "string",
  "ratio",
] as const;

export type DslCodeKeyword = (typeof dslCodeKeywords)[number];
