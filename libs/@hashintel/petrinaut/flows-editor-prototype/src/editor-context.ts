import { createContext, use } from "react";

import type { EditorDocument } from "./document";
import type { validateDocument } from "./shapes";

/** Where the Add node picker inserts, and what it is anchored to. */
export type PickerTarget = {
  after?: { stepId: string; port: string };
  parentId?: string | null;
  anchor: "toolbar" | "port" | "group";
};

/** A field whose menu is open: the source menu, or the "@" search of a free-text field. */
export type OpenField = {
  stepId: string;
  inputName: string;
  mode: "menu" | "mention";
};

export type EditorUi = {
  selectedId: string | null;
  picker: PickerTarget | null;
  openField: OpenField | null;
  runOpen: boolean;
  triggersOpen: boolean;
  /** Step kinds added this session, newest first, for "Recent". */
  recent: string[];
};

export const initialUi: EditorUi = {
  selectedId: null,
  picker: null,
  openField: null,
  runOpen: false,
  triggersOpen: false,
  recent: [],
};

export type EditorContextValue = {
  document: EditorDocument;
  setDocument: (update: (document: EditorDocument) => EditorDocument) => void;
  ui: EditorUi;
  setUi: (update: (ui: EditorUi) => EditorUi) => void;
  validation: ReturnType<typeof validateDocument>;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditor = () => {
  const value = use(EditorContext);
  if (!value) {
    throw new Error("useEditor must be used inside the editor");
  }
  return value;
};
