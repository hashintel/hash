import { DataType } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  faList,
  faListCheck,
  faListOl,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
import {
  fa100,
  faAtRegular,
  faBracketsCurly,
  faBracketsSquare,
  faCube,
  faCubes,
  faEmptySet,
  faInputPipeRegular,
  faListTree,
  faRulerRegular,
  faSquareCheck,
  faText,
} from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";

const chipColors = {
  blue: {
    textColor: theme.palette.blue[80],
    backgroundColor: theme.palette.blue[20],
    hoveredButtonColor: theme.palette.blue[60],
  },
  purple: {
    textColor: theme.palette.purple[70],
    backgroundColor: theme.palette.purple[20],
    hoveredButtonColor: theme.palette.purple[50],
  },
  aqua: {
    textColor: theme.palette.aqua[70],
    backgroundColor: theme.palette.aqua[20],
    hoveredButtonColor: theme.palette.aqua[50],
  },
};

type ExpectedValueDisplay = {
  icon: typeof faText;
  colors: typeof chipColors.blue;
  title: string;
};

// @todo consolidate this with editor-specs.ts in the entity editor
const expectedValuesDisplayMap = {
  string: {
    icon: faText,
    colors: chipColors.blue,
  },
  email: {
    icon: faAtRegular,
    colors: chipColors.blue,
  },
  identifier: {
    icon: faInputPipeRegular,
    colors: chipColors.blue,
  },
  number: {
    icon: fa100,
    colors: chipColors.blue,
  },
  measurement: {
    icon: faRulerRegular,
    colors: chipColors.blue,
  },
  boolean: {
    icon: faSquareCheck,
    colors: chipColors.blue,
  },
  object: {
    icon: faBracketsCurly,
    colors: chipColors.blue,
  },
  emptyList: {
    icon: faBracketsSquare,
    colors: chipColors.blue,
  },
  null: {
    icon: faEmptySet,
    colors: chipColors.blue,
  },
  propertyObject: {
    icon: faCube,
    colors: chipColors.purple,
  },
  array: {
    icon: faList.icon,
    colors: chipColors.blue,
  },
  stringArray: {
    icon: faListUl.icon,
    colors: chipColors.blue,
  },
  booleanArray: {
    icon: faListCheck.icon,
    colors: chipColors.blue,
  },
  numberArray: {
    icon: faListOl.icon,
    colors: chipColors.blue,
  },
  objectArray: {
    icon: faCubes,
    colors: chipColors.blue,
  },
  propertyObjectArray: {
    icon: faCubes,
    colors: chipColors.purple,
  },
  mixedArray: {
    icon: faList.icon,
    colors: chipColors.aqua,
  },
  arrayArray: {
    icon: faListTree,
    colors: chipColors.aqua,
  },
} as const satisfies Record<string, Omit<ExpectedValueDisplay, "title">>;

const measurementTypeTitles = [
  "Inches",
  "Feet",
  "Yards",
  "Miles",
  "Nanometers",
  "Millimeters",
  "Centimeters",
  "Meters",
  "Kilometers",
];

const identifierTypeTitles = ["URL", "URI"];

export type CustomExpectedValueTypeId = VersionedUrl | "array" | "object";

export type DataTypesByVersionedUrl = Record<VersionedUrl, DataType>;
export type DataTypesContextValue = {
  dataTypes: DataType[];
  getExpectedValueDisplay: (
    expectedValue: CustomExpectedValueTypeId | CustomExpectedValueTypeId[],
  ) => ExpectedValueDisplay;
};

export const DataTypesOptionsContext =
  createContext<DataTypesContextValue | null>(null);

const getArrayDataTypeDisplay = (
  dataType: Pick<DataType, "$id"> & {
    items?: DataType[];
    prefixItems?: DataType[];
  },
): Omit<ExpectedValueDisplay, "title"> => {
  const items = dataType.prefixItems ?? dataType.items;

  if (!items) {
    return expectedValuesDisplayMap.array;
  }

  const itemTypes = items.map((item) => item.type);

  if (new Set(itemTypes).size === 1) {
    const itemDataType = items[0];
    if (!itemDataType) {
      throw new Error(
        `Could not find itemDataType for array data type ${dataType.$id}`,
      );
    }
    return expectedValuesDisplayMap[
      `${itemDataType.type}Array` as keyof typeof expectedValuesDisplayMap
    ];
  }

  return expectedValuesDisplayMap.mixedArray;
};

export const DataTypesOptionsContextProvider = ({
  children,
  dataTypeOptions,
}: PropsWithChildren<{ dataTypeOptions: DataTypesByVersionedUrl }>) => {
  const getExpectedValueDisplay = useCallback(
    (
      expectedValue: CustomExpectedValueTypeId | CustomExpectedValueTypeId[],
    ) => {
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

        if (dataType.type === "array") {
          return {
            title: dataType.title,
            ...getArrayDataTypeDisplay(dataType),
          };
        }

        const displayType = measurementTypeTitles.includes(dataType.title)
          ? "measurement"
          : identifierTypeTitles.includes(dataType.title)
            ? "identifier"
            : dataType.title === "Email"
              ? "email"
              : (dataType.type as keyof typeof expectedValuesDisplayMap);

        return {
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
            return {
              title: `${dataType.title} Array`,
              ...getArrayDataTypeDisplay({
                items: [dataType],
                $id: dataType.$id,
              }),
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

export const useDataTypesOptions = () => {
  const dataTypesOptions = useContext(DataTypesOptionsContext);

  if (!dataTypesOptions) {
    throw new Error("no DataTypesOptionsContext value has been provided");
  }

  return dataTypesOptions;
};
