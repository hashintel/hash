import type {
  BaseUrl,
  PropertyObjectMetadata,
  PropertyPath,
  PropertyValueMetadata,
} from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import {
  generateChangedPropertyMetadataObject,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import { useMemo } from "react";

import { useEntityEditor } from "../../../entity-editor-context";
import type { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const usePropertyRowsFromEntity = (): PropertyRow[] => {
  const {
    entity,
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
    validationReport,
  } = useEntityEditor();

  /**
   * Generate a new metadata object based on applying a patch to the previous version.
   *
   * We can't use the Entity's metadata as a base each time because the ArrayEditor allows adding multiple items
   * before the editor is closed and before the Entity in state is updated. So we need to keep a record of changes to the metadata object,
   * which are reset when the entity in the context state is actually updated (after the editor is closed).
   */
  const generateNewMetadataObject = useMemo<
    PropertyRow["generateNewMetadataObject"]
  >(() => {
    let basePropertiesMetadata = JSON.parse(
      JSON.stringify(
        entity.metadata.properties ??
          ({ value: {} } satisfies PropertyObjectMetadata),
      ),
    );

    return ({
      propertyKeyChain,
      valuePath,
      valueMetadata,
    }: {
      propertyKeyChain: PropertyPath;
      valuePath: PropertyPath;
      valueMetadata: PropertyValueMetadata | "delete";
    }) => {
      basePropertiesMetadata = generateChangedPropertyMetadataObject(
        valuePath,
        valueMetadata,
        basePropertiesMetadata,
      );

      const temporaryEntity = new HashEntity({
        ...entity.toJSON(),
        metadata: {
          ...entity.metadata,
          properties: basePropertiesMetadata,
        },
      });

      const pathMetadata = temporaryEntity.propertyMetadata(propertyKeyChain);

      return {
        propertyMetadata: pathMetadata,
        entityPropertiesMetadata: basePropertiesMetadata,
      };
    };
  }, [entity]);

  return useMemo(() => {
    const processedPropertyTypes = new Set<BaseUrl>();

    return typedKeys(closedMultiEntityType.properties).flatMap(
      (propertyTypeBaseUrl) => {
        if (processedPropertyTypes.has(propertyTypeBaseUrl as BaseUrl)) {
          return [];
        }

        const propertyRefSchema =
          closedMultiEntityType.properties[propertyTypeBaseUrl];

        if (!propertyRefSchema) {
          throw new Error(`Property ${propertyTypeBaseUrl} not found`);
        }

        processedPropertyTypes.add(propertyTypeBaseUrl as BaseUrl);

        return generatePropertyRowRecursively({
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions,
          generateNewMetadataObject,
          propertyTypeBaseUrl: propertyTypeBaseUrl as BaseUrl,
          propertyKeyChain: [propertyTypeBaseUrl as BaseUrl],
          entity,
          requiredPropertyTypes:
            (closedMultiEntityType.required as BaseUrl[] | undefined) ?? [],
          propertyRefSchema,
          validationReport,
        });
      },
    );
  }, [
    entity,
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
    generateNewMetadataObject,
    validationReport,
  ]);
};
