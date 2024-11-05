import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import {
  getBreadthFirstEntityTypesAndParents,
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalCompareWithInterval,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../shared/file-upload-context";
import { useMarkLinkEntityToArchive } from "../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../entity-editor-context";
import type { LinkRow } from "./types";

export const useRows = () => {
  const {
    entitySubgraph,
    draftLinksToArchive,
    draftLinksToCreate,
    onEntityClick,
  } = useEntityEditor();

  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { uploads, uploadFile } = useFileUploads();

  const rows = useMemo<LinkRow[]>(() => {
    const entity = getRoots(entitySubgraph)[0]!;
    const entityTypesAndAncestors = getBreadthFirstEntityTypesAndParents(
      entitySubgraph,
      entity.metadata.entityTypeIds,
    );

    const variableAxis = entitySubgraph.temporalAxes.resolved.variable.axis;
    const entityInterval = entity.metadata.temporalVersioning[variableAxis];

    const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
      entitySubgraph,
      entity.metadata.recordId.entityId,
      entityInterval,
    );

    const processedLinkEntityTypeIds = new Set<VersionedUrl>();

    return entityTypesAndAncestors.flatMap((entityType) =>
      typedEntries(entityType.schema.links ?? {}).flatMap(
        ([linkEntityTypeId, linkSchema]) => {
          if (processedLinkEntityTypeIds.has(linkEntityTypeId)) {
            return [];
          }

          const linkEntityType = getEntityTypeById(
            entitySubgraph,
            linkEntityTypeId,
          );

          if (!linkEntityType) {
            throw new Error(
              `Could not find link entity type with id ${linkEntityTypeId} in subgraph`,
            );
          }

          const relevantUpload = uploads.find(
            (upload) =>
              upload.status !== "complete" &&
              upload.linkedEntityData?.linkedEntityId ===
                entity.metadata.recordId.entityId &&
              upload.linkedEntityData.linkEntityTypeId === linkEntityTypeId,
          );

          const isLoading =
            !!relevantUpload &&
            relevantUpload.status !== "complete" &&
            relevantUpload.status !== "error";

          const isErroredUpload = relevantUpload?.status === "error";

          let expectedEntityTypes: EntityTypeWithMetadata[] = [];

          if ("oneOf" in linkSchema.items) {
            expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
              const expectedEntityType = getEntityTypeById(
                entitySubgraph,
                $ref,
              );

              if (!expectedEntityType) {
                throw new Error("entity type not found");
              }

              return expectedEntityType;
            });
          }

          const additions = draftLinksToCreate.filter((draftToCreate) =>
            draftToCreate.linkEntity.metadata.entityTypeIds.includes(
              linkEntityTypeId,
            ),
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

            const { entityTypeIds, recordId } =
              latestLinkEntityRevision.metadata;

            const isMatching = entityTypeIds.includes(linkEntityTypeId);
            const isMarkedToArchive = draftLinksToArchive.some(
              (markedLinkId) => markedLinkId === recordId.entityId,
            );

            if (isMatching && !isMarkedToArchive) {
              linkAndTargetEntities.push({
                linkEntity: latestLinkEntityRevision,
                rightEntity: latestTargetEntityRevision,
                sourceSubgraph: entitySubgraph,
              });
            }
          }

          linkAndTargetEntities.push(...additions);

          const isFile = expectedEntityTypes.some(
            (expectedType) =>
              isSpecialEntityTypeLookup?.[expectedType.schema.$id]?.isFile,
          );

          const retryErroredUpload =
            relevantUpload?.status === "error"
              ? () => uploadFile(relevantUpload)
              : undefined;

          processedLinkEntityTypeIds.add(linkEntityTypeId);

          return {
            rowId: linkEntityTypeId,
            linkEntityTypeId,
            linkTitle: linkEntityType.schema.title,
            linkAndTargetEntities,
            maxItems: linkSchema.maxItems,
            isErroredUpload,
            isFile,
            isUploading: isLoading,
            isList:
              linkSchema.maxItems === undefined || linkSchema.maxItems > 1,
            expectedEntityTypes,
            entitySubgraph,
            markLinkAsArchived: markLinkEntityToArchive,
            onEntityClick,
            retryErroredUpload,
          };
        },
      ),
    );
  }, [
    entitySubgraph,
    draftLinksToArchive,
    draftLinksToCreate,
    isSpecialEntityTypeLookup,
    markLinkEntityToArchive,
    onEntityClick,
    uploads,
    uploadFile,
  ]);

  return rows;
};
