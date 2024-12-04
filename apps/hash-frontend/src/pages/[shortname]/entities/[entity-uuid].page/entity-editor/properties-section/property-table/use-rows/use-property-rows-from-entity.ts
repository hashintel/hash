import { typedKeys } from "@local/advanced-types/typed-entries";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { useCallback, useMemo } from "react";

import { useEntityEditor } from "../../../entity-editor-context";
import type { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";
import {
  PropertyMetadataValue,
  PropertyPath,
} from "@local/hash-graph-types/entity";

export const usePropertyRowsFromEntity = (): PropertyRow[] => {
  const {
    entity,
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
    setEntity,
  } = useEntityEditor();

  const setPropertyMetadata = useCallback(
    (propertyPath: PropertyPath, metadata: PropertyMetadataValue) => {
      const updatedEntity = entity.setPropertyMetadata(propertyPath, metadata);

      setEntity(updatedEntity);
    },
    [entity, setEntity],
  );

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
          propertyTypeBaseUrl: propertyTypeBaseUrl as BaseUrl,
          propertyKeyChain: [propertyTypeBaseUrl as BaseUrl],
          entity,
          requiredPropertyTypes:
            (closedMultiEntityType.required as BaseUrl[] | undefined) ?? [],
          propertyRefSchema,
        });
      },
    );
  }, [entity, closedMultiEntityType, closedMultiEntityTypesDefinitions]);
};
