import type {
  CursorMode,
  EditorState,
} from "../../../../../react/state/editor-context";

/** What every layout of the bar is given to render its controls from. */
export interface BarContentProps {
  mode: EditorState["globalMode"];
  editionMode: EditorState["editionMode"];
  onEditionModeChange: (mode: EditorState["editionMode"]) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
  hasAiAssistant: boolean;
}
