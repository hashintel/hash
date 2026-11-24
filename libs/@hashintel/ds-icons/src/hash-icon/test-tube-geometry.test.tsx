/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { hashIconCatalog } from "../catalog";
import {
  HashIcon,
  TestTubeCheckIcon,
  TestTubeCrossIcon,
  TestTubeIcon,
} from "../hash-icon";

describe("Test tube results", () => {
  it.each(["outline", "filled"] as const)(
    "distinguishes an experiment, success, and failure in the %s variant",
    (variant) => {
      for (const name of [
        "testTube",
        "testTubeCheck",
        "testTubeCross",
      ] as const) {
        const rendered = new DOMParser().parseFromString(
          renderToStaticMarkup(
            <HashIcon name={name} variant={variant} motion="none" />,
          ),
          "image/svg+xml",
        );
        expect(
          rendered.querySelector('[data-icon-detail="liquid-level"]'),
        ).not.toBeNull();
        const result = rendered.querySelector(
          '[data-icon-detail="test-result"]',
        );
        if (name === "testTube") {
          expect(result).toBeNull();
        } else {
          expect(result?.getAttribute("d")).toBe(
            name === "testTubeCheck" ? "m14 18 2 2 5-5" : "m15 15 5 5m0-5-5 5",
          );
          expect(result?.getAttribute("fill")).toBe("none");
        }
      }
    },
  );

  it("exposes all three named components and related Code entries", () => {
    const icons = {
      testTube: TestTubeIcon,
      testTubeCheck: TestTubeCheckIcon,
      testTubeCross: TestTubeCrossIcon,
    };
    for (const [name, Icon] of Object.entries(icons)) {
      expect(renderToStaticMarkup(<Icon motion="none" />)).toContain(
        `data-icon="${name}"`,
      );
      const entry = hashIconCatalog.find((icon) => icon.name === name);
      expect(entry?.category).toBe("Code");
      expect(entry?.related).toEqual(
        expect.arrayContaining(
          Object.keys(icons).filter((other) => other !== name),
        ),
      );
    }
  });
});
