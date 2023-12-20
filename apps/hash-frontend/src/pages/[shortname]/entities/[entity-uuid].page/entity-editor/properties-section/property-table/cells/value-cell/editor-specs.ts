import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import {
  fa100,
  faAsterisk,
  faBracketsCurly,
  faBracketsSquare,
  faEmptySet,
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

export const editorSpecs: Record<EditorType, EditorSpec> = {
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
