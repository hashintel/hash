import { type RefObject, useLayoutEffect, useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { offerIn } from "../../../../conversation/offer-answers";
import {
  composeAnswers,
  type OfferedOption,
  type OfferedQuestion,
  optionsFor,
  pickedOption,
  pickOption,
} from "../../../../conversation/question-kinds";
import { isSpokenLine } from "./brunch-transcript";

import type { PetrinautAiMessage } from "../types";

const dockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minHeight: "[28px]",
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});

const stepsStyle = css({ display: "flex", gap: "1" });

const optionsStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });

const questionStyle = css({
  color: "neutral.s120",
  fontSize: "sm",
  lineHeight: "[1.45]",
});

const noteStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "[1.45]",
});

const descriptionsStyle = css({
  display: "grid",
  "& > *": { gridArea: "[1 / 1]", visibility: "hidden" },
  "& > [data-answer-description]": { visibility: "visible" },
});

/** What a question with nothing to click asks the person to type. */
const typedHint = (question: OfferedQuestion) =>
  question.kind === "values"
    ? `Type ${question.fields
        .map(({ label, unit }) =>
          unit === undefined ? label : `${label} (${unit})`,
        )
        .join(", ")} in the message box.`
    : "Type your answer in the message box.";

/**
 * The questions the latest reply asks, when it is the last
 * thing said: nothing has answered it and it wasn't stopped.
 */
export const currentOffer = (messages: readonly PetrinautAiMessage[]) => {
  // Host system notes can trail the turn they annotate.
  const message = messages.findLast(
    (each) => each.role !== "system" && !isSpokenLine(each),
  );
  if (message?.role !== "assistant" || message.metadata?.stopped === true)
    return undefined;
  const offer = offerIn(message.parts);
  return offer && { messageId: message.id, offer };
};

type DockState = {
  /** The reply whose questions these are; another reply starts afresh. */
  messageId: string | undefined;
  current: number;
  /** Each question's answer as last left; the showing one's is the composer's text. */
  answers: readonly string[];
  /** Sent, so the questions don't come back if the send fails. */
  sent: boolean;
};

const AnswerDock = ({
  questions,
  current,
  answer,
  onStep,
  onPick,
}: {
  questions: readonly OfferedQuestion[];
  current: number;
  /** The showing question's answer so far. */
  answer: string;
  onStep: (index: number) => void;
  onPick: (option: OfferedOption) => void;
}) => {
  const [described, setDescribed] = useState<OfferedOption>();
  const question = questions[current];
  if (!question) return null;
  const options = optionsFor(question);
  const picked = pickedOption(answer, options);
  const several = questions.length > 1;

  return (
    <section
      className={dockStyle}
      aria-label="Brunch's questions"
      data-question-count={questions.length}
    >
      <div className={headerStyle}>
        <span>
          {several ? `Question ${current + 1}/${questions.length} · ` : ""}
          {question.label}
        </span>
        {several && (
          <span className={stepsStyle}>
            <Button
              size="sm"
              variant="subtle"
              aria-label="Previous question"
              disabled={current === 0}
              onClick={() => onStep(current - 1)}
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="subtle"
              aria-label="Next question"
              disabled={current === questions.length - 1}
              onClick={() => onStep(current + 1)}
            >
              →
            </Button>
          </span>
        )}
      </div>
      <p className={questionStyle}>{question.text}</p>
      {options.length === 0 ? (
        <p className={noteStyle}>{typedHint(question)}</p>
      ) : (
        <>
          <div
            className={optionsStyle}
            role="group"
            aria-label={question.label}
          >
            {options.map((option) => (
              <Button
                key={option.label}
                size="sm"
                variant={option === picked ? "solid" : "subtle"}
                aria-pressed={option === picked}
                onClick={() => onPick(option)}
                onMouseEnter={() => setDescribed(option)}
                onMouseLeave={() => setDescribed(undefined)}
                onFocus={() => setDescribed(option)}
                onBlur={() => setDescribed(undefined)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {options.some(({ value }) => value !== undefined) && (
            // Every description is laid out in one cell, so the dock is as
            // tall as the longest and showing one moves nothing: a button
            // that shifted under the pointer would lose its click.
            <div className={descriptionsStyle}>
              {options.map(
                (option) =>
                  option.value !== undefined && (
                    <p
                      key={option.label}
                      className={noteStyle}
                      data-answer-description={
                        option === described || undefined
                      }
                    >
                      {option.value}
                    </p>
                  ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};

const noAnswers: DockState = {
  messageId: undefined,
  current: 0,
  answers: [],
  sent: false,
};

/**
 * Brunch's questions docked on the composer, one at a time. The composer
 * holds the showing question's answer: a click on an option writes it there,
 * and the person can type instead or as well. Submitting moves to the next
 * question, and on the last one sends every answer as one message.
 */
export const useAnswerDock = ({
  messages,
  enabled,
  input,
  inputRef,
  onInputChange,
  onSend,
}: {
  messages: readonly PetrinautAiMessage[];
  /** Whether questions can show at all: Chat, settled, composing. */
  enabled: boolean;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
}) => {
  const found = useMemo(
    () => (enabled ? currentOffer(messages) : undefined),
    [enabled, messages],
  );
  const [stored, setStored] = useState(noAnswers);
  const [focusRequest, setFocusRequest] = useState(0);
  useLayoutEffect(() => {
    if (focusRequest === 0) return;
    const textarea = inputRef.current;
    textarea?.focus({ preventScroll: true });
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [focusRequest, inputRef]);

  const state =
    stored.messageId === found?.messageId
      ? stored
      : { ...noAnswers, messageId: found?.messageId };
  if (found === undefined || state.sent) return undefined;

  const { questions } = found.offer;
  const { current } = state;
  const last = current === questions.length - 1;
  const answers = questions.map((_question, index) =>
    index === current ? input : (state.answers[index] ?? ""),
  );
  const message = composeAnswers(found.offer, answers);
  const write = (text: string) => {
    onInputChange(text);
    setFocusRequest((count) => count + 1);
  };
  const step = (index: number) => {
    setStored({ ...state, current: index, answers });
    write(answers[index] ?? "");
  };

  return {
    dock: (
      <AnswerDock
        questions={questions}
        current={current}
        answer={input}
        onStep={step}
        onPick={(option) => {
          const question = questions[current];
          if (question) write(pickOption(input, optionsFor(question), option));
        }}
      />
    ),
    /** What the composer's Send does while the questions show. */
    onSubmit: () => {
      if (!last) return step(current + 1);
      if (message === undefined) return;
      setStored({ ...state, answers, sent: true });
      onSend(message);
    },
    /**
     * Whether Send acts though the composer is empty: it moves on from any
     * question but the last, and sends once something is answered. Otherwise
     * an empty composer offers Voice, which hides the dock and would leave
     * the answers already given unsent.
     */
    sendable: !last || message !== undefined,
    submitLabel: last
      ? questions.length > 1
        ? "Send answers"
        : undefined
      : "Continue to next question",
  };
};
