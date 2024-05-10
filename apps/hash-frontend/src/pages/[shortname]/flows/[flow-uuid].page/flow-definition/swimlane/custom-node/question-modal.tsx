import { IconButton, TextField } from "@hashintel/design-system";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { XMarkRegularIcon } from "../../../../../../../shared/icons/x-mark-regular-icon";
import { Button } from "../../../../../../../shared/ui/button";
import { Modal } from "../../../../../../../shared/ui/modal";

type QuestionModalProps = {
  inputRequest: ExternalInputRequest;
  open: boolean;
  onClose: () => void;
};

const Question = ({
  answer,
  setAnswer,
  question,
}: {
  answer: string;
  setAnswer: (answer: string) => void;
  question: string;
}) => {
  const inputId = `question-${question}`;
  return (
    <Box mb={3}>
      <Typography
        component="label"
        htmlFor={inputId}
        variant="smallTextLabels"
        sx={{
          color: ({ palette }) => palette.gray[70],
          display: "block",
          fontWeight: 600,
          lineHeight: 1.5,
          mb: 0.5,
        }}
      >
        {question}
      </Typography>
      <TextField
        onChange={(event) => setAnswer(event.target.value)}
        id={inputId}
        placeholder="Your answer..."
        sx={{ width: "100%" }}
        value={answer}
      />
    </Box>
  );
};

export const QuestionModal = ({
  inputRequest,
  open,
  onClose,
}: QuestionModalProps) => {
  if (inputRequest.type !== "human-input") {
    throw new Error(
      `Expected human input request, got '${inputRequest.type}' instead`,
    );
  }

  console.log({ inputRequest });

  const [answers, setAnswers] = useState<string[]>(
    new Array(inputRequest.data.questions.length).fill(""),
  );

  const multipleQuestions = inputRequest.data.questions.length > 1;

  const allQuestionsAnswered = answers.every(
    (answer) => answer.trim().length > 0,
  );

  const submitAnswers = async () => {
    if (!allQuestionsAnswered) {
      return;
    }
    /** @todo implement response */
    close();
  };

  return (
    <Modal contentStyle={{ p: { xs: 0, md: 0 } }} open={open} onClose={onClose}>
      <>
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          sx={{
            borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
            py: 1,
            pl: 2.5,
            pr: 1.5,
          }}
        >
          <Typography
            sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[80] }}
          >
            Your worker has asked you{" "}
            {multipleQuestions ? "questions" : "a question"}
          </Typography>
          <IconButton
            aria-label="Cancel"
            onClick={onClose}
            sx={{ "& svg": { fontSize: 20 } }}
          >
            <XMarkRegularIcon />
          </IconButton>
        </Stack>
        <Box sx={{ px: 4.5, py: 2.5 }}>
          <Typography
            component="p"
            variant="smallTextLabels"
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.5,
              mb: 2.5,
            }}
          >
            Please respond to help me with my research – thank you!
          </Typography>
          {inputRequest.data.questions.map((question, index) => (
            <Question
              answer={answers[index] ?? ""}
              setAnswer={(updatedAnswer) => {
                setAnswers((prevAnswers) => {
                  const newAnswers = [...prevAnswers];
                  newAnswers[index] = updatedAnswer;
                  return newAnswers;
                });
              }}
              question={question}
              key={question}
            />
          ))}

          <Button
            disabled={!allQuestionsAnswered}
            size="small"
            onClick={submitAnswers}
            sx={{ mt: 1 }}
          >
            Submit {multipleQuestions ? "answers" : "answer"}
          </Button>
        </Box>
      </>
    </Modal>
  );
};
