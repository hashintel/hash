/**
 * The view HIR: the tree a place visualizer lowers to.
 *
 * A visualizer is JavaScript with JSX. Its elements, and the conditionals
 * and comprehensions that choose or repeat them, form a tree of view nodes.
 * Every value inside that tree (an attribute, a condition, the array a
 * `.map(...)` walks, an interpolated label) is an expression of the
 * expression HIR (`../hir/hir.ts`), lowered, typed and evaluated by it under
 * the `visualizer` surface. The view HIR adds only what a picture needs
 * beyond an expression, and stays out of the surfaces that compile to
 * buffer programs or shaders.
 *
 * View nodes carry spans for diagnostics but no ids: the expression HIR's
 * type side table is keyed by expression id, and a view node has no type.
 */
import type { HirExpr, HirLetBinding, Span } from "../hir/hir";

/** A declared name (the props parameter or a callback parameter) and where
 * it is spelled. */
export type ViewNamedSpan = { name: string; span: Span };

export type ViewAttribute = {
  name: string;
  nameSpan: Span;
  value: HirExpr;
};

/** The `tag` of an element lowered from a fragment, `<>…</>`. */
export const VIEW_FRAGMENT_TAG = "#fragment";

/**
 * A JSX element. `tag` is the element name, `svg`, `circle`, …, or
 * `VIEW_FRAGMENT_TAG`; `key` is the reconciliation key and never an
 * attribute; children render in order.
 */
export type ViewElement = {
  kind: "element";
  span: Span;
  tag: string;
  tagSpan: Span;
  attributes: ViewAttribute[];
  key?: HirExpr;
  children: ViewNode[];
};

/** Literal JSX text, whitespace-cleaned as JSX compilers do. */
export type ViewText = {
  kind: "text";
  span: Span;
  value: string;
};

/**
 * `{expression}` in child position: a value written as text. Numbers,
 * strings and bigints print; `null` and booleans render nothing; an array
 * renders item by item, as React does.
 */
export type ViewExpr = {
  kind: "expr";
  span: Span;
  expr: HirExpr;
};

/** `null`, `true` or `false` in child position: nothing is drawn. */
export type ViewEmpty = {
  kind: "empty";
  span: Span;
};

/** `condition ? thenBranch : elseBranch`, or a guard `if` in a block body.
 * The condition is judged by JavaScript truthiness. */
export type ViewCond = {
  kind: "cond";
  span: Span;
  condition: HirExpr;
  thenBranch: ViewNode;
  elseBranch: ViewNode;
};

/**
 * `condition && body`. As in JavaScript, a falsy condition is the result:
 * `{tokens.length && <g/>}` writes `0` for an empty place, while `null`,
 * `false` and `""` draw nothing.
 */
export type ViewAnd = {
  kind: "and";
  span: Span;
  condition: HirExpr;
  body: ViewNode;
};

/** `target.map((param, indexParam?) => body)`: one body per array item. */
export type ViewMap = {
  kind: "map";
  span: Span;
  target: HirExpr;
  param: ViewNamedSpan;
  indexParam?: ViewNamedSpan;
  body: ViewNode;
};

/** `const` bindings of a block body, in scope for `body`. */
export type ViewLet = {
  kind: "let";
  span: Span;
  bindings: HirLetBinding[];
  body: ViewNode;
};

export type ViewNode =
  | ViewElement
  | ViewText
  | ViewExpr
  | ViewEmpty
  | ViewCond
  | ViewAnd
  | ViewMap
  | ViewLet;

/** A lowered visualizer: the unit that crosses the worker boundary. */
export type ViewHir = {
  viewVersion: 1;
  /** The props parameter, `({ tokens, parameters })`, when declared. */
  props: ViewNamedSpan | null;
  body: ViewNode;
  /** Span of the whole component function in the source text. */
  span: Span;
};
