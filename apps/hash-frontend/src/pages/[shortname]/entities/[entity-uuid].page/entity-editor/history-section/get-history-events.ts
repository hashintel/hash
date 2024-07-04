import { extractBaseUrl, type VersionedUrl } from "@blockprotocol/type-system";
import { extractVersion } from "@blockprotocol/type-system/slim";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { EntityTypeIdDiff } from "@local/hash-graph-client";
import type { EntityId, PropertyPath } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type { Subgraph } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";

import type { EntityDiff } from "../../../../../../graphql/api-types.gen";
import type { HistoryEvent } from "./shared/types";

export const getHistoryEvents = (diffs: EntityDiff[], subgraph: Subgraph) => {
  const firstEditionIdentifier = [...subgraph.roots].sort((a, b) =>
    a.revisionId < b.revisionId ? -1 : 1,
  )[0];

  if (!firstEditionIdentifier) {
    throw new Error("No first edition for entity found in roots");
  }

  const firstEntityEdition = getEntityRevision(
    subgraph,
    firstEditionIdentifier.baseId as EntityId,
    firstEditionIdentifier.revisionId as Timestamp,
  );

  if (!firstEntityEdition) {
    throw new Error("No first edition for entity found in vertices");
  }

  const events: HistoryEvent[] = [];

  for (
    let changedEntityIndex = diffs.length - 1;
    changedEntityIndex >= 0;
    changedEntityIndex--
  ) {
    const diffData = diffs[changedEntityIndex]!;

    const changedEntityEdition = getEntityRevision(
      subgraph,
      diffData.input.secondEntityId,
      diffData.input.secondDecisionTime as Timestamp,
    );

    if (!changedEntityEdition) {
      throw new Error(
        `Could not find entity with id ${diffData.input.secondEntityId} in subgraph`,
      );
    }

    /**
     * The original edition is not included in the diffs, so the 0-based index needs +2 to get the nth edition with base 1
     */
    const editionNumber = changedEntityIndex + 2;

    let subChangeNumber = 1;

    const timestamp =
      changedEntityEdition.metadata.temporalVersioning.decisionTime.start.limit;

    const editionProvenance = changedEntityEdition.metadata.provenance.edition;

    if (diffData.diff.entityTypeIds) {
      const upgradedFromEntityTypeIds: VersionedUrl[] = [];

      const diffsWithAdditionsFirst = [...diffData.diff.entityTypeIds].sort(
        (a) => {
          return a.op === "added" ? -1 : 1;
        },
      );

      for (const entityTypeDiff of diffsWithAdditionsFirst) {
        const addedOrRemovedTypeId =
          entityTypeDiff.op === "added"
            ? (entityTypeDiff.added as VersionedUrl)
            : (entityTypeDiff.removed as VersionedUrl);
        const addedOrRemovedType = getEntityTypeById(
          subgraph,
          addedOrRemovedTypeId,
        );

        if (!addedOrRemovedType) {
          throw new Error(
            `Could not find entity type with id ${addedOrRemovedTypeId} in subgraph`,
          );
        }

        if (entityTypeDiff.op === "added") {
          const baseUrl = extractBaseUrl(entityTypeDiff.added as VersionedUrl);

          const removedOldVersion = diffData.diff.entityTypeIds.find(
            (
              entityTypeIdDiff,
            ): entityTypeIdDiff is EntityTypeIdDiff & { op: "removed" } =>
              entityTypeIdDiff.op === "removed" &&
              extractBaseUrl(entityTypeIdDiff.removed as VersionedUrl) ===
                baseUrl,
          );
          if (removedOldVersion) {
            upgradedFromEntityTypeIds.push(
              removedOldVersion.removed as VersionedUrl,
            );
          }

          events.push({
            type: "type-update",
            op: removedOldVersion ? "upgraded" : "added",
            number: `${editionNumber}.${subChangeNumber++}`,
            provenance: {
              edition: editionProvenance,
            },
            timestamp,
            entityType: {
              title: addedOrRemovedType.schema.title,
              version: addedOrRemovedType.metadata.recordId.version,
              oldVersion: removedOldVersion
                ? extractVersion(removedOldVersion.removed as VersionedUrl)
                : undefined,
            },
          });
        } else {
          const removed = entityTypeDiff.removed as VersionedUrl;
          if (upgradedFromEntityTypeIds.includes(removed)) {
            // we already captured this as an 'upgrade' event
            continue;
          }
          events.push({
            type: "type-update",
            op: "removed",
            number: `${editionNumber}.${subChangeNumber++}`,
            provenance: {
              edition: editionProvenance,
            },
            timestamp,
            entityType: {
              title: addedOrRemovedType.schema.title,
              version: addedOrRemovedType.metadata.recordId.version,
            },
          });
        }
      }
    }

    if (diffData.diff.properties) {
      for (const propertyDiff of diffData.diff.properties) {
        const propertyProvenance = changedEntityEdition.propertyMetadata(
          propertyDiff.path as PropertyPath,
        )?.provenance;

        /**
         * @todo H-2775 – handle property objects and changes to array contents
         */
        const propertyBaseUrl = propertyDiff.path[0] as BaseUrl;
        try {
          const propertyTypeWithMetadata = getPropertyTypeForEntity(
            subgraph,
            firstEntityEdition.metadata.entityTypeId,

            propertyBaseUrl,
          );

          events.push({
            number: `${editionNumber}.${subChangeNumber++}`,
            provenance: {
              edition: changedEntityEdition.metadata.provenance.edition,
              property: propertyProvenance,
            },
            propertyType: propertyTypeWithMetadata.propertyType,
            timestamp:
              changedEntityEdition.metadata.temporalVersioning.decisionTime
                .start.limit,
            type: "property-update",
            diff: propertyDiff,
          });
        } catch (err) {
          throw new Error(
            `Could not find property type with baseUrl ${propertyBaseUrl} for entity type with id ${firstEntityEdition.metadata.entityTypeId} in subgraph`,
          );
        }
      }
    }

    if (diffData.diff.draftState !== undefined) {
      const newDraftState = diffData.diff.draftState;
      events.push({
        number: `${editionNumber}.${subChangeNumber++}`,
        provenance: {
          edition: changedEntityEdition.metadata.provenance.edition,
        },
        newDraftStatus: newDraftState,
        timestamp,
        type: "draft-status-change",
      });
    }
  }

  for (const [index, [key, value]] of typedEntries(
    firstEntityEdition.properties,
  ).entries()) {
    /**
     * @todo H-2775 – handle property objects and changes to array contents
     */
    const propertyProvenance = firstEntityEdition.propertyMetadata([
      key,
    ])?.provenance;

    try {
      const propertyTypeWithMetadata = getPropertyTypeForEntity(
        subgraph,
        firstEntityEdition.metadata.entityTypeId,
        key,
      );

      events.push({
        number: `1.${index + 1}`,
        provenance: {
          edition: firstEntityEdition.metadata.provenance.edition,
          property: propertyProvenance,
        },
        propertyType: propertyTypeWithMetadata.propertyType,
        timestamp: firstEditionIdentifier.revisionId,
        type: "property-update",
        diff: {
          op: "added",
          /**
           * @todo H-2775 – handle property objects and changes to array contents
           */
          path: [key],
          added: value,
        },
      });
    } catch {
      throw new Error(
        `Could not find entity type with id ${firstEntityEdition.metadata.entityTypeId} in subgraph`,
      );
    }
  }

  const firstEntityType = getEntityTypeById(
    subgraph,
    firstEntityEdition.metadata.entityTypeId,
  );

  if (!firstEntityType) {
    throw new Error(
      `Could not find entity type with id ${firstEntityEdition.metadata.entityTypeId} in subgraph`,
    );
  }

  events.push({
    type: "created",
    number: "1",
    entity: firstEntityEdition,
    entityType: firstEntityType.schema,
    timestamp: firstEditionIdentifier.revisionId,
    provenance: {
      edition: firstEntityEdition.metadata.provenance.edition,
    },
  });

  return events;
};
