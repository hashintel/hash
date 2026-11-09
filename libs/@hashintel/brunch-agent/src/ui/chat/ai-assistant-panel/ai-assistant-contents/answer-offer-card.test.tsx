/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AnswerOfferCard } from "./answer-offer-card";

import type {
  OfferedQuestion,
  OfferedQuestions,
} from "../../../../conversation/question-kinds";

afterEach(cleanup);

const quarantine: OfferedQuestion = {
  kind: "choose",
  label: "Quarantined shipment",
  options: ["Stays counted as open", "Drops out until released"],
};
const demand: OfferedQuestion = { kind: "confirm", label: "Production demand" };
/** Case 7 of the P0 set: two values in one question. */
const reorderPoints: OfferedQuestion = {
  kind: "values",
  label: "Reorder points",
  fields: [
    { label: "Lower", unit: "units" },
    { label: "Higher", unit: "units" },
  ],
};
/** Case 10 of the P0 set: two related closed questions. */
const batch: OfferedQuestions = {
  questions: [
    {
      kind: "choose",
      label: "Batch start",
      options: ["Starts when both are available", "Must be rescheduled"],
    },
    { kind: "confirm", label: "Delay clock" },
  ],
};
const appetite: OfferedQuestion = {
  kind: "choose",
  label: "Time to spend",
  options: ["Quick", "Standard", "Thorough", "Deep"],
};
/** Case 9 of the P0 set, as ruled: a card only for the appetite question. */
const opening: OfferedQuestions = {
  questions: [
    { kind: "open", label: "Summer peak case" },
    { kind: "open", label: "Model boundary" },
    { kind: "open", label: "What else judges it" },
    appetite,
  ],
};

type DraftFill = (draft: string) => string;

const renderCard = (offer: OfferedQuestions) => {
  const onSend = vi.fn<(text: string) => void>();
  const onDraft = vi.fn<(fill: DraftFill) => void>();
  const rendered = render(
    <AnswerOfferCard offer={offer} onSend={onSend} onDraft={onDraft} />,
  );
  const drafted = (draft: string, call = -1) =>
    onDraft.mock.calls.at(call)?.[0](draft);
  return { ...rendered, onSend, onDraft, drafted };
};

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

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

describe("one values question", () => {
  const field = (name: string) => screen.getByRole("textbox", { name });

  test("labels each field and shows its unit", () => {
    renderCard({ questions: [reorderPoints] });
    const group = screen.getByRole("group", { name: "Reorder points" });
    expect(group.contains(field("Lower"))).toBe(true);
    expect(group.contains(field("Higher"))).toBe(true);
    expect(within(group).getAllByText("units")).toHaveLength(2);
  });

  test("sends the values supplied, skipping blank fields", () => {
    const { onSend } = renderCard({ questions: [reorderPoints] });
    const send = screen.getByRole("button", { name: "Send answer" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field("Higher"), { target: { value: "1800" } });
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Higher: 1800 units");
  });

  test("sends both values on one line", () => {
    const { onSend } = renderCard({ questions: [reorderPoints] });
    fireEvent.change(field("Lower"), { target: { value: "1200" } });
    fireEvent.change(field("Higher"), { target: { value: "1800" } });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "Lower: 1200 units; Higher: 1800 units",
    );
  });

  test("I don't know sends at once", () => {
    const { onSend } = renderCard({ questions: [reorderPoints] });
    fireEvent.click(screen.getByRole("button", { name: "I don't know" }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith("I don't know.");
  });
});

describe("several closed questions", () => {
  const sendAnswers = () =>
    screen.getByRole("button", { name: "Send answers" }) as HTMLButtonElement;

  test("gives each question a labelled row and one Send, disabled at the start", () => {
    const { onSend } = renderCard(batch);
    const start = screen.getByRole("group", { name: "Batch start" });
    const clock = screen.getByRole("group", { name: "Delay clock" });
    expect(
      within(start).getByRole("button", { name: "Something else…" }),
    ).toBeTruthy();
    expect(
      within(clock).getByRole("button", { name: "Not quite…" }),
    ).toBeTruthy();
    expect(sendAnswers().disabled).toBe(true);
    fireEvent.click(sendAnswers());
    expect(onSend).not.toHaveBeenCalled();
  });

  test("an option selects rather than sends, and another option moves the selection", () => {
    const { onSend } = renderCard(batch);
    expect(pressed("Starts when both are available")).toBe("false");
    fireEvent.click(
      screen.getByRole("button", { name: "Starts when both are available" }),
    );
    expect(pressed("Starts when both are available")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Must be rescheduled" }),
    );
    expect(pressed("Starts when both are available")).toBe("false");
    expect(pressed("Must be rescheduled")).toBe("true");
    expect(onSend).not.toHaveBeenCalled();
  });

  test("sends an answer to both questions, one line each", () => {
    const { onSend } = renderCard(batch);
    fireEvent.click(
      screen.getByRole("button", { name: "Must be rescheduled" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(sendAnswers());
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "1. Batch start: Must be rescheduled\n2. Delay clock: Yes",
    );
  });

  test("names the question left unanswered", () => {
    const { onSend } = renderCard(batch);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(sendAnswers().disabled).toBe(false);
    fireEvent.click(sendAnswers());
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "2. Delay clock: Yes\n\nNot answered yet: Batch start.",
    );
  });

  test("Not quite opens a field named by its question, and its text is sent with the rest", () => {
    const { onSend } = renderCard(batch);
    fireEvent.click(
      screen.getByRole("button", { name: "Starts when both are available" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Not quite…" }));
    const field = screen.getByRole("textbox", { name: "Delay clock" });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, {
      target: { value: "From the rescheduled start." },
    });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(sendAnswers());
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "1. Batch start: Starts when both are available\n2. Delay clock: Not quite — From the rescheduled start.",
    );
  });

  test("Something else, left blank, is not an answer", () => {
    renderCard(batch);
    fireEvent.click(screen.getByRole("button", { name: "Something else…" }));
    expect(screen.getByRole("textbox", { name: "Batch start" })).toBeTruthy();
    expect(sendAnswers().disabled).toBe(true);
  });

  test("a values row: I don't know answers it, and values replace that answer", () => {
    const { onSend } = renderCard({ questions: [quarantine, reorderPoints] });
    fireEvent.click(
      screen.getByRole("button", { name: "Drops out until released" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "I don't know" }));
    expect(pressed("I don't know")).toBe("true");
    fireEvent.click(sendAnswers());
    expect(onSend).toHaveBeenLastCalledWith(
      "1. Quarantined shipment: Drops out until released\n2. Reorder points: I don't know.",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Higher" }), {
      target: { value: "1800" },
    });
    expect(pressed("I don't know")).toBe("false");
    fireEvent.click(sendAnswers());
    expect(onSend).toHaveBeenLastCalledWith(
      "1. Quarantined shipment: Drops out until released\n2. Reorder points: Higher: 1800 units",
    );
  });
});

describe("a turn with open questions drafts into the composer", () => {
  const typed =
    "1. Summer peak case: last July's incident\n2. Model boundary: chillers and BMS\n3. What else judges it:\n4. Time to spend:";

  test("offers nothing for the open questions", () => {
    renderCard(opening);
    expect(
      screen.queryByRole("group", { name: "Summer peak case" }),
    ).toBeNull();
    expect(screen.queryByRole("group", { name: "Model boundary" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "What else judges it" }),
    ).toBeNull();
    expect(screen.getByRole("group", { name: "Time to spend" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send answers" })).toBeNull();
  });

  test("an option drafts a line for every question, keeping what was typed", () => {
    const { onSend, onDraft, drafted } = renderCard(opening);
    fireEvent.click(screen.getByRole("button", { name: "Quick" }));
    expect(onDraft).toHaveBeenCalledOnce();
    expect(drafted("")).toBe(
      "1. Summer peak case:\n2. Model boundary:\n3. What else judges it:\n4. Time to spend: Quick",
    );
    expect(drafted(typed)).toBe(
      "1. Summer peak case: last July's incident\n2. Model boundary: chillers and BMS\n3. What else judges it:\n4. Time to spend: Quick",
    );
    expect(onSend).not.toHaveBeenCalled();
  });

  test("the card stays, and choosing again redrafts the same line", () => {
    const { onDraft, drafted } = renderCard(opening);
    fireEvent.click(screen.getByRole("button", { name: "Quick" }));
    const first = drafted(typed) ?? "";
    fireEvent.click(screen.getByRole("button", { name: "Deep" }));
    expect(onDraft).toHaveBeenCalledTimes(2);
    expect(pressed("Deep")).toBe("true");
    expect(pressed("Quick")).toBe("false");
    expect(drafted(first)).toBe(
      "1. Summer peak case: last July's incident\n2. Model boundary: chillers and BMS\n3. What else judges it:\n4. Time to spend: Deep",
    );
  });

  test("Something else adds the person's words to the message", () => {
    const { onSend, onDraft, drafted } = renderCard(opening);
    fireEvent.click(screen.getByRole("button", { name: "Something else…" }));
    const field = screen.getByRole("textbox", { name: "Time to spend" });
    fireEvent.change(field, { target: { value: "An hour at most" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to message" }));
    expect(onDraft).toHaveBeenCalledOnce();
    expect(drafted("Mostly the August heatwave.")).toBe(
      "Mostly the August heatwave.\n4. Time to spend: An hour at most",
    );
    expect(onSend).not.toHaveBeenCalled();
  });

  test("a click writes only its own question's line", () => {
    const { drafted } = renderCard({
      questions: [
        { kind: "open", label: "Summer peak case" },
        appetite,
        demand,
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Quick" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(
      drafted("1. Summer peak case:\n2. Time to spend: Quick, or Standard"),
    ).toBe(
      "1. Summer peak case:\n2. Time to spend: Quick, or Standard\n3. Production demand: Yes",
    );
  });

  test("values and I don't know are added to the message", () => {
    const { onSend, onDraft, drafted } = renderCard({
      questions: [{ kind: "open", label: "Recent order" }, reorderPoints],
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Lower" }), {
      target: { value: "1200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to message" }));
    expect(drafted("")).toBe(
      "1. Recent order:\n2. Reorder points: Lower: 1200 units",
    );
    fireEvent.click(screen.getByRole("button", { name: "I don't know" }));
    expect(onDraft).toHaveBeenCalledTimes(2);
    expect(
      drafted(
        "1. Recent order: the March one\n2. Reorder points: Lower: 1200 units",
      ),
    ).toBe("1. Recent order: the March one\n2. Reorder points: I don't know.");
    expect(onSend).not.toHaveBeenCalled();
  });
});

test("renders nothing when every question is open", () => {
  const { container } = renderCard({
    questions: [{ kind: "open", label: "Recent order" }],
  });
  expect(container.innerHTML).toBe("");
});
