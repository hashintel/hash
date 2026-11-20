import type { CodeEditorTheme } from "../code-editor-theme";

// The stock vs-light selection and occurrence highlights are too faint to
// read at 12px; this theme is vs-light with stronger ones.
export const theme: CodeEditorTheme = {
  label: "Petrinaut Light",
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.selectionBackground": "#99C2FF",
    "editor.inactiveSelectionBackground": "#CCE0FF",
    "editor.selectionHighlightBackground": "#BAD5FF",
    "editor.wordHighlightBackground": "#C6DCFF",
    "editor.wordHighlightStrongBackground": "#B0CDFF",
  },
};
