import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  fa100,
  faAsterisk,
  faAtRegular,
  faBracketsCurly,
  faBracketsSquare,
  faCalendarClockRegular,
  faCalendarRegular,
  faClockRegular,
  faEmptySet,
  faInputPipeRegular,
  faRulerRegular,
  faSquareCheck,
  faText,
} from "@hashintel/design-system";
import { CustomDataType } from "@local/hash-subgraph";

import { CustomIcon } from "../../../../../../../../../components/grid/utils/custom-grid-icons";
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
  dataType?: CustomDataType,
): EditorSpec => {
  switch (editorType) {
    case "boolean":
      return editorSpecs.boolean;
    case "number":
      if (dataType?.title && measurementTypeTitles.includes(dataType.title)) {
        return {
          ...editorSpecs.number,
          icon: faRulerRegular,
          gridIcon: "rulerRegular",
        };
      }
      return editorSpecs.number;
    case "string":
      if (dataType && "format" in dataType) {
        switch (dataType.format) {
          case "uri":
            return {
              ...editorSpecs.string,
              icon: faInputPipeRegular,
              gridIcon: "inputPipeRegular",
            };
          case "email":
            return {
              ...editorSpecs.string,
              icon: faAtRegular,
              gridIcon: "atRegular",
            };
          case "date":
            return {
              ...editorSpecs.string,
              icon: faCalendarRegular,
              gridIcon: "calendarRegular",
            };
          case "time":
            return {
              ...editorSpecs.string,
              icon: faClockRegular,
              gridIcon: "clockRegular",
            };
          case "date-time":
            return {
              ...editorSpecs.string,
              icon: faCalendarClockRegular,
              gridIcon: "calendarClockRegular",
            };
        }
      }
      if (dataType?.title === "Email") {
        return {
          ...editorSpecs.string,
          icon: faAtRegular,
          gridIcon: "atRegular",
        };
      }
      if (dataType?.title && identifierTypeTitles.includes(dataType.title)) {
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
