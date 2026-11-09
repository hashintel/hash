/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AnswerOfferCard } from "./answer-offer-card";

import type {
  OfferedQuestion,
  OfferedQuestions,
} from "../../../../conversation/question-kinds/kinds";

afterEach(cleanup);

const quarantine: OfferedQuestion = {
  kind: "choose",
  label: "Quarantined shipment",
  options: ["Stays counted as open", "Drops out until released"],
};
const demand: OfferedQuestion = { kind: "confirm", label: "Production demand" };

const renderCard = (offer: OfferedQuestions) => {
  const onSend = vi.fn<(text: string) => void>();
  const rendered = render(<AnswerOfferCard offer={offer} onSend={onSend} />);
  return { ...rendered, onSend };
};

const ownWords = (label: string, text: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  const field = screen.getByRole("textbox", { name: "Your answer" });
  expect(document.activeElement).toBe(field);
  const send = screen.getByRole("button", { name: "Send answer" });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(send);
};

describe("one choose question", () => {
  test("offers each option and a free-text path as real, focusable buttons", () => {
    renderCard({ questions: [quarantine] });
    const group = screen.getByRole("group", { name: "Quarantined shipment" });
    const buttons = [
      "Stays counted as open",
      "Drops out until released",
      "Something else…",
    ].map((name) => screen.getByRole("button", { name }));
    for (const button of buttons) {
      expect(group.contains(button)).toBe(true);
      expect(button.tagName).toBe("BUTTON");
      expect(button.tabIndex).toBe(0);
    }
  });

  test("a click sends the option's label", () => {
    const { onSend } = renderCard({ questions: [quarantine] });
    fireEvent.click(
      screen.getByRole("button", { name: "Drops out until released" }),
    );
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Drops out until released");
  });

  test("Something else opens a labelled field in place and sends its text", () => {
    const { onSend } = renderCard({ questions: [quarantine] });
    ownWords("Something else…", "It depends on the supplier.");
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "It depends on the supplier.",
    );
  });
});

describe("one confirm question", () => {
  test("Yes sends Yes", () => {
    const { onSend } = renderCard({ questions: [demand] });
    expect(
      screen.getByRole("group", { name: "Production demand" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Yes");
  });

  test("Not quite sends the correction after Not quite", () => {
    const { onSend } = renderCard({ questions: [demand] });
    ownWords("Not quite…", "Excluding Site 2000.");
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "Not quite — Excluding Site 2000.",
    );
  });
});

test.each([
  ["several questions", { questions: [quarantine, demand] }],
  [
    "a values question",
    {
      questions: [
        {
          kind: "values",
          label: "Reorder points",
          fields: [{ label: "Lower", unit: "units" }],
        },
      ],
    },
  ],
  [
    "an open question beside a closed one",
    { questions: [{ kind: "open", label: "Recent order" }, quarantine] },
  ],
] satisfies [string, OfferedQuestions][])(
  "renders nothing yet for %s",
  (_name, offer) => {
    const { container } = renderCard(offer);
    expect(container.innerHTML).toBe("");
  },
);
