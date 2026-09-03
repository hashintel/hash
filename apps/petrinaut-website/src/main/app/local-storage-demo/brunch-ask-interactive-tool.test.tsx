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
  test("renders voice provenance inside the submitted answer bubble", () => {
    render(
      <BrunchAskWidget
        input={{ question: "What can customers do at the ATM?" }}
        state="submitted"
        submit={() => {}}
        submittedOutput={{ answer: "ATM withdrawal." }}
        submittedOutputProvenance={<span data-testid="answer-provenance" />}
        toolCallId="brunch-ask-1"
      />,
    );

    const answerText = screen.getByText("ATM withdrawal.");
    const answerBubble = answerText.closest(
      '[data-role="user-answer"]',
    ) as HTMLElement;
    const provenance = within(answerBubble).getByTestId("answer-provenance");

    expect(provenance.nextElementSibling).toBe(answerText);
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
