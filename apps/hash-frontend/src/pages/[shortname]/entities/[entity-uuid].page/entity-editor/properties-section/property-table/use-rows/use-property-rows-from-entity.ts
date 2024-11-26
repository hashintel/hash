import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import { useEntityEditor } from "../../../entity-editor-context";
import type { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";
import { typedKeys } from "@local/advanced-types/typed-entries";

export const usePropertyRowsFromEntity = (): PropertyRow[] => {
  const {
    entitySubgraph,
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
  } = useEntityEditor();

  return useMemo(() => {
    const entity = getRoots(entitySubgraph)[0]!;

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
  }, [
    entitySubgraph,
    closedMultiEntityType,
    closedMultiEntityTypesDefinitions,
  ]);
};
