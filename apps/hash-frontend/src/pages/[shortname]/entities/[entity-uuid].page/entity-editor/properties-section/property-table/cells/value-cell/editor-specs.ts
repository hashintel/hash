import { faAsterisk, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { types } from "@local/hash-isomorphic-utils/ontology-types";

import { fa100 } from "../../../../../../../../../shared/icons/pro/fa-100";
import { faCube } from "../../../../../../../../../shared/icons/pro/fa-cube";
import { faSquareCheck } from "../../../../../../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../../../../../../shared/icons/pro/fa-text";
import { EditorType } from "./types";

interface EditorSpec {
  icon: IconDefinition["icon"];
  title: string;
  gridIcon: CustomIcon;
  defaultValue?: unknown;
  arrayEditException?: "no-edit-mode" | "no-save-and-discard-buttons";
  valueToString: (value: any) => string;
}

export const editorSpecs: Record<EditorType, EditorSpec> = {
  boolean: {
    icon: faSquareCheck,
    title: types.dataType.boolean.title,
    gridIcon: "bpTypeBoolean",
    defaultValue: true,
    arrayEditException: "no-edit-mode",
    valueToString: (value: boolean) => (value ? "True" : "False"),
  },
  number: {
    icon: fa100,
    title: types.dataType.number.title,
    gridIcon: "bpTypeNumber",
    valueToString: (value: number) => String(value),
  },
  text: {
    icon: faText,
    title: types.dataType.text.title,
    gridIcon: "bpTypeText",
    valueToString: (value: string) => value,
  },
  object: {
    icon: faCube,
    title: types.dataType.object.title,
    gridIcon: "bpCube",
    arrayEditException: "no-save-and-discard-buttons",
    valueToString: () => "Object",
  },
  emptyList: {
    icon: faAsterisk.icon,
    title: types.dataType.emptyList.title,
    gridIcon: "bpAsterisk",
    defaultValue: [],
    arrayEditException: "no-edit-mode",
    valueToString: () => "Empty List",
  },
  null: {
    icon: faAsterisk.icon,
    title: types.dataType.null.title,
    gridIcon: "bpAsterisk",
    defaultValue: null,
    arrayEditException: "no-edit-mode",
    valueToString: () => "Null",
  },
  unknown: {
    icon: faAsterisk.icon,
    title: "Unknown Type",
    gridIcon: "bpAsterisk",
    defaultValue: "",
    arrayEditException: "no-edit-mode",
    valueToString: () => "Unknown",
  },
};
