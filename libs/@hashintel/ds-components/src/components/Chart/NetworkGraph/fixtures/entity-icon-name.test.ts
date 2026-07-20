import { describe, expect, it } from "vitest";

import { iconNameFromEntityIcon } from "./entity-icon-name";

describe("iconNameFromEntityIcon", () => {
  it("maps a served type-icon path to its ds icon", () => {
    expect(iconNameFromEntityIcon("/icons/types/microscope.svg")).toBe(
      "microscope",
    );
    expect(iconNameFromEntityIcon("/icons/types/diagram-project.svg")).toBe(
      "diagramProject",
    );
  });

  it("remaps a served icon onto the closest existing ds icon", () => {
    // `box` has no ds `box`; the nearest existing glyph is `cube`.
    expect(iconNameFromEntityIcon("/icons/types/box.svg")).toBe("cube");
    // Whole families collapse onto one ds glyph.
    expect(iconNameFromEntityIcon("/icons/types/truck-ramp-box.svg")).toBe(
      "truck",
    );
    expect(iconNameFromEntityIcon("/icons/types/user-tie.svg")).toBe(
      "userPlus",
    );
    // `arrows-rotate` is registered under the ds name `refresh`.
    expect(iconNameFromEntityIcon("/icons/types/arrows-rotate.svg")).toBe(
      "refresh",
    );
  });

  it("maps an absolute https URL by its basename, ignoring query/hash", () => {
    expect(
      iconNameFromEntityIcon("https://example.com/assets/cube.svg?v=2"),
    ).toBe("cube");
  });

  it("ignores emoji and other non-SVG values", () => {
    expect(iconNameFromEntityIcon("📄")).toBeUndefined();
    expect(iconNameFromEntityIcon("box")).toBeUndefined();
  });

  it("returns undefined for a served icon with no ds equivalent (never drawn)", () => {
    // Brand logos and one-off glyphs are intentionally unmapped.
    expect(iconNameFromEntityIcon("/icons/types/github.svg")).toBeUndefined();
    expect(iconNameFromEntityIcon("/icons/types/warehouse.svg")).toBe(
      undefined,
    );
  });

  it("returns undefined for empty, null, or undefined input", () => {
    expect(iconNameFromEntityIcon("")).toBeUndefined();
    expect(iconNameFromEntityIcon(null)).toBeUndefined();
    expect(iconNameFromEntityIcon(undefined)).toBeUndefined();
  });
});
