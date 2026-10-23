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
  /** "custom" shows a date picker's "Custom…" interval popover (J3 relative date, Figma D2). */
  mode: "menu" | "mention" | "custom";
};

export type EditorUi = {
  selectedId: string | null;
  /** With Start selected: the trigger opened from its "Started by" list, shown in the panel (J4 A2). */
  triggerId?: string | null;
  picker: PickerTarget | null;
  openField: OpenField | null;
  runOpen: boolean;
  /** Step kinds added this session, newest first, for "Recent". */
  recent: string[];
  /** A step just added for the user (Look up in the graph): the canvas pans to it and highlights it briefly. */
  flashId?: string | null;
  /** J3 and its Explore screens draw a step's fields right under its title, with no "Inputs" header. */
  hideInputsHeader?: boolean;
  /** J2's query has no "Where" label and adds a "condition"; J3's has "Where" / "And" and "Add filter". */
  plainQuery?: boolean;
  /** Opens the canvas at this zoom with Start's top-left this far (px) inside the canvas, instead of fitting the flow. */
  viewport?: { left: number; top: number; zoom: number };
};

export const initialUi: EditorUi = {
  selectedId: null,
  picker: null,
  openField: null,
  runOpen: false,
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

const query = new URLSearchParams(globalThis.location.search);

/** `?debug` shows engine diagnostics and origin marks; `?full` shows every field, Outputs and Paths. Neither is in the default UI. */
export const showDebug = query.has("debug");
export const showFull = query.has("full");
/** A `?state=` screen shows only what its Figma frame shows; with none, the editor is in normal use. */
export const inScreenState = query.has("state");
