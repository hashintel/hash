import {
  faList,
  faListCheck,
  faListOl,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
import { theme } from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/ontology-types";

import { fa100 } from "../../../../../../../../shared/icons/pro/fa-100";
import { faCube } from "../../../../../../../../shared/icons/pro/fa-cube";
import { faCubes } from "../../../../../../../../shared/icons/pro/fa-cubes";
import { faListTree } from "../../../../../../../../shared/icons/pro/fa-list-tree";
import { faSquareCheck } from "../../../../../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../../../../../shared/icons/pro/fa-text";

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

export const expectedValuesOptions = {
  [types.dataType.text.dataTypeId]: {
    title: types.dataType.text.title,
    icon: faText,
    colors: chipColors.blue,
  },
  [types.dataType.number.dataTypeId]: {
    title: types.dataType.number.title,
    icon: fa100,
    colors: chipColors.blue,
  },
  [types.dataType.boolean.dataTypeId]: {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
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
