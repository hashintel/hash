/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HashIcon } from "../hash-icon";
import { StaticHashIcon } from "../static";

describe.each([
  { renderer: "main", IconComponent: HashIcon },
  { renderer: "static", IconComponent: StaticHashIcon },
])("monitoring artwork in the $renderer renderer", ({ IconComponent }) => {
  it.each(["outline", "filled"] as const)(
    "preserves molecular atom counts and open bonds in the %s variant",
    (variant) => {
      for (const [name, atoms] of [
        ["methane", 5],
        ["carbonDioxide", 3],
        ["oxygen", 2],
        ["carbonMonoxide", 2],
        ["hydrogenSulfide", 3],
        ["sulfurDioxide", 3],
      ] as const) {
        const rendered = new DOMParser().parseFromString(
          renderToStaticMarkup(<IconComponent name={name} variant={variant} />),
          "image/svg+xml",
        );
        const circles = rendered.querySelectorAll("circle");
        expect(circles, name).toHaveLength(atoms);
        for (const atom of circles) {
          expect(atom.closest("[fill]")?.getAttribute("fill"), name).toBe(
            variant === "filled" ? "currentColor" : "none",
          );
        }
        const bonds = rendered.querySelectorAll("path");
        expect(bonds.length, name).toBeGreaterThan(0);
        for (const bond of bonds) {
          expect(bond.closest("[fill]")?.getAttribute("fill"), name).toBe(
            "none",
          );
        }
      }
    },
  );

  it("keeps particle sizes distinct without depending on a font", () => {
    const marks = (
      [
        "particulateMatter1",
        "particulateMatter2Point5",
        "particulateMatter10",
        "particulateMatterTotal",
      ] as const
    ).map((name) => {
      const rendered = new DOMParser().parseFromString(
        renderToStaticMarkup(<IconComponent name={name} />),
        "image/svg+xml",
      );
      expect(rendered.querySelector("text, foreignObject, image")).toBeNull();
      const paths = [...rendered.querySelectorAll("path")].map((path) =>
        path.getAttribute("d"),
      );
      expect(paths.length).toBeGreaterThan(0);
      return paths.join(" ");
    });
    expect(new Set(marks).size).toBe(marks.length);
  });
});
