/**
 * The SPN module graph: what the clocks strategy lowers a stochastic net to
 * before the Python is written. It follows Zeroth's SPN theory, after its
 * own `birth_death.py`: a place is a Nat counter, a transition owns a Clock
 * armed with an exponential delay and an Event it toggles when it fires,
 * and every clock runs down against one external time reference. A
 * transition in a conflict the flags leave open also reads a Bool pick that
 * nothing drives.
 *
 * The expressions are the forms the theory's sugar accepts: a count is
 * tested against zero and stepped by one, a clock is tested against zero,
 * kept non-negative and run at a constant rate against the time reference,
 * and an event is read with `fired`. Awaits are implicit: `fired(ev)` awaits
 * the event and `d(t)` awaits the time reference, so no reference is marked
 * `next`. A module without a `flow` gets the theory's zero flow for every
 * variable it drives. No interpreter runs this graph: time is continuous.
 */

export type SpnSort = "nat" | "clock" | "event" | "bool";

export type SpnVariable = {
  name: string;
  sort: SpnSort;
  /**
   * `time`: the external reference every clock runs against. `place`: a
   * token count. `clock`: the time left until a transition fires, hidden in
   * the system. `event`: what a transition toggles when it fires. `pick`:
   * the environment lets a transition in a conflict fire when its clock
   * expires; external, and driven by nothing.
   */
  role: "time" | "place" | "clock" | "event" | "pick";
  comment?: string;
};

export type SpnExpr =
  | { kind: "ref"; name: string }
  | { kind: "nat"; value: number }
  | { kind: "bool"; value: boolean }
  /** `x == 0` when `zero`, `x != 0` otherwise: the one test on a count or a clock. */
  | { kind: "test"; operand: SpnExpr; zero: boolean }
  | { kind: "logic"; op: "&" | "|"; left: SpnExpr; right: SpnExpr }
  | { kind: "not"; operand: SpnExpr }
  /** `n + 1` or `n - 1`: a count moves one token at a time. */
  | { kind: "step"; op: "+" | "-"; operand: SpnExpr }
  | {
      kind: "ite";
      condition: SpnExpr;
      thenBranch: SpnExpr;
      elseBranch: SpnExpr;
    }
  /** `if_then(c, e)`: a value where the condition holds, no step otherwise. */
  | { kind: "ifThen"; condition: SpnExpr; branch: SpnExpr }
  /** `fired(ev)`: the event changes value this step. */
  | { kind: "fired"; event: string }
  /** `exp(rate)`: a clock armed with an exponential delay. */
  | { kind: "exp"; rate: number }
  /** `clk >= 0`: the invariant that keeps time from passing an expiry. */
  | { kind: "nonNegative"; clock: string }
  /** `factor * d(t)`: a clock's flow against the time reference. */
  | { kind: "rate"; factor: number; time: string };

export type SpnStatement = {
  kind: "assign";
  target: string;
  expr: SpnExpr;
  comment?: string;
};

export type SpnModuleDecl = {
  className: string;
  /** The identifier the instance is bound to when the system composes it. */
  instance: string;
  docstring: string;
  /** Variables the module drives, in parameter order. */
  ctrl: string[];
  /** Variables the module reads but does not drive, in parameter order. */
  extl: string[];
  /** One initial value per `ctrl`. */
  init: SpnExpr[];
  next: SpnStatement[];
  /** One next value per `ctrl`, read after `next`'s statements. */
  returns: SpnExpr[];
  /**
   * One tangent per `ctrl`, `null` for a variable with no flow. Absent on a
   * module with no `flow` method, whose variables get the theory's zero flow.
   */
  flow?: (SpnExpr | null)[];
};

export type SpnModuleGraph = {
  language: "spn";
  /** The first line of the generated file, naming the net and its origin. */
  header: string;
  variables: SpnVariable[];
  /** The system composes every module, in this order. */
  modules: SpnModuleDecl[];
  /** Variables the system hides: driven by a module, absent from its interface. */
  hidden: string[];
};

export const ref = (name: string): SpnExpr => ({ kind: "ref", name });

export const nat = (value: number): SpnExpr => ({ kind: "nat", value });

export const bool = (value: boolean): SpnExpr => ({ kind: "bool", value });

export const isZero = (operand: SpnExpr): SpnExpr => ({
  kind: "test",
  operand,
  zero: true,
});

export const nonZero = (operand: SpnExpr): SpnExpr => ({
  kind: "test",
  operand,
  zero: false,
});

export const and = (left: SpnExpr, right: SpnExpr): SpnExpr => ({
  kind: "logic",
  op: "&",
  left,
  right,
});

export const or = (left: SpnExpr, right: SpnExpr): SpnExpr => ({
  kind: "logic",
  op: "|",
  left,
  right,
});

export const not = (operand: SpnExpr): SpnExpr => ({ kind: "not", operand });

export const inc = (operand: SpnExpr): SpnExpr => ({
  kind: "step",
  op: "+",
  operand,
});

export const dec = (operand: SpnExpr): SpnExpr => ({
  kind: "step",
  op: "-",
  operand,
});

export const ite = (
  condition: SpnExpr,
  thenBranch: SpnExpr,
  elseBranch: SpnExpr,
): SpnExpr => ({ kind: "ite", condition, thenBranch, elseBranch });

export const ifThen = (condition: SpnExpr, branch: SpnExpr): SpnExpr => ({
  kind: "ifThen",
  condition,
  branch,
});

export const fired = (event: string): SpnExpr => ({ kind: "fired", event });

export const exp = (rate: number): SpnExpr => ({ kind: "exp", rate });

export const nonNegative = (clock: string): SpnExpr => ({
  kind: "nonNegative",
  clock,
});

export const rate = (factor: number, time: string): SpnExpr => ({
  kind: "rate",
  factor,
  time,
});

/** The terms joined with `&`, left to right; `null` for no terms. */
export const conjunction = (terms: SpnExpr[]): SpnExpr | null =>
  terms.reduce<SpnExpr | null>(
    (all, term) => (all === null ? term : and(all, term)),
    null,
  );

export const assign = (target: string, expr: SpnExpr): SpnStatement => ({
  kind: "assign",
  target,
  expr,
});

/** Every sub-expression, the expression itself first. */
export const walkSpnExpr = (
  expr: SpnExpr,
  visit: (node: SpnExpr) => void,
): void => {
  visit(expr);
  switch (expr.kind) {
    case "ref":
    case "nat":
    case "bool":
    case "fired":
    case "exp":
    case "nonNegative":
    case "rate":
      return;
    case "test":
    case "not":
    case "step":
      walkSpnExpr(expr.operand, visit);
      return;
    case "logic":
      walkSpnExpr(expr.left, visit);
      walkSpnExpr(expr.right, visit);
      return;
    case "ite":
      walkSpnExpr(expr.condition, visit);
      walkSpnExpr(expr.thenBranch, visit);
      walkSpnExpr(expr.elseBranch, visit);
      return;
    case "ifThen":
      walkSpnExpr(expr.condition, visit);
      walkSpnExpr(expr.branch, visit);
  }
};
