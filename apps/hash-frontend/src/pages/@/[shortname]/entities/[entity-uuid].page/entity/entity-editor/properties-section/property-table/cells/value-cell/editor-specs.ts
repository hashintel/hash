import type { ClosedDataType } from "@blockprotocol/type-system";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  getIconForDataType,
  identifierTypeTitles,
  measurementTypeTitles,
} from "@hashintel/design-system";
import type { MergedDataTypeSingleSchema } from "@local/hash-isomorphic-utils/data-types";

import type { CustomIcon } from "../../../../../../../../../../../components/grid/utils/custom-grid-icons";
import type { EditorType } from "./types";

interface EditorSpec {
  gridIcon: CustomIcon;
  defaultValue?: unknown;
  icon: IconDefinition["icon"];
  arrayEditException?: "no-edit-mode" | "no-save-and-discard-buttons";
  shouldBeDrawnAsAChip?: boolean;
}

// @todo consolidate this with data-types-options-context.tsx in the entity type editor
const editorSpecs: Record<EditorType, Omit<EditorSpec, "icon">> = {
  boolean: {
    gridIcon: "bpTypeBoolean",
    defaultValue: true,
    arrayEditException: "no-edit-mode",
  },
  number: {
    gridIcon: "bpTypeNumber",
  },
  string: {
    gridIcon: "bpTypeText",
  },
  object: {
    gridIcon: "bpBracketsCurly",
    arrayEditException: "no-save-and-discard-buttons",
    shouldBeDrawnAsAChip: true,
  },
  null: {
    gridIcon: "bpEmptySet",
    defaultValue: null,
    arrayEditException: "no-edit-mode",
    shouldBeDrawnAsAChip: true,
  },
};

export const getEditorSpecs = (
  dataType: ClosedDataType,
  schema: MergedDataTypeSingleSchema,
): EditorSpec => {
  const icon = getIconForDataType({
    title: dataType.title,
    format: "format" in schema ? schema.format : undefined,
    type: schema.type,
  });

  switch (schema.type) {
    case "boolean":
      return {
        ...editorSpecs.boolean,
        icon,
      };
    case "number":
      if (measurementTypeTitles.includes(dataType.title)) {
        return {
          ...editorSpecs.number,
          icon,
          gridIcon: "rulerRegular",
        };
      }
      return {
        ...editorSpecs.number,
        icon,
      };
    case "string":
      if ("format" in schema) {
        switch (schema.format) {
          case "uri":
            return {
              ...editorSpecs.string,
              icon,
              gridIcon: "inputPipeRegular",
            };
          case "email":
            return {
              ...editorSpecs.string,
              icon,
              gridIcon: "atRegular",
            };
          case "date":
            return {
              ...editorSpecs.string,
              icon,
              gridIcon: "calendarRegular",
            };
          case "time":
            return {
              ...editorSpecs.string,
              icon,
              gridIcon: "clockRegular",
            };
          case "date-time":
            return {
              ...editorSpecs.string,
              icon,
              gridIcon: "calendarClockRegular",
            };
        }
      }
      if (dataType.title === "Email") {
        return {
          ...editorSpecs.string,
          icon,
          gridIcon: "atRegular",
        };
      }
      if (dataType.title && identifierTypeTitles.includes(dataType.title)) {
        return {
          ...editorSpecs.string,
          icon,
          gridIcon: "inputPipeRegular",
        };
      }
      return {
        ...editorSpecs.string,
        icon,
      };
    case "object":
      return {
        ...editorSpecs.object,
        icon,
      };
    case "null":
      return {
        ...editorSpecs.null,
        icon,
      };
    default:
      throw new Error(`Unhandled type: ${schema.type}`);
  }
};
