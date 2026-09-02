/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@hashintel/petrinaut/ui", () => ({
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
}));

import { BrunchAskWidget } from "./brunch-ask-interactive-tool";
import { brunchAskFromComposerText } from "./brunch-ask-mapping";

afterEach(cleanup);

describe("Brunch ask widget", () => {
  test("renders a submitted-output prefix inside the answer box before the answer", () => {
    render(
      <BrunchAskWidget
        input={{ question: "What can customers do at the ATM?" }}
        state="submitted"
        submit={() => {}}
        submittedOutput={{ answer: "ATM withdrawal." }}
        submittedOutputPrefix={<span data-testid="answer-prefix">Voice</span>}
        toolCallId="brunch-ask-1"
      />,
    );

    const answerText = screen.getByText("ATM withdrawal.");
    const answerBox = answerText.closest("p")!;
    const prefix = within(answerBox).getByTestId("answer-prefix");
    expect(prefix.nextElementSibling).toBe(answerText);
  });
});

describe("Brunch ask composer mapping", () => {
  test("maps finalized composer text to the pending ask answer", () => {
    expect(
      brunchAskFromComposerText({
        input: { question: "Who triages the incident?" },
        text: "The support lead.",
      }),
    ).toEqual({ answer: "The support lead." });
  });
});
