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

/** WCAG 2 relative luminance of a `#RRGGBB` or `RRGGBB` colour. */
const luminance = (hex: string) => {
  const digits = hex.replace("#", "");
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((offset) => {
    const channel = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (first: string, second: string) => {
  const [lighter = 0, darker = 0] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
};

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

  it("gives every token colour 4.5:1 contrast on the theme's own surface", () => {
    for (const theme of codeEditorThemes) {
      const surface = theme.colors["editor.background"];
      if (surface === undefined) {
        continue;
      }
      for (const rule of theme.rules) {
        if (rule.foreground !== undefined) {
          expect(
            contrastRatio(rule.foreground, surface),
            `${theme.id} ${rule.token}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
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
