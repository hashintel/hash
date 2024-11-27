import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { getPropertyTypeForClosedEntityType } from "@local/hash-graph-sdk/entity";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useCallback } from "react";

import { useGetClosedMultiEntityType } from "../../shared/use-get-closed-multi-entity-type";
import { useEntityEditor } from "../entity-editor-context";
import type { EntityTypeChangeDetails } from "./entity-type-change-modal";

export const useGetTypeChangeDetails = () => {
  const { getClosedMultiEntityType } = useGetClosedMultiEntityType();

  const {
    closedMultiEntityType: currentClosedType,
    closedMultiEntityTypesDefinitions: currentDefinitions,
    entitySubgraph,
  } = useEntityEditor();

  return useCallback(
    async (
      newEntityTypeIds: VersionedUrl[],
    ): Promise<
      Pick<EntityTypeChangeDetails, "linkChanges" | "propertyChanges">
    > => {
      const entity = getRoots(entitySubgraph)[0];

      if (!entity) {
        throw new Error("No entity found in entitySubgraph");
      }

      const {
        closedMultiEntityType: proposedClosedMultiType,
        closedMultiEntityTypesDefinitions: proposedDefinitions,
      } = await getClosedMultiEntityType(newEntityTypeIds);

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
          proposedClosedMultiType.required.includes(newPropertyBaseUrl);
        const newListSchema = "items" in schema ? schema : undefined;

        const propertyTitle = newDetails.propertyType.title;

        if (!currentClosedType.properties[newPropertyBaseUrl]) {
          changeDetails.propertyChanges.push({
            change: required ? "Added (required)" : "Added (optional)",
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
          currentClosedType.required.includes(newPropertyBaseUrl);

        if (required && !wasRequired) {
          changeDetails.propertyChanges.push({
            change: "Now required",
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
            propertyTitle,
          });
        }

        if (!oldListSchema && newListSchema) {
          changeDetails.propertyChanges.push({
            change: "Now a list",
            propertyTitle,
          });
        }

        if (oldListSchema && newListSchema) {
          if (oldListSchema.minItems !== newListSchema.minItems) {
            changeDetails.propertyChanges.push({
              change: "Min items changed",
              propertyTitle,
            });
          }

          if (oldListSchema.maxItems !== newListSchema.maxItems) {
            changeDetails.propertyChanges.push({
              change: "Max items changed",
              propertyTitle,
            });
          }
        }

        const newExpectedValues = newDetails.propertyType.oneOf;
        const oldExpectedValues = existingDetails.propertyType.oneOf;

        if (newExpectedValues.length !== oldExpectedValues.length) {
          changeDetails.propertyChanges.push({
            change: "Value type changed",
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

            if ("items" in newValueOption) {
              return (
                JSON.stringify(newValueOption) === JSON.stringify(oldOption)
              );
            }

            return false;
          });

          if (!matchingOldOption) {
            changeDetails.propertyChanges.push({
              change: "Value type changed",
              propertyTitle,
            });
          }

          // @todo handle expected values of arrays and objects
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

        const oldLinkSchema = currentLinks[newLinkTypeId];

        const newMinItems = newLinkSchema.minItems ?? 0;
        const newMaxItems = newLinkSchema.maxItems ?? 0;
        const oldMinItems = oldLinkSchema?.minItems ?? 0;
        const oldMaxItems = oldLinkSchema?.maxItems ?? 0;

        if (!oldLinkSchema) {
          changeDetails.linkChanges.push({
            change: newMinItems > 0 ? "Added (required)" : "Added (optional)",
            linkTitle: minimalLinkType.title,
          });
          continue;
        }

        if (oldMinItems === 0 && newMinItems > 0) {
          changeDetails.linkChanges.push({
            change: "Now required",
            linkTitle: minimalLinkType.title,
          });
        } else if (oldMinItems !== newMinItems) {
          changeDetails.linkChanges.push({
            change: "Min items changed",
            linkTitle: minimalLinkType.title,
          });
        }

        if (oldMaxItems !== newMaxItems) {
          changeDetails.linkChanges.push({
            change: "Max items changed",
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
            linkTitle: minimalLinkType.title,
          });
        }
      }

      return changeDetails;
    },
    [
      currentClosedType,
      currentDefinitions,
      entitySubgraph,
      getClosedMultiEntityType,
    ],
  );
};
