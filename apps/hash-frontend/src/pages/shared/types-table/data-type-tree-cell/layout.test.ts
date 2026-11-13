import { describe, expect, it } from "vitest";

import { getDataTypeCellLayout as layoutParts } from "./layout";

import type { DataTypeLabelPart } from "../shared/data-type-label-preview";

const getDataTypeCellLayout = (
  options: Omit<Parameters<typeof layoutParts>[0], "preview"> & {
    preview?: string;
  },
) => {
  const result = layoutParts({
    ...options,
    preview: options.preview
      ? [{ kind: "label", text: options.preview }]
      : undefined,
  });
  return {
    ...result,
    preview: result.preview.map(({ text }) => text).join(""),
  };
};

const measure = (text: string) => Array.from(text).length * 7;

describe("data type title and preview layout", () => {
  it("measures placeholder and label fonts separately and preserves their styling through truncation", () => {
    const preview: DataTypeLabelPart[] = [
      { kind: "label", text: "$" },
      { kind: "placeholder", text: "value" },
      { kind: "label", text: " per hour with a long label" },
    ];
    const mixedMeasure = (text: string, kind?: DataTypeLabelPart["kind"]) =>
      text.length * (kind === "placeholder" ? 5 : 7);
    const result = layoutParts({
      title: "Rate",
      preview,
      availableWidth: 300,
      measure: mixedMeasure,
    });
    expect(result.preview.slice(0, 2)).toEqual(preview.slice(0, 2));
    expect(result.preview.at(-1)).toEqual({ kind: "punctuation", text: "…" });
    expect(result.previewWidth).toBe(
      result.preview.reduce(
        (width, part) => width + mixedMeasure(part.text, part.kind),
        0,
      ),
    );
    expect(result.chipAreaWidth + result.previewWidth + 16).toBe(300);
  });
  it("keeps short labels intact and reserves room between the chip and preview", () => {
    const layout = getDataTypeCellLayout({
      title: "Meters",
      preview: "value m",
      availableWidth: 300,
      measure,
    });
    expect(layout.title).toBe("Meters");
    expect(layout.preview).toBe("value m");
    expect(layout.chipAreaWidth + measure(layout.preview) + 16).toBe(300);
  });

  it("truncates both a long title and a complex preview without overlap", () => {
    const layout = getDataTypeCellLayout({
      title: "A long data type with a very long name",
      preview: "[value millimeters, value seconds, value degrees Celsius]",
      availableWidth: 240,
      measure,
    });
    expect(layout.title).toMatch(/…$/u);
    expect(layout.preview).toMatch(/^\[.*…$/u);
    expect(measure(layout.title) + 44 + 16).toBeLessThanOrEqual(
      layout.chipAreaWidth,
    );
    expect(
      layout.chipAreaWidth + 16 + measure(layout.preview),
    ).toBeLessThanOrEqual(240);
  });

  it("preserves the title when the preview cannot fit in a narrow or deeply indented cell", () => {
    for (const availableWidth of [0, 20, 80, 100]) {
      const layout = getDataTypeCellLayout({
        title: "Meters",
        preview: "value m",
        availableWidth,
        measure,
      });
      expect(layout.preview).toBe("");
      expect(layout.chipAreaWidth).toBe(availableWidth);
    }
  });

  it("does not split Unicode code points when truncating", () => {
    const layout = getDataTypeCellLayout({
      title: "𐀀𐀀𐀀𐀀𐀀𐀀",
      availableWidth: 88,
      measure,
    });
    expect(layout.title).toBe("𐀀𐀀𐀀…");
  });
});
