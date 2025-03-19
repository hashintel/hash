import { intervalCompareWithInterval } from "@blockprotocol/graph/stdlib";
import type {
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../shared/file-upload-context";
import { useMarkLinkEntityToArchive } from "../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../entity-editor-context";
import type { LinkRow } from "./types";

export const useRows = () => {
  const {
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
    closedMultiEntityTypesMap,
    entity,
    entitySubgraph,
    draftLinksToArchive,
    draftLinksToCreate,
    onEntityClick,
  } = useEntityEditor();

  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { uploads, uploadFile } = useFileUploads();

  const rows = useMemo<LinkRow[]>(() => {
    const variableAxis = entitySubgraph.temporalAxes.resolved.variable.axis;
    const entityInterval = entity.metadata.temporalVersioning[variableAxis];

    const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
      entitySubgraph,
      entity.metadata.recordId.entityId,
      entityInterval,
    );

    const processedLinkEntityTypeIds = new Set<VersionedUrl>();

    return typedEntries(closedMultiEntityType.links ?? {}).flatMap(
      ([linkEntityTypeId, linkSchema]) => {
        if (processedLinkEntityTypeIds.has(linkEntityTypeId)) {
          return [];
        }

        const linkEntityType =
          closedMultiEntityTypesDefinitions.entityTypes[linkEntityTypeId];

        if (!linkEntityType) {
          throw new Error(
            `Could not find link entity type with id ${linkEntityTypeId} in definitions`,
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

        let expectedEntityTypes: PartialEntityType[] = [];

        if ("oneOf" in linkSchema.items) {
          expectedEntityTypes = linkSchema.items.oneOf.map(({ $ref }) => {
            const expectedEntityType =
              closedMultiEntityTypesDefinitions.entityTypes[$ref];

            if (!expectedEntityType) {
              throw new Error(`entity type ${$ref} not found in definitions`);
            }

            return expectedEntityType;
          });
        }

        const additions = draftLinksToCreate.filter((draftToCreate) =>
          draftToCreate.linkEntity.metadata.entityTypeIds.includes(
            linkEntityTypeId,
          ),
        );

        const linkAndTargetEntities: LinkRow["linkAndTargetEntities"] = [];

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

          const { entityTypeIds, recordId } = latestLinkEntityRevision.metadata;

          const isMatching = entityTypeIds.includes(linkEntityTypeId);
          const isMarkedToArchive = draftLinksToArchive.some(
            (markedLinkId) => markedLinkId === recordId.entityId,
          );

          if (!isMatching || isMarkedToArchive) {
            continue;
          }

          if (!closedMultiEntityTypesMap) {
            throw new Error("Expected closedMultiEntityTypesMap to be defined");
          }

          const targetEntityClosedType = getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesMap,
            latestTargetEntityRevision.metadata.entityTypeIds,
          );

          const rightEntityLabel = generateEntityLabel(
            targetEntityClosedType,
            latestTargetEntityRevision,
          );

          const linkEntityClosedType = getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesMap,
            latestLinkEntityRevision.metadata.entityTypeIds,
          );

          const linkEntityLabel = generateEntityLabel(
            linkEntityClosedType,
            latestLinkEntityRevision,
          );

          linkAndTargetEntities.push({
            linkEntity: latestLinkEntityRevision,
            linkEntityLabel,
            rightEntity: latestTargetEntityRevision,
            rightEntityLabel,
          });
        }

        linkAndTargetEntities.push(...additions);

        const isFile = expectedEntityTypes.some(
          (expectedType) =>
            isSpecialEntityTypeLookup?.[expectedType.$id]?.isFile,
        );

        const retryErroredUpload =
          relevantUpload?.status === "error"
            ? () => uploadFile(relevantUpload)
            : undefined;

        processedLinkEntityTypeIds.add(linkEntityTypeId);

        return {
          rowId: linkEntityTypeId,
          linkEntityTypeId,
          linkTitle: linkEntityType.title,
          linkAndTargetEntities,
          maxItems: linkSchema.maxItems,
          isErroredUpload,
          isFile,
          isUploading: isLoading,
          isList: linkSchema.maxItems === undefined || linkSchema.maxItems > 1,
          expectedEntityTypes,
          entitySubgraph,
          markLinkAsArchived: markLinkEntityToArchive,
          onEntityClick,
          retryErroredUpload,
        };
      },
    );
  }, [
    closedMultiEntityType,
    closedMultiEntityTypesMap,
    closedMultiEntityTypesDefinitions,
    entitySubgraph,
    entity,
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
