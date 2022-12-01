import { useMemo } from "react";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { getOutgoingLinkAndTargetEntitiesAtMoment } from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { VersionedUri } from "@hashintel/hash-subgraph";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRowData = () => {
  const { entitySubgraph, entityTypeSubgraph } = useEntityEditor();

  const rowData = useMemo<LinkRow[]>(() => {
    const entity = getRoots(entitySubgraph)[0]!;
    const entityType = getRoots(entityTypeSubgraph)[0]!;

    const outgoingLinkAndTargetEntitiesAtMoment =
      getOutgoingLinkAndTargetEntitiesAtMoment(
        entitySubgraph,
        entity.metadata.editionId.baseId,
        /** @todo - We probably want to use entity endTime - https://app.asana.com/0/1201095311341924/1203331904553375/f */
        new Date(),
      );

    const linkSchemas = entityType.schema.links;

    if (!linkSchemas) {
      return [];
    }

    return Object.keys(linkSchemas).map((key) => {
      const linkEntityTypeId = key as VersionedUri;
      const linkSchema = linkSchemas[linkEntityTypeId]!;

      const linkEntityType = getEntityTypeById(
        entityTypeSubgraph,
        linkEntityTypeId,
      );

      if (!("oneOf" in linkSchema.items)) {
        throw new Error("oneOf not found inside linkSchema.items");
      }

      const linkAndTargetEntities =
        outgoingLinkAndTargetEntitiesAtMoment.filter(
          ({ linkEntity }) =>
            linkEntity.metadata.entityTypeId === linkEntityTypeId,
        );

      const expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
        return getEntityTypeById(entityTypeSubgraph, $ref);
      });

      const expectedEntityTypeTitles = expectedEntityTypes.map((val) => {
        return val?.schema.title;
      });

      return {
        rowId: linkEntityTypeId,
        linkEntityTypeId,
        linkTitle: linkEntityType?.schema.title,
        linkAndTargetEntities,
        maxItems: linkSchema.maxItems ?? 1,
        expectedEntityTypes,
        expectedEntityTypeTitles,
      } as LinkRow;
    });
  }, [entitySubgraph, entityTypeSubgraph]);

  return rowData;
};
