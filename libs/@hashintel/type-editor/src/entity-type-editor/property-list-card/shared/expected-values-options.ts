import { validateVersionedUri, VersionedUri } from "@blockprotocol/type-system";
import {
  faList,
  faListCheck,
  faListOl,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
import {
  fa100,
  faBracketsCurly,
  faBracketsSquare,
  faCube,
  faCubes,
  faEmptySet,
  faListTree,
  faSquareCheck,
  faText,
  theme,
} from "@hashintel/design-system";

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
  turquoise: {
    textColor: theme.palette.turquoise[70],
    backgroundColor: theme.palette.turquoise[20],
    hoveredButtonColor: theme.palette.turquoise[50],
  },
};

type ExpectedValueOptionMap = {
  [key: string]: {
    title: string;
    icon: typeof faText;
    colors: typeof chipColors.blue;
    allowMultiple?: boolean;
  };
};

export const textDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
export const numberDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
export const booleanDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
export const objectDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
export const emptyListDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1";
export const nullDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1";

export const expectedValuesOptions: ExpectedValueOptionMap = {
  [textDataTypeId]: {
    title: "Text",
    icon: faText,
    colors: chipColors.blue,
  },
  [numberDataTypeId]: {
    title: "Number",
    icon: fa100,
    colors: chipColors.blue,
  },
  [booleanDataTypeId]: {
    title: "Boolean",
    icon: faSquareCheck,
    colors: chipColors.blue,
  },
  [objectDataTypeId]: {
    title: "Object",
    icon: faBracketsCurly,
    colors: chipColors.blue,
  },
  [emptyListDataTypeId]: {
    title: "Empty List",
    icon: faBracketsSquare,
    colors: chipColors.blue,
  },
  [nullDataTypeId]: {
    title: "Null",
    icon: faEmptySet,
    colors: chipColors.blue,
  },
  object: {
    title: "Property Object",
    icon: faCube,
    colors: chipColors.purple,
    allowMultiple: true,
  },
  array: {
    title: "Array",
    icon: faList.icon,
    colors: chipColors.blue,
    allowMultiple: true,
  },
  textArray: {
    title: "Text Array",
    icon: faListUl.icon,
    colors: chipColors.blue,
  },
  booleanArray: {
    title: "Boolean Array",
    icon: faListCheck.icon,
    colors: chipColors.blue,
  },
  numberArray: {
    title: "Number Array",
    icon: faListOl.icon,
    colors: chipColors.blue,
  },
  propertyObjectArray: {
    title: "Property Object Array",
    icon: faCubes,
    colors: chipColors.purple,
  },
  mixedArray: {
    title: "Mixed Array",
    icon: faList.icon,
    colors: chipColors.turquoise,
  },
  arrayArray: {
    title: "Array of Arrays",
    icon: faListTree,
    colors: chipColors.turquoise,
  },
};

export const dataTypeOptions = Object.keys(expectedValuesOptions).filter(
  (key) => validateVersionedUri(key).type === "Ok",
) as VersionedUri[];
