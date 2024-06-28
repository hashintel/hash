import type { Vertex } from "../../../types/subgraph/vertices";

export type BaseIdToRevisions<GraphElementType extends Vertex["inner"]> =
  Record<
    /*
     * @todo - we _should_ be able to use `Extract<GraphElementForIdentifier<VertexId<any, any>>`
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
  GraphElementType extends Vertex["inner"],
>(
  elements: GraphElementType[],
): BaseIdToRevisions<GraphElementType> => {
  return elements.reduce((revisionMap, element) => {
    const baseId =
      "entityId" in element.metadata.recordId
        ? element.metadata.recordId.entityId
        : element.metadata.recordId.baseUrl;

    // eslint-disable-next-line no-param-reassign
    revisionMap[baseId] ??= [];
    revisionMap[baseId]!.push(element);

    return revisionMap;
  }, {} as BaseIdToRevisions<GraphElementType>);
};
