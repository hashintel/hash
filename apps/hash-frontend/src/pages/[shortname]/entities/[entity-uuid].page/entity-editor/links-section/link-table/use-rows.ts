import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalCompareWithInterval,
} from "@local/hash-subgraph/stdlib";
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

    const variableAxis = entitySubgraph.temporalAxes.resolved.variable.axis;
    const entityInterval = entity.metadata.temporalVersioning[variableAxis];

    const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
      entitySubgraph,
      entity.metadata.recordId.entityId,
      entityInterval,
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

      let expectedEntityTypes: EntityTypeWithMetadata[] = [];

      if ("oneOf" in linkSchema.items) {
        expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
          const expectedEntityType = getEntityTypeById(entitySubgraph, $ref);

          if (!expectedEntityType) {
            throw new Error("entity type not found");
          }

          return expectedEntityType;
        });
      }

      const additions = draftLinksToCreate.filter(
        (draftToCreate) =>
          draftToCreate.linkEntity.metadata.entityTypeId === linkEntityTypeId,
      );

      const linkAndTargetEntities = [];

      for (const entities of outgoingLinkAndTargetEntities) {
        const linkEntityRevisions = [...entities.linkEntity];
        linkEntityRevisions.sort((entityA, entityB) =>
          intervalCompareWithInterval(
            entityA.metadata.temporalVersioning[variableAxis],
            entityB.metadata.temporalVersioning[variableAxis],
          ),
        );

        const latestLinkEntityRevision = linkEntityRevisions.at(-1);

        if (!latestLinkEntityRevision) {
          throw new Error(
            `Couldn't find a latest link entity revision from ${entity.metadata.recordId.entityId}, this is likely an implementation bug in the stdlib`,
          );
        }

        const targetEntityRevisions = [...entities.rightEntity];
        targetEntityRevisions.sort((entityA, entityB) =>
          intervalCompareWithInterval(
            entityA.metadata.temporalVersioning[variableAxis],
            entityB.metadata.temporalVersioning[variableAxis],
          ),
        );

        const latestTargetEntityRevision = targetEntityRevisions.at(-1);

        if (!latestTargetEntityRevision) {
          throw new Error(
            `Couldn't find a target link entity revision from ${entity.metadata.recordId.entityId}, this is likely an implementation bug in the stdlib`,
          );
        }

        const { entityTypeId, recordId } = latestLinkEntityRevision.metadata;

        const isMatching = entityTypeId === linkEntityTypeId;
        const isMarkedToArchive = draftLinksToArchive.some(
          (markedLinkId) => markedLinkId === recordId.entityId,
        );

        if (isMatching && !isMarkedToArchive) {
          linkAndTargetEntities.push({
            linkEntity: latestLinkEntityRevision,
            rightEntity: latestTargetEntityRevision,
          });
        }
      }

      linkAndTargetEntities.push(...additions);

      const expectedEntityTypeTitles = expectedEntityTypes.map(
        (val) => val.schema.title,
      );

      return {
        rowId: linkEntityTypeId,
        linkEntityTypeId,
        linkTitle: linkEntityType?.schema.title ?? "",
        linkAndTargetEntities,
        maxItems: linkSchema.maxItems,
        isList: linkSchema.maxItems === undefined || linkSchema.maxItems > 1,
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
