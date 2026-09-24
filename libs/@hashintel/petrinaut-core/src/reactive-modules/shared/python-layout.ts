/**
 * The layout every Python emitter shares: the indent, the line width, the
 * tuple and `compose` forms, and how a module class is named as a file.
 */

export type ReactiveModuleFile = {
  /** Relative to the output directory, `net.py` for the main file. */
  path: string;
  text: string;
};

export const INDENT = "    ";
export const LINE_WIDTH = 88;

export const tupleLiteral = (names: string[]): string =>
  names.length === 1 ? `(${names[0]},)` : `(${names.join(", ")})`;

/**
 * `net = compose(...)` over the instances, with `hide={...}` last when some
 * variables are hidden: one line when it fits, one argument per line otherwise.
 */
export const composeLines = (
  instances: string[],
  hidden: string[] = [],
): string[] => {
  const args = [
    ...instances,
    ...(hidden.length > 0 ? [`hide={${hidden.join(", ")}}`] : []),
  ];
  const oneLine = `net = compose(${args.join(", ")})`;
  return oneLine.length <= LINE_WIDTH
    ? [oneLine]
    : ["net = compose(", ...args.map((arg) => `${INDENT}${arg},`), ")"];
};

/** `Transition_FooBar` → `transition_foo_bar`: the Python module a class file imports as. */
export const moduleFileStem = (className: string): string =>
  className
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

/**
 * One stem per module. IR names differ by case alone at times, `Ab` and `AB`,
 * and lowercasing joins them, so a later module that lands on a taken stem
 * gets a numbered one: `place_ab`, `place_ab_2`.
 */
export const moduleFileStems = (
  classNames: string[],
): ReadonlyMap<string, string> => {
  const taken = new Set<string>();
  const stems = new Map<string, string>();
  for (const className of classNames) {
    const base = moduleFileStem(className);
    let stem = base;
    for (let index = 2; taken.has(stem); index += 1) {
      stem = `${base}_${index}`;
    }
    taken.add(stem);
    stems.set(className, stem);
  }
  return stems;
};
