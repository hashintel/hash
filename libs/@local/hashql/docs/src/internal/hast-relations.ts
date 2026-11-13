import { Array, Option, Result, pipe } from "effect";

import * as Content from "./hast-content.js";
import * as Output from "./output.js";
import * as Titles from "./titles.js";

import type * as Tree from "../Tree/index.js";
import type { Element } from "hast";

type Written<A> = Result.Result<A, Output.Failure>;

const hierarchyNode =
  (output: Output.Output) =>
  (node: Tree.Hierarchy.HierarchyNode, index: number): Written<Element> =>
    Result.succeed(
      Content.element("hierarchy-node")(
        {
          index,
          role: node.role,
          label: node.label,
          href: Option.getOrUndefined(Output.hierarchyNode(output)(node)),
        },
        [],
      ),
    );

/**
 * The graph as one element for each node and one for each edge, which names its nodes by their position.
 *
 * It belongs to the declaration the graph is around, so it fills a `slot` of the element it is in: `title`, the line that names an export's declarations, or `header`, the heading of a trait or of an export without declarations.
 */
export const hierarchy =
  ({
    output,
    name,
    slot,
  }: {
    readonly output: Output.Output;
    readonly name: string;
    readonly slot: "title" | "header";
  }) =>
  (value: Tree.Hierarchy.Hierarchy): Written<Element> =>
    Result.all(Array.map(value.nodes, hierarchyNode(output))).pipe(
      Result.map((nodes) => {
        const positionOf = (node: Tree.Hierarchy.HierarchyNode): number =>
          value.nodes.indexOf(node);
        const edges = Array.map(value.edges, ({ base, derived }) =>
          Content.element("hierarchy-edge")(
            { base: positionOf(base), derived: positionOf(derived) },
            [],
          ),
        );

        return Content.element("hierarchy")({ name, slot }, [
          ...nodes,
          ...edges,
        ]);
      }),
    );

/** The relations that follow an entry's declarations: the export that shares its name with the other meaning, and the traits it implements. */
export const own = ["type", "value", "traits"] as const;

/** The relations that close an entry, before a merged namespace. */
export const uses = ["implementedBy", "acceptedBy", "returnedBy"] as const;

export const related =
  (output: Output.Output) =>
  (
    value: Tree.Row.Related,
    relations: readonly (keyof Tree.Row.Related)[],
  ): Written<Element[]> =>
    pipe(
      relations,
      Array.filter((relation) => value[relation].length > 0),
      Array.map((relation) =>
        Content.rows(output)(value[relation]).pipe(
          Result.map((rows) =>
            Content.element("relation")(
              { relation, title: Titles.related[relation] },
              rows,
            ),
          ),
        ),
      ),
      Result.all,
      Result.map((elements) => {
        if (elements.length === 0) {
          return [];
        }

        return [Content.element("related")({}, elements)];
      }),
    );
