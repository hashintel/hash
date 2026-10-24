import { describe, expect, it } from "vitest";

import {
  codeEditorThemes,
  defaultCodeEditorThemeId,
  resolveCodeEditorThemeId,
} from "./code-editor-themes";

// Monaco's own pattern for a rule colour: `#` optional, alpha optional.
const ruleColor = /^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const colorId = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const monacoBases = ["vs", "vs-dark", "hc-black", "hc-light"];

describe("codeEditorThemes", () => {
  it("lists the default theme first", () => {
    expect(codeEditorThemes[0]?.id).toBe(defaultCodeEditorThemeId);
  });

  it("names every theme by a kebab-case file with a label", () => {
    const ids = codeEditorThemes.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of codeEditorThemes) {
      expect(theme.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(theme.label.trim()).not.toBe("");
      expect(monacoBases).toContain(theme.base);
    }
  });

  it("writes colours in the forms Monaco parses", () => {
    for (const theme of codeEditorThemes) {
      for (const rule of theme.rules) {
        expect(rule.token).not.toBe("");
        if (rule.foreground !== undefined) {
          expect(rule.foreground).toMatch(ruleColor);
        }
        if (rule.background !== undefined) {
          expect(rule.background).toMatch(ruleColor);
        }
      }
      for (const [id, color] of Object.entries(theme.colors)) {
        expect(id).not.toBe("");
        expect(color).toMatch(colorId);
      }
    }
  });

  it("keeps Kay Day's editor surface white, like Petrinaut's light chrome", () => {
    const kayDay = codeEditorThemes.find((theme) => theme.id === "kay-day");
    expect(kayDay?.colors["editor.background"]).toBe("#ffffff");
    expect(kayDay?.colors["editorGutter.background"]).toBe("#ffffff");
  });

  it("keeps a saved theme that still exists and falls back otherwise", () => {
    for (const theme of codeEditorThemes) {
      expect(resolveCodeEditorThemeId(theme.id)).toBe(theme.id);
    }
    expect(resolveCodeEditorThemeId("removed-theme")).toBe(
      defaultCodeEditorThemeId,
    );
  });
});
