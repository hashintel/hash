/**
 * The reactive module graph: what a compiler lowers a net to before any
 * target syntax is chosen. A graph is a set of typed variables, a set of
 * modules that each drive some of them and read others, and a root that
 * says how the modules make up the system.
 *
 * The model follows Zeroth's reactive modules: a variable has one driver;
 * a module's `update` computes each driven variable's next value from the
 * latched values of the variables it reads, or from the next value of a
 * variable another module drives in the same round (`next: true` on a
 * reference, an await). Awaits must form a DAG, which composition orders.
 */

export type ReactiveSort = "int" | "real" | "bool";

/** The theory a module's expressions are typed in. */
export type ReactiveTheory = "LIA" | "LRA";

export type ReactiveVariable = {
  name: string;
  sort: ReactiveSort;
  /**
   * `place`: a token count. `input`: an external the harness writes each
   * round, such as a draw or a choice. `flag`: a Bool a module drives for
   * the others to await.
   */
  role: "place" | "input" | "flag";
  comment?: string;
};

export type ReactiveBinaryOperator = "+" | "-" | ">=" | "<=" | "&";

export type ReactiveExpr =
  | {
      kind: "ref";
      name: string;
      /** The variable's next value, awaited from its driver; latched when false. */
      next: boolean;
    }
  | { kind: "num"; value: number }
  | { kind: "bool"; value: boolean }
  | {
      kind: "binary";
      op: ReactiveBinaryOperator;
      left: ReactiveExpr;
      right: ReactiveExpr;
    }
  | {
      kind: "ite";
      condition: ReactiveExpr;
      thenBranch: ReactiveExpr;
      elseBranch: ReactiveExpr;
    };

export type ReactiveStatement =
  | { kind: "comment"; text: string }
  /** Binds a local; a local named like a variable shadows it from here on. */
  | { kind: "assign"; target: string; expr: ReactiveExpr; comment?: string };

export type ReactiveModuleDecl = {
  className: string;
  /** The identifier the instance is bound to when the root composes it. */
  instance: string;
  docstring: string;
  theory: ReactiveTheory;
  /** Variables the module drives, in parameter order. */
  ctrl: string[];
  /** Variables the module reads but does not drive, in parameter order. */
  extl: string[];
  /** One initial value per `ctrl`. */
  init: ReactiveExpr[];
  update: ReactiveStatement[];
  /** One next value per `ctrl`, read after `update`'s statements. */
  returns: ReactiveExpr[];
};

export type ReactiveModuleGraph = {
  /** The first line of the generated file, naming the net and its origin. */
  header: string;
  variables: ReactiveVariable[];
  modules: ReactiveModuleDecl[];
  /** The system: one module's instance, or the composition of them all. */
  root:
    | { kind: "single"; module: string }
    | { kind: "compose"; modules: string[] };
};

export const ref = (name: string): ReactiveExpr => ({
  kind: "ref",
  name,
  next: false,
});

export const next = (name: string): ReactiveExpr => ({
  kind: "ref",
  name,
  next: true,
});

export const num = (value: number): ReactiveExpr => ({ kind: "num", value });

export const bool = (value: boolean): ReactiveExpr => ({
  kind: "bool",
  value,
});

export const binary = (
  op: ReactiveBinaryOperator,
  left: ReactiveExpr,
  right: ReactiveExpr,
): ReactiveExpr => ({ kind: "binary", op, left, right });

export const ite = (
  condition: ReactiveExpr,
  thenBranch: ReactiveExpr,
  elseBranch: ReactiveExpr,
): ReactiveExpr => ({ kind: "ite", condition, thenBranch, elseBranch });

/** `current` changed by `amount` when `condition` holds; unconditionally without one. */
export const changedWhen = (
  condition: ReactiveExpr | null,
  current: ReactiveExpr,
  op: "+" | "-",
  amount: number,
): ReactiveExpr => {
  const changed = binary(op, current, num(amount));
  return condition === null ? changed : ite(condition, changed, current);
};

/** The terms joined with `&`; `null` for no terms. */
export const conjunction = (terms: ReactiveExpr[]): ReactiveExpr | null =>
  terms.reduce<ReactiveExpr | null>(
    (guard, term) => (guard === null ? term : binary("&", guard, term)),
    null,
  );

export const comment = (text: string): ReactiveStatement => ({
  kind: "comment",
  text,
});

export const assign = (
  target: string,
  expr: ReactiveExpr,
  trailer?: string,
): ReactiveStatement => ({
  kind: "assign",
  target,
  expr,
  ...(trailer === undefined ? {} : { comment: trailer }),
});

/** The names of the variables an expression awaits (`next` references). */
export const awaitedNames = (expr: ReactiveExpr, into: Set<string>): void => {
  switch (expr.kind) {
    case "ref":
      if (expr.next) {
        into.add(expr.name);
      }
      return;
    case "num":
    case "bool":
      return;
    case "binary":
      awaitedNames(expr.left, into);
      awaitedNames(expr.right, into);
      return;
    case "ite":
      awaitedNames(expr.condition, into);
      awaitedNames(expr.thenBranch, into);
      awaitedNames(expr.elseBranch, into);
  }
};

/** Every variable a module awaits, over its `update` and `returns`. */
export const moduleAwaits = (module: ReactiveModuleDecl): Set<string> => {
  const names = new Set<string>();
  for (const statement of module.update) {
    if (statement.kind === "assign") {
      awaitedNames(statement.expr, names);
    }
  }
  for (const expr of module.returns) {
    awaitedNames(expr, names);
  }
  return names;
};
