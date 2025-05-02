import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractBaseUrl,
  extractVersion,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  getPropertyTypeForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { useCallback } from "react";

import { useGetClosedMultiEntityTypes } from "../../../use-get-closed-multi-entity-type";
import { useEntityEditor } from "../entity-editor-context";
import type { EntityTypeChangeDetails } from "./entity-type-change-modal";

export const useGetTypeChangeDetails = () => {
  const { getClosedMultiEntityTypes } = useGetClosedMultiEntityTypes();

  const {
    closedMultiEntityType: currentClosedType,
    closedMultiEntityTypesDefinitions: currentDefinitions,
  } = useEntityEditor();

  return useCallback(
    async (
      newEntityTypeIds: VersionedUrl[],
    ): Promise<
      Pick<EntityTypeChangeDetails, "linkChanges" | "propertyChanges">
    > => {
      const {
        closedMultiEntityTypes,
        closedMultiEntityTypesDefinitions: proposedDefinitions,
      } = await getClosedMultiEntityTypes([newEntityTypeIds]);

      const proposedClosedMultiType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypes,
        mustHaveAtLeastOne(newEntityTypeIds),
      );

      const changeDetails: Pick<
        EntityTypeChangeDetails,
        "linkChanges" | "propertyChanges"
      > = {
        linkChanges: [],
        propertyChanges: [],
      };

      for (const [newPropertyBaseUrl, schema] of typedEntries(
        proposedClosedMultiType.properties,
      )) {
        const newDetails = getPropertyTypeForClosedEntityType({
          closedMultiEntityType: proposedClosedMultiType,
          definitions: proposedDefinitions,
          propertyTypeBaseUrl: newPropertyBaseUrl,
        });

        const required =
          proposedClosedMultiType.required?.includes(newPropertyBaseUrl);
        const newListSchema = "items" in schema ? schema : undefined;

        const propertyTitle = newDetails.propertyType.title;

        if (!currentClosedType.properties[newPropertyBaseUrl]) {
          changeDetails.propertyChanges.push({
            change: required ? "Added (required)" : "Added (optional)",
            propertyBaseUrl: newPropertyBaseUrl,
            propertyTitle,
          });
          continue;
        }

        const existingDetails = getPropertyTypeForClosedEntityType({
          closedMultiEntityType: currentClosedType,
          definitions: currentDefinitions,
          propertyTypeBaseUrl: newPropertyBaseUrl,
        });

        const wasRequired =
          currentClosedType.required?.includes(newPropertyBaseUrl);

        if (required && !wasRequired) {
          changeDetails.propertyChanges.push({
            change: "Now required",
            propertyBaseUrl: newPropertyBaseUrl,
            propertyTitle,
          });
        }

        const oldListSchema =
          "items" in existingDetails.schema
            ? existingDetails.schema
            : undefined;

        if (oldListSchema && !newListSchema) {
          changeDetails.propertyChanges.push({
            change: "No longer a list",
            propertyBaseUrl: newPropertyBaseUrl,
            propertyTitle,
          });
        }

        if (!oldListSchema && newListSchema) {
          changeDetails.propertyChanges.push({
            change: "Now a list",
            propertyBaseUrl: newPropertyBaseUrl,
            propertyTitle,
          });
        }

        if (oldListSchema && newListSchema) {
          if (oldListSchema.minItems !== newListSchema.minItems) {
            changeDetails.propertyChanges.push({
              change: "Min items changed",
              propertyBaseUrl: newPropertyBaseUrl,
              propertyTitle,
            });
          }

          if (oldListSchema.maxItems !== newListSchema.maxItems) {
            changeDetails.propertyChanges.push({
              change: "Max items changed",
              propertyBaseUrl: newPropertyBaseUrl,
              propertyTitle,
            });
          }
        }

        const newExpectedValues = newDetails.propertyType.oneOf;
        const oldExpectedValues = existingDetails.propertyType.oneOf;

        if (newExpectedValues.length !== oldExpectedValues.length) {
          changeDetails.propertyChanges.push({
            change: "Value type changed",
            propertyBaseUrl: newPropertyBaseUrl,
            propertyTitle,
          });
          continue;
        }

        for (const newValueOption of newExpectedValues) {
          const matchingOldOption = oldExpectedValues.some((oldOption) => {
            if ("$ref" in newValueOption) {
              return (
                "$ref" in oldOption && newValueOption.$ref === oldOption.$ref
              );
            }

            // @todo handle expected values of arrays and objects properly
            return JSON.stringify(newValueOption) === JSON.stringify(oldOption);
          });

          if (!matchingOldOption) {
            changeDetails.propertyChanges.push({
              change: "Value type changed",
              propertyBaseUrl: newPropertyBaseUrl,
              propertyTitle,
            });
          }
        }
      }

      for (const oldPropertyBaseUrl of typedKeys(
        currentClosedType.properties,
      )) {
        if (!proposedClosedMultiType.properties[oldPropertyBaseUrl]) {
          const oldDetails = getPropertyTypeForClosedEntityType({
            closedMultiEntityType: currentClosedType,
            definitions: currentDefinitions,
            propertyTypeBaseUrl: oldPropertyBaseUrl,
          });

          const propertyTitle = oldDetails.propertyType.title;

          changeDetails.propertyChanges.push({
            change: "Removed",
            propertyBaseUrl: oldPropertyBaseUrl,
            propertyTitle,
          });
        }
      }

      for (const [newLinkTypeId, newLinkSchema] of typedEntries(
        proposedClosedMultiType.links ?? {},
      )) {
        const currentLinks = currentClosedType.links ?? {};

        const minimalLinkType = proposedDefinitions.entityTypes[newLinkTypeId];

        if (!minimalLinkType) {
          throw new Error(`Minimal link type not found for ${newLinkTypeId}`);
        }

        const { baseUrl: newLinkTypeBaseUrl, version: newLinkTypeVersion } =
          componentsFromVersionedUrl(newLinkTypeId);

        const [oldLinkTypeId, oldLinkSchema] =
          typedEntries(currentLinks).find(
            ([typeId]) => extractBaseUrl(typeId) === newLinkTypeBaseUrl,
          ) ?? [];

        const newMinItems = newLinkSchema.minItems ?? 0;
        const newMaxItems = newLinkSchema.maxItems ?? 0;
        const oldMinItems = oldLinkSchema?.minItems ?? 0;
        const oldMaxItems = oldLinkSchema?.maxItems ?? 0;

        if (!oldLinkSchema) {
          changeDetails.linkChanges.push({
            change: newMinItems > 0 ? "Added (required)" : "Added (optional)",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
          continue;
        }

        const oldLinkVersion = oldLinkTypeId
          ? extractVersion(oldLinkTypeId)
          : undefined;

        if (
          oldLinkVersion &&
          compareOntologyTypeVersions(oldLinkVersion, newLinkTypeVersion) < 0
        ) {
          changeDetails.linkChanges.push({
            change: "Link version changed",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
        }

        if (oldMinItems === 0 && newMinItems > 0) {
          changeDetails.linkChanges.push({
            change: "Now required",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
        } else if (oldMinItems !== newMinItems) {
          changeDetails.linkChanges.push({
            change: "Min items changed",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
        }

        if (oldMaxItems !== newMaxItems) {
          changeDetails.linkChanges.push({
            change: "Max items changed",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
        }

        const oldTargets =
          "oneOf" in oldLinkSchema.items
            ? new Set(oldLinkSchema.items.oneOf.map((item) => item.$ref))
            : new Set();

        const newTargets =
          "oneOf" in newLinkSchema.items
            ? new Set(newLinkSchema.items.oneOf.map((item) => item.$ref))
            : new Set();

        if (
          !(
            oldTargets.size === newTargets.size &&
            oldTargets.isSupersetOf(newTargets)
          )
        ) {
          changeDetails.linkChanges.push({
            change: "Target type(s) changed",
            linkTypeBaseUrl: newLinkTypeBaseUrl,
            linkTitle: minimalLinkType.title,
          });
        }
      }

      for (const oldLinkTypeId of typedKeys(currentClosedType.links ?? {})) {
        const oldBaseUrl = extractBaseUrl(oldLinkTypeId);

        if (
          !typedKeys(proposedClosedMultiType.links ?? {}).some(
            (newLinkTypeId) => extractBaseUrl(newLinkTypeId) === oldBaseUrl,
          )
        ) {
          const oldLinkType = currentDefinitions.entityTypes[oldLinkTypeId];

          if (!oldLinkType) {
            throw new Error(`Old link type not found for ${oldLinkTypeId}`);
          }

          changeDetails.linkChanges.push({
            change: "Removed",
            linkTypeBaseUrl: oldBaseUrl,
            linkTitle: oldLinkType.title,
          });
        }
      }

      return changeDetails;
    },
    [currentClosedType, currentDefinitions, getClosedMultiEntityTypes],
  );
};
