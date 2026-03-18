/**
 * JSON-based intermediate representation for mathematical expressions.
 *
 * This IR captures the semantic structure of expressions parsed from
 * TypeScript source code — bindings, expressions, and probability
 * distributions — providing a JSON-serializable format that can be
 * translated to various backends (e.g., SymPy).
 */

export type ExpressionIR =
  | NumberNode
  | BooleanNode
  | InfinityNode
  | SymbolNode
  | ParameterNode
  | TokenAccessNode
  | BinaryNode
  | UnaryNode
  | CallNode
  | DistributionNode
  | DerivedDistributionNode
  | PiecewiseNode
  | ArrayNode
  | ObjectNode
  | ListComprehensionNode
  | LetNode
  | PropertyAccessNode
  | ElementAccessNode;

export type NumberNode = {
  type: "number";
  /** Exact string representation from source, e.g. "3.14" */
  value: string;
};

export type BooleanNode = {
  type: "boolean";
  value: boolean;
};

export type InfinityNode = {
  type: "infinity";
};

/** A generic symbol (local binding, iterator variable, etc.) */
export type SymbolNode = {
  type: "symbol";
  name: string;
};

/** A model parameter reference (from `parameters.<name>`) */
export type ParameterNode = {
  type: "parameter";
  name: string;
};

/** Token field access: `tokens.<place>[<index>].<field>` */
export type TokenAccessNode = {
  type: "tokenAccess";
  place: string;
  index: ExpressionIR;
  field: string;
};

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "**"
  | "%"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export type BinaryNode = {
  type: "binary";
  op: BinaryOp;
  left: ExpressionIR;
  right: ExpressionIR;
};

export type UnaryOp = "-" | "!" | "+";

export type UnaryNode = {
  type: "unary";
  op: UnaryOp;
  operand: ExpressionIR;
};

/** A math function call (e.g. cos, sin, sqrt, hypot, pow, min, max) */
export type CallNode = {
  type: "call";
  fn: string;
  args: ExpressionIR[];
};

/** A probability distribution (e.g. Gaussian, Uniform, Lognormal) */
export type DistributionNode = {
  type: "distribution";
  distribution: string;
  args: ExpressionIR[];
};

/**
 * A distribution transformed by a function: `dist.map(fn)`.
 *
 * Example: `Distribution.Gaussian(0, 10).map(Math.cos)` produces a
 * derived distribution where samples are drawn from the base and then
 * transformed through the body expression.
 */
export type DerivedDistributionNode = {
  type: "derivedDistribution";
  distribution: ExpressionIR;
  variable: string;
  body: ExpressionIR;
};

/** Conditional expression (ternary) */
export type PiecewiseNode = {
  type: "piecewise";
  condition: ExpressionIR;
  whenTrue: ExpressionIR;
  whenFalse: ExpressionIR;
};

export type ArrayNode = {
  type: "array";
  elements: ExpressionIR[];
};

export type ObjectNode = {
  type: "object";
  entries: { key: string; value: ExpressionIR }[];
};

/** List comprehension from `.map()` calls */
export type ListComprehensionNode = {
  type: "listComprehension";
  body: ExpressionIR;
  variable: string;
  collection: ExpressionIR;
};

/** Scoped const bindings wrapping a body expression */
export type LetNode = {
  type: "let";
  bindings: { name: string; value: ExpressionIR }[];
  body: ExpressionIR;
};

/** Fallback property access: `<object>.<property>` */
export type PropertyAccessNode = {
  type: "propertyAccess";
  object: ExpressionIR;
  property: string;
};

/** Fallback element access: `<object>[<index>]` */
export type ElementAccessNode = {
  type: "elementAccess";
  object: ExpressionIR;
  index: ExpressionIR;
};
