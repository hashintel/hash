import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import {
  fa100,
  faAsterisk,
  faAtRegular,
  faBracketsCurly,
  faBracketsSquare,
  faEmptySet,
  faInputPipeRegular,
  faRulerRegular,
  faSquareCheck,
  faText,
} from "@hashintel/design-system";

import { EditorType } from "./types";

interface EditorSpec {
  icon: IconDefinition["icon"];
  gridIcon: CustomIcon;
  defaultValue?: unknown;
  arrayEditException?: "no-edit-mode" | "no-save-and-discard-buttons";
  shouldBeDrawnAsAChip?: boolean;
}

// @todo consolidate this with data-types-options-context.tsx in the entity type editor
const editorSpecs: Record<EditorType, EditorSpec> = {
  boolean: {
    icon: faSquareCheck,
    gridIcon: "bpTypeBoolean",
    defaultValue: true,
    arrayEditException: "no-edit-mode",
  },
  number: {
    icon: fa100,
    gridIcon: "bpTypeNumber",
  },
  string: {
    icon: faText,
    gridIcon: "bpTypeText",
  },
  object: {
    icon: faBracketsCurly,
    gridIcon: "bpBracketsCurly",
    arrayEditException: "no-save-and-discard-buttons",
    shouldBeDrawnAsAChip: true,
  },
  emptyList: {
    icon: faBracketsSquare,
    gridIcon: "bpBracketsSquare",
    defaultValue: [],
    arrayEditException: "no-edit-mode",
    shouldBeDrawnAsAChip: true,
  },
  null: {
    icon: faEmptySet,
    gridIcon: "bpEmptySet",
    defaultValue: null,
    arrayEditException: "no-edit-mode",
    shouldBeDrawnAsAChip: true,
  },
  unknown: {
    icon: faAsterisk,
    gridIcon: "bpAsterisk",
    defaultValue: "",
    arrayEditException: "no-edit-mode",
  },
};

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

export const getEditorSpecs = (
  editorType: EditorType,
  dataTypeTitle?: string,
): EditorSpec => {
  switch (editorType) {
    case "boolean":
      return editorSpecs.boolean;
    case "number":
      if (dataTypeTitle && measurementTypeTitles.includes(dataTypeTitle)) {
        return {
          ...editorSpecs.number,
          icon: faRulerRegular,
          gridIcon: "rulerRegular",
        };
      }
      return editorSpecs.number;
    case "string":
      if (dataTypeTitle === "Email") {
        return {
          ...editorSpecs.string,
          icon: faAtRegular,
          gridIcon: "atRegular",
        };
      }
      if (dataTypeTitle && identifierTypeTitles.includes(dataTypeTitle)) {
        return {
          ...editorSpecs.string,
          icon: faInputPipeRegular,
          gridIcon: "inputPipeRegular",
        };
      }
      return editorSpecs.string;
    case "object":
      return editorSpecs.object;
    case "emptyList":
      return editorSpecs.emptyList;
    case "null":
      return editorSpecs.null;
    case "unknown":
      return editorSpecs.unknown;
    default:
      throw new Error(`Unknown editor type: ${editorType}`);
  }
};
