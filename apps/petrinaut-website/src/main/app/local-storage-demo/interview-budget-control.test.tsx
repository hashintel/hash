// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { type InterviewBudgetLevel } from "../../../shared/interview-budget";
import {
  InterviewBudgetControl,
  InterviewBudgetPill,
} from "./interview-budget-control";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

afterEach(cleanup);

const Harness = () => {
  const [level, setLevel] = useState<InterviewBudgetLevel>("standard");
  return <InterviewBudgetControl level={level} onChange={setLevel} />;
};

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
  fireEvent.mouseEnter(screen.getByRole("button", { name: "Deep" }));
  expect(
    screen.getByText("Explore edge cases; pause between topics."),
  ).toBeTruthy();
  fireEvent.change(slider, { target: { value: "1" } });
  expect(slider.getAttribute("aria-valuetext")).toBe("Quick · ~5 min");
  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(
    screen.getByRole("button", { name: "Interview budget: Off · No budget" }),
  ).toBeTruthy();
});

test("pill counts canonical replies, changes with mode and disappears for Off", () => {
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
