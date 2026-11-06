import { Array, Function, HashMap, MutableHashMap, Option, pipe } from "effect";

import * as AST from "./AST/index.js";
import * as Trait from "./Trait.js";

import type * as Catalogue from "./Catalogue.js";

type Target = AST.Reference.Reference.Target;

/** An interface or a class in the hierarchy, and what the reference knows about it. */
export interface Vertex {
  readonly target: Target;
  /** A public declaration's path below its entrypoint, or the declared name of a private or external one. */
  readonly label: string;
  readonly trait: Option.Option<Trait.Trait>;
  /** The public declaration a local type is, or none for a private or external one. */
  readonly entry: Option.Option<Catalogue.Entry>;
}

/** Every interface and class the public ones reach through their bases. A vertex is named by its position in `vertices`, and `bases` and `derived` hold the positions of its direct neighbours. */
export interface Hierarchy {
  readonly vertices: readonly Vertex[];
  readonly bases: readonly (readonly number[])[];
  readonly derived: readonly (readonly number[])[];
  readonly indexOf: (target: Target) => Option.Option<number>;
}

/** The interfaces and classes `target` extends or implements directly. Only a declaration of the AST has bases of its own there. */
const basesOf = (
  ast: AST.Store["Service"],
  target: Target,
): readonly Target[] => {
  if (target._tag === "External") {
    return target.bases;
  }

  const node = ast.get(target.node);

  return AST.Declaration.isDeclaration(node) ? node.bases : [];
};

const describe = (
  target: Target,
  catalogue: Catalogue.Catalogue,
): Option.Option<Omit<Vertex, "target">> => {
  const { ast } = catalogue;

  if (target._tag === "External") {
    return Option.some({
      label: target.name,
      trait: HashMap.get(Trait.explained, target.name),
      entry: Option.none(),
    });
  }

  return ast.narrow(target.node, AST.Declaration.isDeclaration).pipe(
    Option.filter((id) => Option.isSome(Trait.namedTypeOf(ast, ast.get(id)))),
    Option.map((id) => {
      const declaration = ast.get(id);
      const entry = HashMap.get(catalogue.byId, id);

      return {
        label: Option.match(entry, {
          onNone: () => declaration.symbol.name,
          onSome: ({ name }) => Array.join(name.path, "."),
        }),
        trait: Trait.declaredBy(ast, declaration),
        entry,
      };
    }),
  );
};

/** Walks the bases of every public interface and class, keeping the private and external types between them. */
export const collect = (catalogue: Catalogue.Catalogue): Hierarchy => {
  const { ast } = catalogue;
  const locals = MutableHashMap.empty<number, number>();
  const externals = MutableHashMap.empty<number, number>();
  const vertices: Vertex[] = [];
  const bases: number[][] = [];

  const indexOf = (target: Target): Option.Option<number> => {
    if (target._tag === "Local") {
      return MutableHashMap.get(locals, target.node);
    }

    return MutableHashMap.get(externals, target.symbol.id);
  };

  const visit = (target: Target): Option.Option<number> => {
    const known = indexOf(target);
    if (Option.isSome(known)) {
      return known;
    }

    const described = describe(target, catalogue);
    if (Option.isNone(described)) {
      return Option.none();
    }

    const index = vertices.length;
    vertices.push({ target, ...described.value });
    bases.push([]);
    if (target._tag === "Local") {
      MutableHashMap.set(locals, target.node, index);
    } else {
      MutableHashMap.set(externals, target.symbol.id, index);
    }

    bases[index] = pipe(
      basesOf(ast, target),
      Array.flatMap((base) => Option.toArray(visit(base))),
      Array.dedupe,
    );

    return Option.some(index);
  };

  for (const entry of catalogue.entries) {
    if (Option.isSome(Trait.namedTypeOf(ast, ast.get(entry.id)))) {
      visit({ _tag: "Local", node: entry.id });
    }
  }

  const derived = Array.map(vertices, (): number[] => []);
  for (const [index, own] of bases.entries()) {
    for (const base of own) {
      derived[base]?.push(index);
    }
  }

  return { vertices, bases, derived, indexOf };
};

/** The positions `edges` reaches from `start` breadth first, without `start` itself, each once even through a cycle. */
const reach = (
  edges: readonly (readonly number[])[],
  start: number,
): readonly number[] => {
  const seen = new Set([start]);
  const reached: number[] = [];
  let frontier = [start];

  while (frontier.length > 0) {
    const next = pipe(
      frontier,
      Array.flatMap((current) => edges[current] ?? []),
      Array.dedupe,
      Array.filter((neighbour) => !seen.has(neighbour)),
    );
    for (const neighbour of next) {
      seen.add(neighbour);
    }
    reached.push(...next);
    frontier = next;
  }

  return reached;
};

/** Every type `index` extends or implements, nearest first. */
export const ancestorsOf: {
  (index: number): (hierarchy: Hierarchy) => readonly number[];
  (hierarchy: Hierarchy, index: number): readonly number[];
} = Function.dual(2, (hierarchy: Hierarchy, index: number) =>
  reach(hierarchy.bases, index),
);

/** Every type that extends or implements `index`, nearest first. */
export const descendantsOf: {
  (index: number): (hierarchy: Hierarchy) => readonly number[];
  (hierarchy: Hierarchy, index: number): readonly number[];
} = Function.dual(2, (hierarchy: Hierarchy, index: number) =>
  reach(hierarchy.derived, index),
);

/** The traits among the ancestors of `index`, nearest first. */
export const traitsOf: {
  (index: number): (hierarchy: Hierarchy) => readonly number[];
  (hierarchy: Hierarchy, index: number): readonly number[];
} = Function.dual(2, (hierarchy: Hierarchy, index: number) =>
  Array.filter(ancestorsOf(hierarchy, index), (ancestor) =>
    Option.exists(
      Option.fromUndefinedOr(hierarchy.vertices[ancestor]),
      ({ trait }) => Option.isSome(trait),
    ),
  ),
);
