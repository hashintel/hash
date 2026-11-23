/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HashIcon, hashIconNames } from "./hash-icon";
import {
  getHashIconArtwork,
  getHashIconStrokeWidth,
  StaticHashIcon,
} from "./static";

import type { HashIconName, HashIconVariant } from "./hash-icon";

afterEach(cleanup);

describe("static artwork", () => {
  it.each([
    { renderer: "main", IconComponent: HashIcon },
    { renderer: "static", IconComponent: StaticHashIcon },
  ])(
    "keeps Semi Fill's shade unstroked in the $renderer renderer",
    ({ IconComponent }) => {
      for (const variant of ["outline", "filled"] as const) {
        const { container, unmount } = render(
          <IconComponent name="fillSemi" variant={variant} />,
        );
        const shade = container.querySelector('rect[opacity=".4"]');
        expect(shade?.getAttribute("stroke")).toBe("none");
        expect(shade?.getAttribute("fill")).toBe("currentColor");
        expect(container.querySelectorAll("rect")).toHaveLength(2);
        unmount();
      }
    },
  );

  it("resolves stroke variables for raw artwork at every supported weight", () => {
    for (const name of hashIconNames) {
      for (const variant of ["outline", "filled"] as const) {
        for (const weight of [100, 400, 700]) {
          const markup = getHashIconArtwork(
            name,
            variant,
            "raw",
            getHashIconStrokeWidth(weight),
          );
          expect(markup, name).not.toContain("var(--hash-icon-");
        }
      }
    }
  });

  it.each([
    { name: "filePdf", scale: 0.6 },
    { name: "logicNext", scale: 0.8 },
    { name: "warning", scale: 1.25 },
    { name: "chartBarSimple", scale: 1.4 },
  ] as const)("scales $name details in raw SVG markup", ({ name, scale }) => {
    for (const strokeWidth of [0, 1, 1.75, 2.5]) {
      const markup = getHashIconArtwork(name, "outline", "raw", strokeWidth);
      expect(markup).toContain(
        `stroke-width="${Number((strokeWidth * scale).toFixed(6))}"`,
      );
    }
  });

  it.each([Number.NaN, Infinity, -Infinity, '"/><script>'])(
    "uses the default raw stroke width for an invalid runtime width: %s",
    (strokeWidth) => {
      expect(
        getHashIconArtwork("filePdf", "outline", "raw", strokeWidth as number),
      ).toBe(getHashIconArtwork("filePdf", "outline", "raw"));
    },
  );

  it("preserves CSS stroke sizing in the React renderer", () => {
    const { container } = render(
      <StaticHashIcon name="filePdf" strokeWidth="0.125em" />,
    );
    const artwork = container.querySelector("svg > g") as SVGGElement;
    expect(artwork.getAttribute("stroke-width")).toBe("0.125em");
    expect(artwork.style.getPropertyValue("--hash-icon-stroke-width")).toBe(
      "0.125em",
    );
    expect(artwork.innerHTML).toContain(
      "calc(var(--hash-icon-stroke-width) * .6)",
    );
  });

  it.each([
    { renderer: "main", IconComponent: HashIcon },
    { renderer: "static", IconComponent: StaticHashIcon },
  ])(
    "keeps filled logic state markers unstroked in the $renderer renderer",
    ({ IconComponent }) => {
      for (const name of [
        "logicNext",
        "logicUntil",
        "logicBranching",
        "logicStateSequence",
      ] as const) {
        for (const variant of ["outline", "filled"] as const) {
          for (const weight of [100, 400, 700]) {
            const { container, unmount } = render(
              <IconComponent name={name} variant={variant} weight={weight} />,
            );
            const markers = container.querySelectorAll(
              'circle[fill="currentColor"]',
            );
            expect(markers).toHaveLength(1);
            expect(
              markers[0]?.closest("[stroke]")?.getAttribute("stroke"),
            ).toBe("none");
            unmount();
          }
        }
      }
    },
  );

  it.each([
    { renderer: "main", IconComponent: HashIcon },
    { renderer: "static", IconComponent: StaticHashIcon },
  ])(
    "preserves open and closed arrowhead meanings in the $renderer renderer",
    ({ IconComponent }) => {
      for (const variant of ["outline", "filled"] as const) {
        for (const weight of [100, 400, 700]) {
          const { getByRole, unmount } = render(
            <>
              <IconComponent
                name="arrowheadArrow"
                variant={variant}
                weight={weight}
                aria-label="Open arrowhead"
              />
              <IconComponent
                name="arrowheadTriangle"
                variant={variant}
                weight={weight}
                aria-label="Closed arrowhead"
              />
            </>,
          );
          const openPaths = getByRole("img", {
            name: "Open arrowhead",
          }).querySelectorAll("path");
          expect(openPaths.length).toBeGreaterThan(0);
          for (const path of openPaths) {
            expect(path.closest("[fill]")?.getAttribute("fill")).toBe("none");
          }
          const closedPaths = getByRole("img", {
            name: "Closed arrowhead",
          }).querySelectorAll("path");
          expect(
            [...closedPaths].some(
              (path) =>
                path.closest("[fill]")?.getAttribute("fill") === "currentColor",
            ),
          ).toBe(variant === "filled");
          unmount();
        }
      }
    },
  );

  it("includes both styles of every canonical icon without animation classes", () => {
    for (const name of hashIconNames)
      for (const variant of ["outline", "filled"] as const) {
        const artwork = getHashIconArtwork(name, variant);
        expect(artwork, name).toMatch(
          /<(?:path|rect|circle|ellipse|polygon|line|polyline)\b/,
        );
        expect(artwork).not.toMatch(/class=|data-petricon|__HASH_ICON_ID_/);
      }
  });

  it("scopes cutout references to each instance", () => {
    const { container } = render(
      <>
        <StaticHashIcon name="filePdf" variant="filled" />
        <StaticHashIcon name="filePdf" variant="filled" />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll("svg"))
      for (const node of svg.querySelectorAll("[mask]")) {
        const id = node.getAttribute("mask")!.slice(5, -1);
        expect(
          [...svg.querySelectorAll("[id]")].some((mask) => mask.id === id),
        ).toBe(true);
      }
  });

  it("preserves labels and clamps weight", () => {
    const { getByRole, container } = render(
      <>
        <StaticHashIcon name="check" aria-label="Complete" />
        <StaticHashIcon name="check" weight={900} />
      </>,
    );
    expect(
      getByRole("img", { name: "Complete" }).hasAttribute("aria-hidden"),
    ).toBe(false);
    expect(
      container
        .querySelector('svg[aria-hidden="true"] > g')
        ?.getAttribute("stroke-width"),
    ).toBe("2.5");
    expect(getHashIconStrokeWidth(Number.NaN)).toBe(1.75);
    expect(getHashIconStrokeWidth(-1)).toBe(1);
  });

  it.each([
    "missing-icon",
    "__proto__",
    "constructor",
    "toString",
    '"><image href="x" onerror="alert(1)">',
    null,
    undefined,
    42,
  ])("renders no artwork for an invalid runtime name: %s", (name) => {
    const { container } = render(
      <StaticHashIcon name={name as HashIconName} />,
    );
    expect(container.querySelector("svg > g")?.innerHTML).toBe("");
  });

  it.each([
    "missing-style",
    "__proto__",
    "constructor",
    "toString",
    '"><image href="x" onerror="alert(1)">',
    null,
    42,
  ])("renders no artwork for an invalid runtime variant: %s", (variant) => {
    const { container } = render(
      <StaticHashIcon name="filePdf" variant={variant as HashIconVariant} />,
    );
    expect(container.querySelector("svg > g")?.innerHTML).toBe("");
  });

  it("rejects object selectors without coercing them to property keys", () => {
    const name = {
      toString: () => {
        throw new Error("Unexpected property-key coercion");
      },
    };
    expect(getHashIconArtwork(name as unknown as HashIconName)).toBe("");
    expect(
      getHashIconArtwork("filePdf", name as unknown as HashIconVariant),
    ).toBe("");
  });

  it("does not interpolate markup in an ID prefix", () => {
    expect(
      getHashIconArtwork("filePdf", "filled", '"/><script>'),
    ).not.toContain("<script>");
  });
});
