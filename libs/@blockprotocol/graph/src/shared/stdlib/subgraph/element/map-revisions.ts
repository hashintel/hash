import { Vertex } from "../../../types/subgraph/vertices.js";

export type BaseIdToRevisions<
  Temporal extends boolean,
  GraphElementType extends Vertex<Temporal>["inner"],
> = Record<
  /*
   * @todo - we _should_ be able to use `Extract<GraphElementForIdentifier<Temporal, VertexId<any, any>>`
   *   here to actually get a strong type (like `EntityId` or `BaseUrl`). TypeScript seems to break on using it with a
   *   generic though. So for now we write `string` because all of the baseId's of `VertexId` are string aliases anyway.
   */
  string,
  GraphElementType[]
>;

/**
 * Takes a collection of graph elements, and returns an object that groups them by their base IDs, mapping the IDs to
 * the collection of revisions.
 *
 * @param elements
 */
export const mapElementsIntoRevisions = <
  Temporal extends boolean,
  GraphElementType extends Vertex<Temporal>["inner"],
>(
  elements: GraphElementType[],
): BaseIdToRevisions<Temporal, GraphElementType> => {
  return elements.reduce(
    (revisionMap, element) => {
      const baseId =
        "entityId" in element.metadata.recordId
          ? element.metadata.recordId.entityId
          : element.metadata.recordId.baseUrl;

      // eslint-disable-next-line no-param-reassign
      revisionMap[baseId] ??= [];
      revisionMap[baseId]!.push(element);

      return revisionMap;
    },
    {} as BaseIdToRevisions<Temporal, GraphElementType>,
  );
};
