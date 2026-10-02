// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { type InterviewBudgetLevel } from "../../../shared/interview-budget";
import { NoopResizeObserver } from "../shared/petrinaut-jsdom";
import {
  InterviewBudgetControl,
  InterviewBudgetNote,
  InterviewBudgetPill,
} from "./interview-budget-control";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

beforeEach(() => vi.stubGlobal("ResizeObserver", NoopResizeObserver));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const Harness = () => {
  const [level, setLevel] = useState<InterviewBudgetLevel>("standard");
  return <InterviewBudgetControl level={level} onChange={setLevel} />;
};

test.each([
  ["quick", "Quick · ~5 min"],
  ["standard", "Standard · ~10 min"],
  ["thorough", "Thorough · ~20 min"],
  ["deep", "Deep · No limit"],
  ["off", "Off"],
] as const)("keeps the %s note free of budget wording", (level, text) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const { container } = render(<InterviewBudgetNote level={level} />);
  expect(container.textContent).toBe(text);
  expect(container.querySelector("svg")?.getAttribute("width")).toBe("12");
});

test("opens a five-stop control with hover descriptions and keyboard-accessible level selection", async () => {
  render(<Harness />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Interview budget: Standard · ~10 min",
    }),
  );
  const slider = await screen.findByRole("slider", {
    name: "Interview budget level",
  });
  expect(slider.getAttribute("aria-valuetext")).toBe("Standard · ~10 min");
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
    left: 100,
    width: 308,
    right: 408,
    top: 0,
    bottom: 32,
    height: 32,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.mouseMove(slider, { clientX: 394 });
  expect(screen.getByText("Deep", { selector: "strong" })).toBeTruthy();
  // Previewing a stop must not change the current selection in the header.
  expect(slider.getAttribute("aria-valuetext")).toBe("Standard · ~10 min");
  fireEvent.mouseEnter(screen.getByRole("button", { name: "Deep" }));
  expect(screen.getByText(/Probes units, ranges and edge cases/)).toBeTruthy();
  fireEvent.change(slider, { target: { value: "1" } });
  expect(slider.getAttribute("aria-valuetext")).toBe("Quick · ~5 min");
  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(
    screen.getByRole("button", { name: "Interview budget: Off · No budget" }),
  ).toBeTruthy();
});

test("Escape closes the control and returns focus to its trigger", async () => {
  render(<Harness />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Interview budget: Standard · ~10 min",
    }),
  );
  const slider = await screen.findByRole("slider", {
    name: "Interview budget level",
  });
  await waitFor(() => expect(document.activeElement).toBe(slider));
  fireEvent.keyDown(slider, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("slider")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Interview budget: Standard · ~10 min",
      }),
    ),
  );
});

test("pill counts canonical replies, changes with mode and disappears for Off", async () => {
  const context: PetrinautAiComposerControlContext = {
    conversationId: "conversation",
    status: "ready" as const,
    messages: Array.from({ length: 5 }, (_, index) => ({
      id: `reply-${index}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Recorded." }],
    })),
    stop: vi.fn(),
    submitText: vi.fn(),
  };
  const { rerender } = render(
    <InterviewBudgetPill level="standard" context={context} />,
  );
  expect(screen.getByRole("status").textContent).toBe("Last question · ~2 min");
  const trigger = screen.getByRole("status").parentElement;
  if (!trigger) throw new Error("Missing estimate tooltip trigger");
  fireEvent.focus(trigger);
  const card = await screen.findByRole("tooltip");
  expect(card.textContent).toContain("6 questions · 5 asked · 1 left");
  expect(card.textContent).toContain("open");
  rerender(
    <InterviewBudgetPill
      level="standard"
      context={{ ...context, inputMode: "voice" }}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("Wrapping up");
  rerender(<InterviewBudgetPill level="deep" context={context} />);
  expect(screen.getByRole("status").textContent).toBe("Question 5 · no limit");
  rerender(<InterviewBudgetPill level="off" context={context} />);
  expect(screen.queryByRole("status")).toBeNull();
});

test.each(["text", "voice"] as const)(
  "reserves a blank row before the interview starts in %s",
  (inputMode) => {
    render(
      <InterviewBudgetPill
        level="standard"
        context={{
          conversationId: "new",
          inputMode,
          messages: [],
          status: "ready",
          stop: vi.fn(),
          submitText: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Standard · ~10 min")).toBeNull();
    expect(document.querySelector("[data-budget-placeholder]")).not.toBeNull();
  },
);
