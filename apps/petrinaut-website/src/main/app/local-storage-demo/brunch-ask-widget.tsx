import { type FormEvent, useId, useState } from "react";

import {
  type BrunchAskInput,
  type BrunchAskOutput,
} from "@hashintel/brunch-agent/client-tools";
import { css } from "@hashintel/ds-helpers/css";

import type { PetrinautAiInteractiveToolWidgetProps } from "@hashintel/petrinaut/ui";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "blue.a30",
  borderRadius: "lg",
  backgroundColor: "blue.a10",
});

const questionStyle = css({
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "relaxed",
});

const formStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const labelStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});

const textareaStyle = css({
  width: "full",
  minHeight: "20",
  padding: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s100",
  fontSize: "sm",
  resize: "vertical",
  _focusVisible: {
    borderColor: "blue.a70",
    outline: "2px solid",
    outlineColor: "blue.a30",
    outlineOffset: "[1px]",
  },
});

const submitButtonStyle = css({
  alignSelf: "flex-end",
  paddingX: "3",
  paddingY: "2",
  borderRadius: "md",
  backgroundColor: "blue.a85",
  color: "white",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  _hover: {
    backgroundColor: "blue.a100",
  },
  _disabled: {
    cursor: "not-allowed",
    opacity: 0.45,
  },
});

const answerTurnStyle = css({
  display: "flex",
  justifyContent: "flex-end",
});

const answerStyle = css({
  maxWidth: "[92%]",
  minWidth: "0",
  paddingX: "2",
  paddingY: "[6px]",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  borderBottomRightRadius: "sm",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "medium",
  textAlign: "right",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export const BrunchAskWidget = ({
  input,
  state,
  submit,
  submittedOutput,
  submittedOutputProvenance,
}: PetrinautAiInteractiveToolWidgetProps<BrunchAskInput, BrunchAskOutput>) => {
  const answerId = useId();
  const [answer, setAnswer] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      return;
    }
    submit({ answer: trimmedAnswer });
  };

  return (
    <section className={containerStyle}>
      <p className={questionStyle}>{input.question}</p>
      {state === "submitted" ? (
        <div className={answerTurnStyle}>
          <p className={answerStyle} data-role="user-answer">
            {submittedOutputProvenance}
            <span>{submittedOutput.answer}</span>
          </p>
        </div>
      ) : (
        <form className={formStyle} onSubmit={onSubmit}>
          <label className={labelStyle} htmlFor={answerId}>
            Your answer
          </label>
          <textarea
            className={textareaStyle}
            id={answerId}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Write what you know; uncertainty is useful too."
            rows={3}
            value={answer}
          />
          <button
            className={submitButtonStyle}
            disabled={answer.trim().length === 0}
            type="submit"
          >
            Send answer
          </button>
        </form>
      )}
    </section>
  );
};
