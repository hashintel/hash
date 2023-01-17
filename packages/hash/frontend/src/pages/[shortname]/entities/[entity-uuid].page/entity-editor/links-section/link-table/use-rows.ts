import { VersionedUri } from "@hashintel/hash-subgraph";
import { getOutgoingLinkAndTargetEntitiesAtMoment } from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useMemo } from "react";

import { useMarkLinkEntityToArchive } from "../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRows = () => {
  const { entitySubgraph, draftLinksToArchive, draftLinksToCreate } =
    useEntityEditor();

  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const rows = useMemo<LinkRow[]>(() => {
    const entity = getRoots(entitySubgraph)[0]!;
    const entityType = getEntityTypeById(
      entitySubgraph,
      entity.metadata.entityTypeId,
    );

    const outgoingLinkAndTargetEntitiesAtMoment =
      getOutgoingLinkAndTargetEntitiesAtMoment(
        entitySubgraph,
        entity.metadata.editionId.baseId,
        /** @todo - We probably want to use entity endTime - https://app.asana.com/0/1201095311341924/1203331904553375/f */
        new Date(),
      );

    const linkSchemas = entityType?.schema.links;

    if (!linkSchemas) {
      return [];
    }

    return Object.entries(linkSchemas).map<LinkRow>(([key, linkSchema]) => {
      const linkEntityTypeId = key as VersionedUri;

      const linkEntityType = getEntityTypeById(
        entitySubgraph,
        linkEntityTypeId,
      );

      if (!("oneOf" in linkSchema.items)) {
        throw new Error("oneOf not found inside linkSchema.items");
      }

      const additions = draftLinksToCreate.filter(
        (draftToCreate) =>
          draftToCreate.linkEntity.metadata.entityTypeId === linkEntityTypeId,
      );

      const linkAndTargetEntities =
        outgoingLinkAndTargetEntitiesAtMoment.filter((entities) => {
          const { entityTypeId, editionId } = entities.linkEntity.metadata;

          const isMatching = entityTypeId === linkEntityTypeId;
          const isMarkedToArchive = draftLinksToArchive.some(
            (markedLinkId) => markedLinkId === editionId.baseId,
          );

          return isMatching && !isMarkedToArchive;
        });

      linkAndTargetEntities.push(...additions);

      const expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
        const expectedEntityType = getEntityTypeById(entitySubgraph, $ref);

        if (!expectedEntityType) {
          throw new Error("entity type not found");
        }

        return expectedEntityType;
      });

      const expectedEntityTypeTitles = expectedEntityTypes.map(
        (val) => val.schema.title,
      );

      return {
        rowId: linkEntityTypeId,
        linkEntityTypeId,
        linkTitle: linkEntityType?.schema.title ?? "",
        linkAndTargetEntities,
        maxItems: linkSchema.maxItems ?? 1,
        expectedEntityTypes,
        expectedEntityTypeTitles,
        entitySubgraph,
        markLinkAsArchived: markLinkEntityToArchive,
      };
    });
  }, [
    entitySubgraph,
    draftLinksToArchive,
    draftLinksToCreate,
    markLinkEntityToArchive,
  ]);

  return rows;
};
