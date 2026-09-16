/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StackedSectionHeader, StackedSections } from "./stacked-sections";

const sectionNames = ["Variables", "Parameters", "Initial state"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("stacks previous headings and returns to the selected section in its own scroll area", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const scrollTo = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function measureSection(this: HTMLElement) {
      const scroller = this.closest<HTMLElement>('[data-testid="scroll-area"]');
      const headers = Array.from(
        scroller?.querySelectorAll("[data-stack-header]") ?? [],
      );
      const header = this.hasAttribute("data-stack-anchor")
        ? this.nextElementSibling
        : this;
      const index = headers.indexOf(header as Element);
      const top =
        index < 0 ? 100 : 112 + index * 200 - (scroller?.scrollTop ?? 0);
      return {
        top,
        bottom: top + 32,
        height: 32,
        left: 0,
        right: 400,
        width: 400,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    },
  );
  render(
    <div
      data-testid="scroll-area"
      style={{ overflowY: "auto", paddingTop: 12, paddingBottom: 16 }}
    >
      <StackedSections>
        {sectionNames.map((name) => (
          <div key={name} style={{ display: "contents" }}>
            <StackedSectionHeader>
              {(title) => title(name)}
            </StackedSectionHeader>
            <div>{name} content</div>
          </div>
        ))}
      </StackedSections>
    </div>,
  );
  const variables = screen.getByRole("button", { name: "Back to Variables" });
  const parameters = screen.getByRole("button", {
    name: /(?:Back|Go) to Parameters/,
  });
  const initialState = screen.getByRole("button", {
    name: /(?:Back|Go) to Initial state/,
  });
  expect(variables.tabIndex).toBe(-1);
  const scroller = screen.getByTestId("scroll-area");
  scroller.scrollTo = scrollTo;
  Object.defineProperty(scroller, "clientHeight", { value: 220 });
  Object.defineProperty(scroller, "scrollHeight", {
    get: () =>
      450 +
      Number.parseFloat(
        scroller.querySelector<HTMLElement>("[data-stack-tail]")?.style
          .height ?? "0",
      ),
  });
  fireEvent.scroll(scroller);
  await waitFor(() =>
    expect(parameters.getAttribute("aria-label")).toBe("Go to Parameters"),
  );
  expect(initialState.tabIndex).toBe(0);
  await waitFor(() =>
    expect(
      scroller.querySelector<HTMLElement>("[data-stack-tail]")?.style.height,
    ).toBe("118px"),
  );
  expect(
    parameters.closest<HTMLElement>("[data-stack-header]")?.style.bottom,
  ).toBe("16px");
  expect(
    initialState.closest<HTMLElement>("[data-stack-header]")?.style.bottom,
  ).toBe("-16px");
  fireEvent.click(initialState);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 348, behavior: "instant" });
  scroller.scrollTop = 400;
  fireEvent.scroll(scroller);
  await waitFor(() => expect(variables.tabIndex).toBe(0));
  expect(parameters.tabIndex).toBe(0);
  expect(initialState.tabIndex).toBe(-1);
  expect(
    initialState.closest<HTMLElement>("[data-stack-header]")?.style.top,
  ).toBe("52px");
  fireEvent.click(parameters);
  expect(scrollTo).toHaveBeenCalledWith({ top: 180, behavior: "instant" });
  const parameterFade = parameters
    .closest("[data-stack-header]")
    ?.querySelector<HTMLElement>('[data-scroll-fade="top"]');
  scroller.scrollTop = 183;
  fireEvent.scroll(scroller);
  await waitFor(() => expect(parameterFade?.style.opacity).toBe("1"));
  scroller.scrollTop = 180.5;
  fireEvent.scroll(scroller);
  await waitFor(() => expect(parameterFade?.style.opacity).toBe("0"));
  fireEvent.click(variables);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 12, behavior: "instant" });
  scroller.scrollTop = 0;
  fireEvent.scroll(scroller);
  await waitFor(() => expect(variables.tabIndex).toBe(-1));
});
