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
import { blockProtocolTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { EditorType } from "./types";

interface EditorSpec {
  icon: IconDefinition["icon"];
  title: string;
  gridIcon: CustomIcon;
  defaultValue?: unknown;
  arrayEditException?: "no-edit-mode" | "no-save-and-discard-buttons";
  valueToString: (value: any) => string;
  shouldBeDrawnAsAChip?: boolean;
}

export const editorSpecs: Record<EditorType, EditorSpec> = {
  boolean: {
    icon: faSquareCheck,
    title: blockProtocolTypes.dataType.boolean.title,
    gridIcon: "bpTypeBoolean",
    defaultValue: true,
    arrayEditException: "no-edit-mode",
    valueToString: (value: boolean) => (value ? "True" : "False"),
  },
  number: {
    icon: fa100,
    title: blockProtocolTypes.dataType.number.title,
    gridIcon: "bpTypeNumber",
    valueToString: (value: number) => String(value),
  },
  text: {
    icon: faText,
    title: blockProtocolTypes.dataType.text.title,
    gridIcon: "bpTypeText",
    valueToString: (value: string) => value,
  },
  object: {
    icon: faBracketsCurly,
    title: blockProtocolTypes.dataType.object.title,
    gridIcon: "bpBracketsCurly",
    arrayEditException: "no-save-and-discard-buttons",
    valueToString: () => "Object",
    shouldBeDrawnAsAChip: true,
  },
  emptyList: {
    icon: faBracketsSquare,
    title: blockProtocolTypes.dataType.emptyList.title,
    gridIcon: "bpBracketsSquare",
    defaultValue: [],
    arrayEditException: "no-edit-mode",
    valueToString: () => "Empty List",
    shouldBeDrawnAsAChip: true,
  },
  null: {
    icon: faEmptySet,
    title: blockProtocolTypes.dataType.null.title,
    gridIcon: "bpEmptySet",
    defaultValue: null,
    arrayEditException: "no-edit-mode",
    valueToString: () => "Null",
    shouldBeDrawnAsAChip: true,
  },
  unknown: {
    icon: faAsterisk,
    title: "Unknown Type",
    gridIcon: "bpAsterisk",
    defaultValue: "",
    arrayEditException: "no-edit-mode",
    valueToString: () => "Unknown",
  },
};
