/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { svgIcons } from "./icons";
import { SvgIcon } from "./svg-icon";
import { svgIconToString } from "./to-svg-string";

import type { SvgIconName } from "./icons";

afterEach(cleanup);

const names = Object.keys(svgIcons) as SvgIconName[];

const parseSvg = (markup: string) =>
  new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;

/** The geometry only, so the React and file outputs can be compared. */
const describeElement = (element: Element): string => {
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name !== "xmlns")
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .sort()
    .join(" ");
  const children = Array.from(element.children, describeElement).join("");
  return `<${element.tagName} ${attributes}>${children}</>`;
};

const geometryOf = (svg: Element) =>
  Array.from(svg.children)
    .filter((child) => child.tagName !== "style")
    .map(describeElement)
    .join("");

describe("SvgIcon", () => {
  it.each(names)(
    "renders %s with the same geometry as its SVG file",
    (name) => {
      const file = parseSvg(svgIconToString(name));
      const { container } = render(<SvgIcon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(geometryOf(svg!)).toBe(geometryOf(file));
      expect(svg!.getAttribute("class")).toBe(file.getAttribute("class"));
    },
  );

  it.each(names)("ships the motion of %s inside its SVG file", (name) => {
    const file = parseSvg(svgIconToString(name));
    expect(file.querySelector("parsererror")).toBeNull();
    expect(file.querySelector("style")?.textContent).toContain(
      svgIcons[name].css.trim(),
    );
  });

  it("drives motion with CSS inputs, not JS animation", () => {
    const { container } = render(
      <SvgIcon
        name="loading"
        progress={1.4}
        weight={900}
        size={20}
        duration={250}
        active
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.style.getPropertyValue("--ds-icon-progress")).toBe("1");
    expect(svg.style.getPropertyValue("--ds-icon-weight")).toBe("700");
    expect(svg.style.getPropertyValue("--ds-icon-size")).toBe("20px");
    expect(svg.style.getPropertyValue("--ds-icon-duration")).toBe("250ms");
    expect(svg.hasAttribute("data-active")).toBe(true);
  });

  it("leaves size and weight to the context when no prop is set", () => {
    const { container } = render(<SvgIcon name="play" />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.getPropertyValue("--ds-icon-size")).toBe("");
    expect(svg.style.getPropertyValue("--ds-icon-weight")).toBe("");
  });

  it("restarts the one-shot each time the trigger changes", () => {
    const { container, rerender } = render(<SvgIcon name="play" />);
    const svg = () => container.querySelector("svg")!;
    expect(svg().hasAttribute("data-run")).toBe(false);
    const runs = [1, 2, 3].map((trigger) => {
      rerender(<SvgIcon name="play" trigger={trigger} />);
      return svg().getAttribute("data-run");
    });
    expect(runs).toEqual(["odd", "even", "odd"]);
  });

  it("hoists one copy of each stylesheet for many icons", () => {
    render(
      <>
        <SvgIcon name="play" />
        <SvgIcon name="play" />
        <SvgIcon name="playback" />
      </>,
    );
    const hrefs = Array.from(
      document.head.querySelectorAll("style[data-href]"),
      (style) => style.getAttribute("data-href"),
    );
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "ds-icon-base",
        "ds-icon-play",
        "ds-icon-playback",
      ]),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(document.querySelectorAll("svg style")).toHaveLength(0);
  });

  it("labels the icon only when the host names it", () => {
    const { container } = render(
      <>
        <SvgIcon name="play" />
        <SvgIcon name="play" aria-label="Run simulation" />
      </>,
    );
    const [hidden, labelled] = container.querySelectorAll("svg");
    expect(hidden!.getAttribute("aria-hidden")).toBe("true");
    expect(labelled!.getAttribute("role")).toBe("img");
  });
});
