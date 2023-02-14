import {
  extractBaseUri,
  OneOf,
  PropertyType,
  PropertyValues,
  VersionedUri,
} from "@blockprotocol/type-system";
import { uniqueId } from "lodash";

import { arrayExpectedValueDataDefaults } from "./shared/default-expected-value";
import { ExpectedValue } from "./shared/expected-value-types";
import { getExpectedValueDescriptor } from "./shared/get-expected-value-descriptor";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";

export const propertyTypeToFormDataExpectedValues = (
  property: PropertyType,
) => {
  const descriptors: ExpectedValue[] = [];
  const customExpectedValues: PropertyTypeFormValues["flattenedCustomExpectedValueList"] =
    {};

  const processProperties = (
    { oneOf }: OneOf<PropertyValues>,
    parentId?: string,
  ) => {
    for (const expectedValue of oneOf) {
      const id = uniqueId();

      if (parentId) {
        const parentData = customExpectedValues[parentId]?.data;

        if (parentData?.typeId !== "array") {
          throw new Error("Parent must be an array");
        }

        parentData.itemIds.push(id);
      }

      if ("$ref" in expectedValue) {
        customExpectedValues[id] = {
          id,
          data: {
            typeId: expectedValue.$ref,
          },
          ...(parentId ? { parentId } : {}),
        };
      } else {
        switch (expectedValue.type) {
          case "array":
            customExpectedValues[id] = {
              id,
              data: {
                typeId: "array",
                infinity: !("maxItems" in expectedValue),
                itemIds: [],
                minItems:
                  expectedValue.minItems ??
                  arrayExpectedValueDataDefaults.minItems,
                maxItems:
                  expectedValue.maxItems ??
                  arrayExpectedValueDataDefaults.maxItems,
              },
              ...(parentId ? { parentId } : {}),
            };

            processProperties(expectedValue.items, id);

            break;
          case "object":
            customExpectedValues[id] = {
              id,
              data: {
                typeId: "object",
                properties: Object.values(expectedValue.properties).flatMap(
                  (itemProperty) => {
                    let propertyId: VersionedUri;
                    let allowArrays = false;
                    if ("type" in itemProperty) {
                      allowArrays = true;
                      propertyId = itemProperty.items.$ref;
                    } else {
                      propertyId = itemProperty.$ref;
                    }

                    return {
                      id: propertyId,
                      allowArrays,
                      required:
                        expectedValue.required?.includes(
                          extractBaseUri(propertyId),
                        ) ?? false,
                    };
                  },
                ),
              },
              ...(parentId ? { parentId } : {}),
            };

            break;
        }
      }

      if (!parentId) {
        descriptors.push(getExpectedValueDescriptor(id, customExpectedValues));
      }
    }
  };

  processProperties(property);

  return [descriptors, customExpectedValues] as const;
};
