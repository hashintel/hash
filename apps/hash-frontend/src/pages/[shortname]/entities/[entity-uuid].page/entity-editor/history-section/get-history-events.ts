import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  BaseUrl,
  EntityId,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
import { isEqual } from "lodash";

import type { EntityDiff } from "../../../../../../graphql/api-types.gen";
import type { HistoryEvent } from "./history-table";

export const getHistoryEvents = (diffs: EntityDiff[], subgraph: Subgraph) => {
  const firstEditionIdentifier = subgraph.roots[0];
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

  const entityTypeWithMetadata = getEntityTypeById(
    subgraph,
    firstEntityEdition.metadata.entityTypeId,
  );

  if (!entityTypeWithMetadata) {
    throw new Error(
      `Could not find entity type with id ${firstEntityEdition.metadata.entityTypeId} in subgraph`,
    );
  }

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
     * @todo H-2774 – also handle 'changed type' and 'change draft status' events
     */

    for (const [
      changedPropertyIndex,
      propertyDiff,
    ] of diffData.diff.properties.entries()) {
      const propertyProvenance = changedEntityEdition.metadata.properties?.find(
        (map) => isEqual(map.path, propertyDiff.path),
      );

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
          /**
           * The original entity is not included in the diffs, so the 0-based index needs +2
           */
          number: `${changedEntityIndex + 2}.${changedPropertyIndex + 1}`,
          provenance: {
            edition: changedEntityEdition.metadata.provenance.edition,
            property: propertyProvenance?.metadata.provenance,
          },
          propertyType: propertyTypeWithMetadata.propertyType,
          timestamp:
            changedEntityEdition.metadata.temporalVersioning.decisionTime.start
              .limit,
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

  for (const [index, [key, value]] of typedEntries(
    firstEntityEdition.properties,
  ).entries()) {
    const propertyProvenance = firstEntityEdition.metadata.properties?.find(
      /**
       * @todo H-2775 – handle property objects and changes to array contents
       */
      (map) => map.path[0] === key,
    );

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
          property: propertyProvenance?.metadata.provenance,
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

  events.push({
    type: "created",
    number: "1",
    entity: firstEntityEdition,
    entityType: entityTypeWithMetadata.schema,
    timestamp: firstEditionIdentifier.revisionId,
    provenance: {
      edition: firstEntityEdition.metadata.provenance.edition,
    },
  });

  return events;
};
