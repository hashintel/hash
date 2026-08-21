import { useCallback, useMemo } from "react";

import {
  identifierTypeTitles,
  measurementTypeTitles,
} from "@hashintel/design-system";

import {
  DataTypesOptionsContext,
  expectedValuesDisplayMap,
  getArrayDataTypeDisplay,
  isArrayItemsSchema,
} from "./data-types-options-context";

import type {
  CustomExpectedValueTypeId,
  DataTypesByVersionedUrl,
  ExpectedValueDisplay,
} from "./data-types-options-context";
import type { PropsWithChildren } from "react";

export const DataTypesOptionsContextProvider = ({
  children,
  dataTypeOptions,
}: PropsWithChildren<{ dataTypeOptions: DataTypesByVersionedUrl }>) => {
  const getExpectedValueDisplay = useCallback(
    (
      expectedValue: CustomExpectedValueTypeId | CustomExpectedValueTypeId[],
    ): ExpectedValueDisplay => {
      if (expectedValue === "object") {
        return {
          title: "Property Object",
          ...expectedValuesDisplayMap.propertyObject,
        };
      }

      if (expectedValue === "array") {
        return {
          title: "Array",
          ...expectedValuesDisplayMap.array,
        };
      }

      if (typeof expectedValue === "string") {
        const dataType = dataTypeOptions[expectedValue];
        if (!dataType) {
          throw new Error(`Could not find dataType for ${expectedValue}`);
        }

        if ("type" in dataType && dataType.type === "array") {
          return {
            $id: dataType.$id,
            title: dataType.title,
            ...getArrayDataTypeDisplay(dataType),
          };
        }

        let displayType: keyof typeof expectedValuesDisplayMap =
          /**
           * @todo H-3373 support data types which can have multiple different single values
           */
          "anyOf" in dataType ? dataType.anyOf[0].type : dataType.type;

        if (measurementTypeTitles.includes(dataType.title)) {
          displayType = "measurement";
        } else if (identifierTypeTitles.includes(dataType.title)) {
          displayType = "identifier";
        } else if ("format" in dataType) {
          if (dataType.format === "date-time") {
            displayType = "datetime";
          } else if (dataType.format === "date") {
            displayType = "date";
          } else if (dataType.format === "time") {
            displayType = "time";
          } else if (dataType.format === "email") {
            displayType = "email";
          }
        }

        return {
          $id: dataType.$id,
          title: dataType.title,
          ...expectedValuesDisplayMap[displayType],
        };
      }

      if (Array.isArray(expectedValue)) {
        if (new Set(expectedValue).size === 1) {
          const type = expectedValue[0]!;
          if (type === "object") {
            return {
              title: "Property Object Array",
              ...expectedValuesDisplayMap.propertyObjectArray,
            };
          }
          if (type === "array") {
            return {
              title: "Array of Arrays",
              ...expectedValuesDisplayMap.arrayArray,
            };
          }
          const dataType = dataTypeOptions[type];

          if (dataType) {
            if (isArrayItemsSchema(dataType)) {
              return {
                title: `${dataType.title} Array`,
                ...getArrayDataTypeDisplay({
                  items: dataType,
                }),
              };
            }

            return {
              ...getExpectedValueDisplay(dataType.$id),
              title: `${dataType.title} Array`,
            };
          }
        }

        return {
          title: "Mixed Array",
          ...expectedValuesDisplayMap.mixedArray,
        };
      }

      throw new Error("Could not find expectedValueDisplay");
    },
    [dataTypeOptions],
  );

  const value = useMemo(() => {
    return {
      dataTypes: Object.values(dataTypeOptions).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      getExpectedValueDisplay,
    };
  }, [dataTypeOptions, getExpectedValueDisplay]);

  return (
    <DataTypesOptionsContext.Provider value={value}>
      {children}
    </DataTypesOptionsContext.Provider>
  );
};
