import {
  faList,
  faListCheck,
  faListOl,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
import { createContext, useContext } from "react";

import {
  fa100,
  faAtRegular,
  faBracketsCurly,
  faCalendarClockRegular,
  faCalendarRegular,
  faClockRegular,
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

import type {
  ArrayItemsSchema,
  ArraySchema,
  DataType,
  TupleConstraints,
  ValueConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";

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

export type ExpectedValueDisplay = {
  icon: typeof faText;
  colors: typeof chipColors.blue;
  title: string;
  $id?: VersionedUrl;
};

// @todo consolidate this with editor-specs.ts in the entity editor
export const expectedValuesDisplayMap = {
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
  time: {
    icon: faClockRegular,
    colors: chipColors.blue,
  },
  date: {
    icon: faCalendarRegular,
    colors: chipColors.blue,
  },
  datetime: {
    icon: faCalendarClockRegular,
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
  nullArray: {
    icon: faEmptySet,
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

const isTupleConstraints = (schema: ArraySchema): schema is TupleConstraints =>
  schema.items === false;

export const isArrayItemsSchema = (
  schema: ValueConstraints,
): schema is ArrayItemsSchema => "type" in schema && schema.type === "array";

export const getArrayDataTypeDisplay = (
  dataType: ArraySchema,
): Omit<ExpectedValueDisplay, "title"> => {
  // `items` are either the elements of a tuple or the items of a mixed anyOf-array
  let items: [ArrayItemsSchema, ...ArrayItemsSchema[]];

  if (isTupleConstraints(dataType)) {
    if (!dataType.prefixItems) {
      throw new Error("TupleConstraints must have prefixItems");
    }

    items = dataType.prefixItems;
  } else if (!dataType.items) {
    return expectedValuesDisplayMap.mixedArray;
  } else {
    return expectedValuesDisplayMap[`${dataType.items.type}Array`];
  }

  const itemTypes = new Set<ArrayItemsSchema["type"]>();

  for (const item of items) {
    if ("anyOf" in item) {
      /**
       * @todo H-3373 support data types which can have multiple different values in a position
       */
      return expectedValuesDisplayMap.mixedArray;
    }

    itemTypes.add(item.type);
  }

  if (itemTypes.size === 1) {
    /**
     * @todo H-3373 support data types with a fixed number of single values
     */
    return expectedValuesDisplayMap[
      `${itemTypes.values().next().value}Array` as keyof typeof expectedValuesDisplayMap
    ];
  }

  /**
   * @todo H-3373 support mixed data types with different types of values in each position
   */
  return expectedValuesDisplayMap.mixedArray;
};

export const useDataTypesOptions = () => {
  const dataTypesOptions = useContext(DataTypesOptionsContext);

  if (!dataTypesOptions) {
    throw new Error("no DataTypesOptionsContext value has been provided");
  }

  return dataTypesOptions;
};
