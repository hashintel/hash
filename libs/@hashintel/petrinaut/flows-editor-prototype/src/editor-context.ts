import { createContext, use } from "react";

import { type EditorDocument, findStep, START_ID } from "./document";
import type { StepInputSource } from "./engine";
import type { validateDocument } from "./shapes";

/** Where the Add node picker inserts, and what it is anchored to. */
export type PickerTarget = {
  after?: { stepId: string; port: string };
  parentId?: string | null;
  anchor: "toolbar" | "port" | "group" | "drop";
  /** For "drop": where a wire was released on empty canvas, in window pixels (the menu) and flow units (the new step). */
  drop?: { client: { x: number; y: number }; flow: { x: number; y: number } };
  /** J1.20 Insert step here: the connection the new step goes into; it is rewired through the new step. */
  insertInto?: string;
};

/** A canvas right-click menu (J1.16, J1.20, J1.21): what was right-clicked, and where, in window pixels. */
export type CanvasMenu = { point: { x: number; y: number } } & (
  | { kind: "step"; stepId: string }
  | { kind: "selection"; stepIds: string[] }
  | { kind: "connection"; wireId: string; flow: { x: number; y: number } }
  | { kind: "port"; stepId: string; port: string; side: "source" | "target" }
);

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
  /** MOCK run view (26 Oct): the panel shows one run of the flow, read-only (`run-view.tsx`). */
  run?: boolean;
  /** In the run view: which item of the For each the panels show. */
  runItem?: number;
  /** Outputs: node icons on the "used by" chips, or plain chips. Both are shown to choose between (26 Oct). */
  outputIcons?: boolean;
  /** J2's query has no "Where" label and adds a "condition"; J3's has "Where" / "And" and "Add filter". */
  plainQuery?: boolean;
  /** Opens the canvas at this zoom with Start's top-left this far (px) inside the canvas, instead of fitting the flow. */
  viewport?: { left: number; top: number; zoom: number };
  /** The zoom the Figma frame labels 100% (its nodes are drawn at that scale): the bottom bar shows zoom against it. */
  zoomBase?: number;
  /** A screen state's + handles show on hover only; the Figma frame draws the + beside the selected step in J2 A and B2 alone. */
  quietPortAdd?: boolean;
  /**
   * J1.1–J2.4's panel (3 Nov): a grey step type, a 12 px description, a quiet "Inputs" label, and no Settings or
   * Outputs. Every later frame (J2.5 on) draws the full panel, which is also the panel in normal use.
   */
  earlyPanel?: boolean;
  /** For each boxes (and "In parallel" rows) folded, in the Steps tree and on the canvas alike (J1.13). */
  collapsed?: string[];
  /** Steps box-selected together (drag on empty canvas); `selectedId` is the one the panel shows. */
  selectedIds?: string[];
  /** The open canvas right-click menu, if any. */
  canvasMenu?: CanvasMenu | null;
  /** The connection under the pointer, which shows its × (U12 C). */
  hoverWireId?: string | null;
  /** A screen that draws the pointer on a port (J0.5): that step's + shows as if hovered. */
  showPortAddOn?: string;
  /** The step card a hovered reference comes from: the canvas highlights it while the pointer is on the reference. */
  hoverSourceId?: string | null;
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
/** A `?state=` or `?screen=` screen shows only what its Figma frame shows; with neither, the editor is in normal use. */
export const inScreenState = query.has("state") || query.has("screen");

/** The card a reference reads from: its step, Start for a flow input, the For each box for an item. */
const sourceCardId = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
) =>
  source.kind === "step-output"
    ? source.stepId
    : source.kind === "flow-input"
      ? START_ID
      : source.kind === "item"
        ? (findStep(document, stepId)?.parentId ?? null)
        : null;

/** Pointer props for a reference (token, chip, trigger): hovering it highlights the card it comes from. */
export const useSourceHover = (
  source: StepInputSource | null | undefined,
  stepId: string,
) => {
  const { document, setUi } = useEditor();
  const id = source ? sourceCardId(document, source, stepId) : null;
  if (!source) {
    return { onPointerEnter: undefined, onPointerLeave: undefined };
  }
  return {
    onPointerEnter: () => setUi((ui) => ({ ...ui, hoverSourceId: id })),
    onPointerLeave: () => setUi((ui) => ({ ...ui, hoverSourceId: null })),
  };
};
