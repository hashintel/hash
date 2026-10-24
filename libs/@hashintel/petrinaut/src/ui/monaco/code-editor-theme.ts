import type { editor } from "monaco-editor";

/**
 * A colour theme for the code editors: Monaco's own theme data under the
 * label the theme picker shows. Each theme is one file in
 * `code-editor-themes/`, named after the theme's id.
 */
export type CodeEditorTheme = editor.IStandaloneThemeData & {
  /** Shown in the theme picker. */
  label: string;
};
