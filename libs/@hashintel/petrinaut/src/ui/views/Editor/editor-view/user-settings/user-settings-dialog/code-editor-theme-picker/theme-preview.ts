import type { RegisteredCodeEditorTheme } from "../../../../../../monaco/code-editor-themes";

/** The colours a theme card shows, read from the theme's own data. */
export type ThemePreview = {
  surface: string;
  ink: string;
  accent: string;
  /** Token colours in rule order, without repeats or error colours. */
  swatches: readonly string[];
};

const maxSwatches = 6;

// A theme that sets no token colours shows the ones Monaco's base theme
// paints: comments, keywords, types, strings, numbers, regular expressions.
const baseSwatches: Partial<Record<string, readonly string[]>> = {
  vs: ["#008000", "#0000FF", "#008080", "#A31515", "#098658", "#800000"],
  "vs-dark": ["#6A9955", "#569CD6", "#4EC9B0", "#CE9178", "#B5CEA8", "#D16969"],
};

const darkBases = new Set(["vs-dark", "hc-black"]);

const asColor = (value: string) =>
  value.startsWith("#") ? value : `#${value}`;

export const themePreview = (
  theme: RegisteredCodeEditorTheme,
): ThemePreview => {
  const dark = darkBases.has(theme.base);
  const surface =
    theme.colors["editor.background"] ?? (dark ? "#1E1E1E" : "#FFFFFF");
  const ink =
    theme.colors["editor.foreground"] ?? (dark ? "#D4D4D4" : "#000000");
  const accent =
    theme.colors["editorCursor.foreground"] ??
    theme.colors["editor.selectionBackground"] ??
    ink;

  const ruleSwatches = [
    ...new Set(
      theme.rules
        .filter((rule) => !rule.token.includes("invalid"))
        .flatMap((rule) =>
          rule.foreground === undefined
            ? []
            : [asColor(rule.foreground).toUpperCase()],
        ),
    ),
  ];
  const swatches =
    ruleSwatches.length > 1
      ? ruleSwatches
      : (baseSwatches[theme.base] ?? ruleSwatches);

  return { surface, ink, accent, swatches: swatches.slice(0, maxSwatches) };
};
