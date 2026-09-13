// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsHeading } from "./settings-heading";

const general = {
  id: "general",
  label: "General",
  description: "General settings",
} as const;
const viewport = {
  id: "viewport",
  label: "Viewport",
  description: "Viewport settings",
} as const;
const labs = {
  id: "labs",
  label: "Labs",
  description: "Experimental settings",
} as const;
const cancelAnimation = vi.fn();
const animate = vi.fn(() => ({ cancel: cancelAnimation }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

describe("settings heading transitions", () => {
  it("animates the title row from below in either direction, cancelling interrupted motion", () => {
    const { rerender, unmount } = render(
      <SettingsHeading section={general} index={0} animated />,
    );
    expect(animate).not.toHaveBeenCalled();
    rerender(<SettingsHeading section={viewport} index={1} animated />);
    expect(screen.getByRole("heading", { name: "Viewport" })).toBeTruthy();
    expect(animate.mock.contexts.at(-1)).toBe(
      screen.getByRole("heading").parentElement,
    );
    expect(animate).toHaveBeenLastCalledWith(
      [
        { opacity: 0, filter: "blur(2px)", transform: "translateY(3px)" },
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
      ],
      expect.objectContaining({ duration: 220 }),
    );
    rerender(<SettingsHeading section={general} index={0} animated />);
    expect(cancelAnimation).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts.at(-1)).toBe(
      screen.getByRole("heading").parentElement,
    );
    expect(animate).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: "translateY(3px)" }),
      ]),
      expect.any(Object),
    );
    unmount();
    expect(cancelAnimation).toHaveBeenCalledTimes(2);
  });

  it.each(["preference", "system"])(
    "respects the %s motion setting",
    (source) => {
      const animated = source !== "preference";
      if (source === "system")
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const { rerender } = render(
        <SettingsHeading section={general} index={0} animated={animated} />,
      );
      rerender(
        <SettingsHeading section={viewport} index={1} animated={animated} />,
      );
      expect(screen.getByRole("heading", { name: "Viewport" })).toBeTruthy();
      expect(animate).not.toHaveBeenCalled();
    },
  );

  it("renders only the latest heading during rapid direction changes", () => {
    const { rerender } = render(
      <SettingsHeading section={general} index={0} animated />,
    );
    for (const [section, index] of [
      [viewport, 1],
      [labs, 3],
      [general, 0],
    ] as const) {
      rerender(<SettingsHeading section={section} index={index} animated />);
      expect(screen.getAllByRole("heading")).toHaveLength(1);
      expect(screen.getByRole("heading").textContent).toBe(section.label);
      expect(screen.getByText(section.description)).toBeTruthy();
      const animatedRow = animate.mock.contexts.at(-1) as HTMLElement;
      expect(animatedRow.contains(screen.getByText(section.description))).toBe(
        false,
      );
      if (section.id === "labs") {
        expect(animatedRow.contains(screen.getByText(/Experimental$/))).toBe(
          true,
        );
      }
    }
    expect(animate).toHaveBeenCalledTimes(3);
    expect(cancelAnimation).toHaveBeenCalledTimes(2);
  });
});
