import { Array, Function, HashMap, Option, Result, String, pipe } from "effect";

import * as Content from "./Content.js";
import * as Hierarchy from "./Hierarchy.js";
import * as Prose from "./Prose.js";
import * as Trait from "./Trait.js";
import * as Tree from "./Tree/index.js";
import * as Usage from "./Usage.js";

import type * as AST from "./AST/index.js";
import type * as Catalogue from "./Catalogue.js";

type Target = AST.Reference.Reference.Target;
type Local = Extract<Target, { readonly _tag: "Local" }>;

/** The hierarchy of the public types and who uses each declaration, with every trait by its position in the hierarchy. */
export interface Index {
  readonly hierarchy: Hierarchy.Hierarchy;
  readonly usage: Usage.Index;
  readonly traits: HashMap.HashMap<number, Described>;
}

/** The exports related to one, before the page that shows them turns them into rows. */
export interface Relations extends Usage.Usage {
  /** The traits it implements, as positions in the hierarchy. */
  readonly traits: readonly number[];
  /** The public types that implement it, when it is a trait. */
  readonly implementedBy: readonly Local[];
  readonly hierarchy: Option.Option<Tree.Hierarchy.Hierarchy>;
}

/** A public declaration, an external type and a trait are shown in a hierarchy. A private type is not, and its bases take its place. */
const isShown = (vertex: Hierarchy.Vertex): boolean =>
  Option.isSome(vertex.entry) ||
  vertex.target._tag === "External" ||
  Option.isSome(vertex.trait);

const vertexAt = (
  hierarchy: Hierarchy.Hierarchy,
  index: number,
): Option.Option<Hierarchy.Vertex> =>
  Option.fromUndefinedOr(hierarchy.vertices[index]);

/** The nearest shown bases of `index`, looking through private types, each once even through a cycle. */
const shownBases = (
  hierarchy: Hierarchy.Hierarchy,
  index: number,
): readonly number[] => {
  const seen = new Set([index]);
  const pending = Array.copy(hierarchy.bases[index] ?? []);
  const shown: number[] = [];

  for (const base of pending) {
    if (!seen.has(base)) {
      seen.add(base);
      if (Option.exists(vertexAt(hierarchy, base), isShown)) {
        shown.push(base);
      } else {
        pending.push(...(hierarchy.bases[base] ?? []));
      }
    }
  }

  return shown;
};

const roleOf = (
  vertex: Hierarchy.Vertex,
  current: boolean,
): Tree.Hierarchy.HierarchyNode["role"] => {
  if (current) {
    return "current";
  }

  if (Option.isSome(vertex.trait)) {
    return "trait";
  }

  return vertex.target._tag === "External" ? "external" : "type";
};

/** The hierarchy around `index`: its ancestors and descendants that are shown, with an edge from each to its nearest shown bases. None when it has no edge. */
export const graphOf: {
  (
    index: number,
  ): (
    hierarchy: Hierarchy.Hierarchy,
  ) => Option.Option<Tree.Hierarchy.Hierarchy>;
  (
    hierarchy: Hierarchy.Hierarchy,
    index: number,
  ): Option.Option<Tree.Hierarchy.Hierarchy>;
} = Function.dual(
  2,
  (
    hierarchy: Hierarchy.Hierarchy,
    index: number,
  ): Option.Option<Tree.Hierarchy.Hierarchy> => {
    const members = pipe(
      Array.flatten([
        Hierarchy.ancestorsOf(hierarchy, index),
        [index],
        Hierarchy.descendantsOf(hierarchy, index),
      ]),
      Array.dedupe,
      Array.flatMap((member) =>
        vertexAt(hierarchy, member).pipe(
          Option.filter((vertex) => member === index || isShown(vertex)),
          Option.map(
            (vertex): readonly [number, Tree.Hierarchy.HierarchyNode] => [
              member,
              {
                type: "hierarchyNode",
                role: roleOf(vertex, member === index),
                label: vertex.label,
                origin: vertex.target,
              },
            ],
          ),
          Option.toArray,
        ),
      ),
    );
    const nodeAt = (
      member: number,
    ): Option.Option<Tree.Hierarchy.HierarchyNode> =>
      Array.findFirst(members, ([candidate]) => candidate === member).pipe(
        Option.map(([, node]) => node),
      );
    const edges = Array.flatMap(members, ([member, derived]) =>
      Array.flatMap(shownBases(hierarchy, member), (base) =>
        nodeAt(base).pipe(
          Option.map((node): Tree.Hierarchy.Edge => ({ base: node, derived })),
          Option.toArray,
        ),
      ),
    );

    return Option.all({
      current: vertexAt(hierarchy, index),
      nodes: Option.liftPredicate(
        Array.map(members, ([, node]) => node),
        Array.isReadonlyArrayNonEmpty<Tree.Hierarchy.HierarchyNode>,
      ),
      edges: Option.liftPredicate(
        edges,
        Array.isReadonlyArrayNonEmpty<Tree.Hierarchy.Edge>,
      ),
    }).pipe(
      Option.map(({ current, nodes, edges: nonEmpty }) => ({
        type: "hierarchy",
        nodes,
        edges: nonEmpty,
        origin: current.target,
      })),
    );
  },
);

/** The public types below `index` in the hierarchy, nearest first. */
const implementorsOf = (
  hierarchy: Hierarchy.Hierarchy,
  index: number,
): readonly Local[] =>
  Array.flatMap(Hierarchy.descendantsOf(hierarchy, index), (descendant) =>
    vertexAt(hierarchy, descendant).pipe(
      Option.flatMap(({ entry }) => entry),
      Option.map(({ id }): Local => ({ _tag: "Local", node: id })),
      Option.toArray,
    ),
  );

/** The traits, implementors, users and hierarchy of a public declaration. */
export const of: {
  (index: Index): (entry: Catalogue.Entry) => Relations;
  (entry: Catalogue.Entry, index: Index): Relations;
} = Function.dual(
  2,
  (entry: Catalogue.Entry, { hierarchy, usage }: Index): Relations => {
    const index = hierarchy.indexOf({ _tag: "Local", node: entry.id });
    const isTrait = Option.exists(
      Option.flatMap(index, (own) => vertexAt(hierarchy, own)),
      ({ trait }) => Option.isSome(trait),
    );

    return {
      ...Usage.of(usage, entry.id),
      traits: Option.match(index, {
        onNone: () => [],
        onSome: (own) => Hierarchy.traitsOf(hierarchy, own),
      }),
      implementedBy: Option.match(
        Option.filter(index, () => isTrait),
        {
          onNone: () => [],
          onSome: (own) => implementorsOf(hierarchy, own),
        },
      ),
      hierarchy: Option.flatMap(index, (own) => graphOf(hierarchy, own)),
    };
  },
);

/** A trait the hierarchy holds, with its description, its implementors and its hierarchy, before the traits page turns its implementors into rows. */
export interface Described {
  readonly index: number;
  readonly vertex: Hierarchy.Vertex;
  readonly description: Tree.Trait.Trait["description"];
  readonly implementors: readonly Local[];
  readonly hierarchy: Option.Option<Tree.Hierarchy.Hierarchy>;
}

/** Every trait in the hierarchy. A trait's description is its own comment, or the reference's explanation of an external one. */
const traitsOf = (
  hierarchy: Hierarchy.Hierarchy,
  content: Content.Context,
): Result.Result<readonly Described[], Content.Failure> =>
  pipe(
    hierarchy.vertices,
    Array.flatMap((vertex, index) =>
      Option.toArray(
        Option.map(vertex.trait, (trait) => ({ vertex, index, trait })),
      ),
    ),
    Array.sortWith(({ vertex }) => vertex.label, String.Order),
    Array.map(({ vertex, index, trait }) =>
      Trait.match(trait, {
        Explained: (explained) =>
          Result.succeed<Tree.Trait.Trait["description"]>({
            type: "explanation",
            children: [Prose.explanation(explained)],
            guide: explained.guide,
            origin: explained,
          }),
        Declared: ({ documentation }) =>
          Content.fromDocumentation(documentation, content).pipe(
            Result.map(Content.documenting(Tree.Callable.whole)),
          ),
      }).pipe(
        Result.map((description): Described => ({
          index,
          vertex,
          description,
          implementors: implementorsOf(hierarchy, index),
          hierarchy: graphOf(hierarchy, index),
        })),
      ),
    ),
    Result.all,
  );

/** Collects how the catalogue's public declarations relate: their hierarchy and their uses, with a description of every trait. */
export const collect = (
  catalogue: Catalogue.Catalogue,
): Result.Result<Index, Content.Failure> => {
  const hierarchy = Hierarchy.collect(catalogue);

  return traitsOf(hierarchy, Content.contextOf(catalogue.ast)).pipe(
    Result.map((traits): Index => ({
      hierarchy,
      usage: Usage.collect(catalogue),
      traits: HashMap.fromIterable(
        Array.map(traits, (trait) => [trait.index, trait] as const),
      ),
    })),
  );
};
