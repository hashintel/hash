// @vitest-environment jsdom
import { ButtonBase, ThemeProvider } from "@mui/material";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { makeRow } from "./dependent-type-fixtures";
import { VersionGraphTooltip } from "./version-graph-tooltip";

import type { DependentTypeRow } from "./dependent-type-rows";

const shellCompany = makeRow(
  "Shell Company",
  4,
  [
    [1, 2, 1],
    [2, 2, 2],
    [4, 4, 2],
  ],
  true,
);
const shellCompanySummary =
  "Shell Company: v1 extends Company v1; v2 extends Company v1 and v2; v3 doesn't extend Company, or is archived; v4 extends Company v2. Company has versions newer than v2. Its newer versions don't extend Company, or are archived.";

const machine = makeRow("Machine", 2, [
  [1, 1, 1],
  [2, 2, 2],
]);

const renderRows = (rows: DependentTypeRow[]) => {
  render(
    <ThemeProvider theme={theme}>
      {rows.map((row) => {
        const { title } = row.entityType.schema;
        return (
          <VersionGraphTooltip
            key={title}
            row={row}
            parentTitle="Company"
            parentLatestVersion={3}
          >
            {({ toggleProps, hide }) => (
              <div data-testid={title}>
                <ButtonBase {...toggleProps} onClick={hide}>
                  {title}
                </ButtonBase>
              </div>
            )}
          </VersionGraphTooltip>
        );
      })}
    </ThemeProvider>,
  );
};

const wait = (milliseconds: number) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });

/** Lets a closing tooltip finish fading out, after which MUI unmounts it. */
const waitForFadeOut = () => wait(300);

// jsdom never matches `:focus-visible`, which MUI checks to tell keyboard focus from a mouse press.
const focusWithKeyboard = (element: HTMLElement) => {
  const matches = element.matches.bind(element);
  const focusVisible = vi
    .spyOn(element, "matches")
    .mockImplementation(
      (selector) => selector === ":focus-visible" || matches(selector),
    );

  act(() => {
    element.focus();
  });

  focusVisible.mockRestore();
};

describe("VersionGraphTooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the graph 300 ms after the pointer enters the row", () => {
    renderRows([shellCompany]);

    fireEvent.mouseOver(screen.getByTestId("Shell Company"));
    wait(299);
    expect(screen.queryByRole("tooltip")).toBeNull();

    wait(1);
    screen.getByRole("tooltip");
  });

  it("does not show the graph when the pointer leaves the row before the delay", () => {
    renderRows([shellCompany]);

    const row = screen.getByTestId("Shell Company");
    fireEvent.mouseOver(row);
    wait(200);
    fireEvent.mouseLeave(row);
    wait(1000);

    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the graph 80 ms after the pointer leaves the row", () => {
    renderRows([shellCompany]);

    const row = screen.getByTestId("Shell Company");
    fireEvent.mouseOver(row);
    wait(300);
    fireEvent.mouseLeave(row);
    wait(79);
    screen.getByRole("tooltip");

    wait(1);
    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open while the pointer is on it", () => {
    renderRows([shellCompany]);

    const row = screen.getByTestId("Shell Company");
    fireEvent.mouseOver(row);
    wait(300);
    fireEvent.mouseLeave(row);
    wait(50);
    const tooltip = screen.getByRole("tooltip");
    fireEvent.mouseOver(tooltip);
    wait(1000);
    screen.getByRole("tooltip");

    fireEvent.mouseLeave(tooltip);
    wait(80);
    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("waits the same delay on every row, so only one graph shows at a time", () => {
    renderRows([machine, shellCompany]);

    fireEvent.mouseOver(screen.getByTestId("Machine"));
    wait(300);
    fireEvent.mouseLeave(screen.getByTestId("Machine"));
    fireEvent.mouseOver(screen.getByTestId("Shell Company"));
    // The first graph closes after 80 ms and finishes its 200 ms fade before the second opens.
    wait(80);
    wait(219);
    expect(screen.queryByRole("tooltip")).toBeNull();

    wait(1);
    expect(
      screen.getAllByRole("tooltip").map((tooltip) => tooltip.textContent),
    ).toEqual([expect.stringContaining(shellCompanySummary)]);
  });

  it("shows the graph at once when the toggle gets focus, and describes the toggle with a summary of the versions", () => {
    renderRows([shellCompany]);

    focusWithKeyboard(screen.getByRole("button", { name: "Shell Company" }));

    screen.getByRole("button", {
      name: "Shell Company",
      description: shellCompanySummary,
    });
  });

  it("does not show the graph when a mouse press focuses the toggle", () => {
    renderRows([shellCompany]);

    const toggle = screen.getByRole("button", { name: "Shell Company" });
    act(() => {
      fireEvent.mouseDown(toggle);
      toggle.focus();
    });

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the graph when the toggle loses focus", () => {
    renderRows([shellCompany]);

    const toggle = screen.getByRole("button", { name: "Shell Company" });
    focusWithKeyboard(toggle);
    act(() => {
      toggle.blur();
    });

    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(toggle.hasAttribute("aria-describedby")).toBe(false);
  });

  it("hides the graph on Escape while the toggle has focus", () => {
    renderRows([shellCompany]);

    const toggle = screen.getByRole("button", { name: "Shell Company" });
    focusWithKeyboard(toggle);
    fireEvent.keyDown(toggle, { key: "Escape" });

    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the graph on Escape while the pointer is on the row", () => {
    renderRows([shellCompany]);

    fireEvent.mouseOver(screen.getByTestId("Shell Company"));
    wait(300);
    fireEvent.keyDown(document.body, { key: "Escape" });

    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the graph when the row is toggled", () => {
    renderRows([shellCompany]);

    const toggle = screen.getByRole("button", { name: "Shell Company" });
    focusWithKeyboard(toggle);
    fireEvent.click(toggle);

    waitForFadeOut();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("draws the parent's versions, the type's versions with a dotted pill for the gap, a line for each extension, and a key", () => {
    renderRows([shellCompany]);

    focusWithKeyboard(screen.getByRole("button", { name: "Shell Company" }));
    const tooltip = screen.getByRole("tooltip");

    expect(
      within(tooltip)
        .getAllByText(/^v\d+$/)
        .map((pill) => pill.textContent),
    ).toEqual(["v1", "v2", "v1", "v2", "v3", "v4"]);
    expect(within(tooltip).getAllByText("…")).toHaveLength(2);
    expect(tooltip.querySelectorAll("path")).toHaveLength(4);
    expect(getComputedStyle(within(tooltip).getByText("v3")).borderStyle).toBe(
      "dotted",
    );
    within(tooltip).getByText("Company");
    within(tooltip).getByText(
      "version that doesn't extend Company, or is archived",
    );
  });

  it("shows no key when every version extends the parent", () => {
    renderRows([machine]);

    focusWithKeyboard(screen.getByRole("button", { name: "Machine" }));

    expect(
      within(screen.getByRole("tooltip")).queryByText(
        "version that doesn't extend Company, or is archived",
      ),
    ).toBeNull();
  });

  it("opens scrolled to the newest versions", () => {
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(900);
    renderRows([shellCompany]);

    focusWithKeyboard(screen.getByRole("button", { name: "Shell Company" }));

    expect(
      [...screen.getByRole("tooltip").querySelectorAll("div")].filter(
        (element) => element.scrollLeft === 900,
      ),
    ).toHaveLength(1);
  });

  describe("with the Left and Right arrow keys", () => {
    const scrollBy = vi.fn<(this: Element, options: ScrollToOptions) => void>();

    beforeEach(() => {
      scrollBy.mockReset();
      Object.defineProperty(Element.prototype, "scrollBy", {
        value: scrollBy,
        configurable: true,
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, "scrollBy");
    });

    it("scrolls the graph sideways while the toggle has focus", () => {
      renderRows([shellCompany]);

      const toggle = screen.getByRole("button", { name: "Shell Company" });
      focusWithKeyboard(toggle);

      expect(fireEvent.keyDown(toggle, { key: "ArrowRight" })).toBe(false);
      expect(scrollBy).toHaveBeenLastCalledWith({
        left: 120,
        behavior: "smooth",
      });
      expect(fireEvent.keyDown(toggle, { key: "ArrowLeft" })).toBe(false);
      expect(scrollBy).toHaveBeenLastCalledWith({
        left: -120,
        behavior: "smooth",
      });
      const tooltip = screen.getByRole("tooltip");
      expect(
        scrollBy.mock.contexts.every((element) => tooltip.contains(element)),
      ).toBe(true);
    });

    it("leaves the keys alone once the graph is hidden", () => {
      renderRows([shellCompany]);

      const toggle = screen.getByRole("button", { name: "Shell Company" });
      focusWithKeyboard(toggle);
      fireEvent.keyDown(toggle, { key: "Escape" });

      expect(fireEvent.keyDown(toggle, { key: "ArrowRight" })).toBe(true);
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });
});
