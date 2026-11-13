import { defaultUserSettings } from "../../react/state/user-settings-context";

import type { CodeEditorTheme } from "./code-editor-theme";

export type RegisteredCodeEditorTheme = CodeEditorTheme & {
  /** The theme file's name, which Monaco and the user setting know it by. */
  id: string;
};

/**
 * Every theme file in `code-editor-themes/`, resolved when the package is
 * built. A new theme is a new file there; nothing else lists it.
 */
const themeByPath = import.meta.glob<CodeEditorTheme>(
  ["./code-editor-themes/*.ts", "!./code-editor-themes/*.test.ts"],
  { eager: true, import: "theme" },
);

export const defaultCodeEditorThemeId = defaultUserSettings.codeEditorTheme;

const idOf = (path: string) => /([^/]+)\.ts$/.exec(path)?.[1] ?? path;

const registered = Object.entries(themeByPath).map(
  ([path, theme]): RegisteredCodeEditorTheme => ({ id: idOf(path), ...theme }),
);

/** The default theme first, then the rest by label. */
export const codeEditorThemes: readonly RegisteredCodeEditorTheme[] = [
  ...registered.filter((theme) => theme.id === defaultCodeEditorThemeId),
  ...registered
    .filter((theme) => theme.id !== defaultCodeEditorThemeId)
    .sort((first, second) => first.label.localeCompare(second.label)),
];

/**
 * `id` when a theme file has it, else the default: a saved choice outlives
 * the file it named.
 */
export const resolveCodeEditorThemeId = (id: string): string =>
  codeEditorThemes.some((theme) => theme.id === id)
    ? id
    : defaultCodeEditorThemeId;
