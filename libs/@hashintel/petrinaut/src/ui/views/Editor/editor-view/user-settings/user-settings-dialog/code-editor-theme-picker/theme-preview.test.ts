import { describe, expect, it } from "vitest";

import { themePreview } from "./theme-preview";

import type { RegisteredCodeEditorTheme } from "../../../../../../monaco/code-editor-themes";

const theme = (
  overrides: Partial<RegisteredCodeEditorTheme>,
): RegisteredCodeEditorTheme => ({
  id: "test",
  label: "Test",
  base: "vs",
  inherit: true,
  rules: [],
  colors: {},
  ...overrides,
});

describe("themePreview", () => {
  it("reads the surface, ink and cursor from the theme's colours", () => {
    const preview = themePreview(
      theme({
        colors: {
          "editor.background": "#FAFAFA",
          "editor.foreground": "#111111",
          "editorCursor.foreground": "#C2298A",
        },
      }),
    );
    expect(preview).toMatchObject({
      surface: "#FAFAFA",
      ink: "#111111",
      accent: "#C2298A",
    });
  });

  it("lists rule colours once each, in rule order, without error colours", () => {
    const preview = themePreview(
      theme({
        rules: [
          { token: "comment", foreground: "64778c" },
          { token: "keyword", foreground: "C2298A" },
          { token: "keyword.other", foreground: "#c2298a" },
          { token: "invalid", foreground: "CE2C31" },
          { token: "string", foreground: "218358" },
        ],
      }),
    );
    expect(preview.swatches).toEqual(["#64778C", "#C2298A", "#218358"]);
  });

  it("shows the base theme's colours for a theme that sets none", () => {
    const preview = themePreview(
      theme({ colors: { "editor.selectionBackground": "#99C2FF" } }),
    );
    expect(preview.surface).toBe("#FFFFFF");
    expect(preview.ink).toBe("#000000");
    expect(preview.accent).toBe("#99C2FF");
    expect(preview.swatches).toHaveLength(6);
    expect(preview.swatches[1]).toBe("#0000FF");
  });

  it("caps the swatches", () => {
    const rules = [
      "111111",
      "222222",
      "333333",
      "444444",
      "555555",
      "666666",
      "777777",
    ].map((foreground, index) => ({ token: `token${index}`, foreground }));
    expect(themePreview(theme({ rules })).swatches).toHaveLength(6);
  });
});
