/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { hashIconNames } from "./hash-icon";
import {
  getHashIconArtwork,
  getHashIconStrokeWidth,
  StaticHashIcon,
} from "./static";

import type { HashIconName, HashIconVariant } from "./hash-icon";

afterEach(cleanup);

describe("static artwork", () => {
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
