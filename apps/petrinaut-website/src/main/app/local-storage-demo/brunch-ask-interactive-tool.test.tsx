/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@hashintel/petrinaut/ui", () => ({
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
}));

import * as brunchAskInteractiveToolModule from "./brunch-ask-interactive-tool";
import { brunchAskFromComposerText } from "./brunch-ask-mapping";
import { BrunchAskWidget } from "./brunch-ask-widget";

afterEach(cleanup);

describe("Brunch ask Fast Refresh boundary", () => {
  test("keeps the interactive-tool module free of component exports", () => {
    expect(Object.keys(brunchAskInteractiveToolModule)).toEqual([
      "brunchAskInteractiveTool",
    ]);
  });
});

describe("Brunch ask widget", () => {
  test("renders a submitted answer as a user turn with provenance below it", () => {
    render(
      <BrunchAskWidget
        input={{ question: "What can customers do at the ATM?" }}
        state="submitted"
        submit={() => {}}
        submittedOutput={{ answer: "ATM withdrawal." }}
        submittedOutputProvenance={
          <span data-testid="answer-provenance">Submitted by voice</span>
        }
        toolCallId="brunch-ask-1"
      />,
    );

    const answerText = screen.getByText("ATM withdrawal.");
    const answerBubble = answerText.closest('[data-role="user-answer"]')!;
    const answerTurn = answerBubble.parentElement!;
    const provenance = within(answerTurn).getByTestId("answer-provenance");

    expect(answerBubble.nextElementSibling).toBe(provenance);
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
