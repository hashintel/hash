import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  Entity,
  EntityTypeWithMetadata,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getOutgoingLinkAndTargetEntities,
  getRoots,
  intervalCompareWithInterval,
} from "@local/hash-subgraph/stdlib";
import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";

import { useGetOwnerForEntity } from "../../../../../../../components/hooks/use-get-owner-for-entity";
import { useEntityTypesContextRequired } from "../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../shared/file-upload-context";
import { useMarkLinkEntityToArchive } from "../../../shared/use-mark-link-entity-to-archive";
import { useEntityEditor } from "../../entity-editor-context";
import { LinkRow } from "./types";

export const useRows = () => {
  const router = useRouter();
  const { entitySubgraph, draftLinksToArchive, draftLinksToCreate } =
    useEntityEditor();

  const markLinkEntityToArchive = useMarkLinkEntityToArchive();

  const getOwnerForEntity = useGetOwnerForEntity();

  const onEntityClick = useCallback(
    (params: { entity: Entity }) => {
      const { entity } = params;

      const { shortname } = getOwnerForEntity(entity);

      void router.push(
        `/@${shortname}/entities/${extractEntityUuidFromEntityId(
          entity.metadata.recordId.entityId,
        )}`,
      );
    },
    [getOwnerForEntity, router],
  );

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { uploads } = useFileUploads();

  const rows = useMemo<LinkRow[]>(() => {
    const entity = getRoots(entitySubgraph)[0]!;
    const entityTypeAndAncestors = getEntityTypeAndParentsById(
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

    return entityTypeAndAncestors.flatMap((entityType) =>
      typedEntries(entityType.schema.links ?? {}).map(
        ([linkEntityTypeId, linkSchema]) => {
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

          const additions = draftLinksToCreate.filter(
            (draftToCreate) =>
              draftToCreate.linkEntity.metadata.entityTypeId ===
              linkEntityTypeId,
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

            const { entityTypeId, recordId } =
              latestLinkEntityRevision.metadata;

            const isMatching = entityTypeId === linkEntityTypeId;
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

          const expectedEntityTypeTitles = expectedEntityTypes.map(
            (val) => val.schema.title,
          );

          const isFile = expectedEntityTypes.some(
            (expectedType) =>
              isSpecialEntityTypeLookup?.[expectedType.schema.$id]?.isFile,
          );

          return {
            rowId: linkEntityTypeId,
            linkEntityTypeId,
            linkTitle: linkEntityType.schema.title,
            linkAndTargetEntities,
            maxItems: linkSchema.maxItems,
            isFile,
            isLoading,
            isList:
              linkSchema.maxItems === undefined || linkSchema.maxItems > 1,
            expectedEntityTypes,
            expectedEntityTypeTitles,
            entitySubgraph,
            markLinkAsArchived: markLinkEntityToArchive,
            onEntityClick,
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
  ]);

  return rows;
};
