import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../../../../../../shared/property-types-context";
import { useDataTypesContext } from "../../../../../../../shared/data-types-context";
import { getLatestDataTypeIds } from "./condition-properties";

import type { ConditionOntology } from "./condition-properties";

/** The types a condition's properties are read from, or `null` while they load. */
export const useConditionOntology = (): ConditionOntology | null => {
  const { entityTypes, entityTypeParentIds } = useEntityTypesContextRequired();
  const { propertyTypes } = usePropertyTypes();
  const { propertyTypes: latestPropertyTypes } = usePropertyTypes({
    latestOnly: true,
  });
  const { dataTypes } = useDataTypesContext();

  return useMemo(
    () =>
      entityTypes &&
      entityTypeParentIds &&
      propertyTypes &&
      latestPropertyTypes &&
      dataTypes
        ? {
            entityTypes,
            entityTypeParentIds,
            propertyTypes,
            latestDataTypeIds: getLatestDataTypeIds(
              Object.values(latestPropertyTypes),
            ),
            dataTypes,
          }
        : null,
    [
      entityTypes,
      entityTypeParentIds,
      propertyTypes,
      latestPropertyTypes,
      dataTypes,
    ],
  );
};
