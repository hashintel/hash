import { useMemo } from "react";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Typography } from "@mui/material";

import { Modal } from "../../../../../../shared/ui/modal";

const ResolvedQuestion = ({
  answer,
  question,
}: {
  answer: string;
  question: string;
}) => {
  return (
    <Box mb={3}>
      <Typography
        component={"label"}
        variant={"smallTextLabels"}
        sx={{
          color: ({ palette }) => palette.gray[80],
          display: "block",
          fontWeight: 600,
          lineHeight: 1.4,
          mb: 1,
        }}
      >
        {question}
      </Typography>
      <Typography
        component={"label"}
        variant={"smallTextParagraphs"}
        sx={{
          color: ({ palette }) => palette.gray[70],
          display: "block",
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        {answer}
      </Typography>
    </Box>
  );
};

export type ResolvedQuestionRequest = ExternalInputRequest<"human-input"> &
  Required<Pick<ExternalInputRequest, "answers" | "resolvedAt">>;

interface ResolvedQuestionsModalProps {
  resolvedQuestionRequests: ResolvedQuestionRequest[];
  open: boolean;
  onClose: () => void;
}

export const ResolvedQuestionsModal = ({
  resolvedQuestionRequests,
  open,
  onClose,
}: ResolvedQuestionsModalProps) => {
  const multipleQuestions = resolvedQuestionRequests.length > 0;

  const resolvedQuestions = useMemo(() => {
    const questions: {
      question: string;
      answer: string;
      resolvedAt: string;
    }[] = [];

    for (const request of resolvedQuestionRequests) {
      for (const [index, question] of request.data.questions.entries()) {
        const answer = request.answers[index];

        if (answer === undefined) {
          throw new Error(
            `No answer found at index ${index} for question ${question}. All answers: ${request.answers}`,
          );
        }

        questions.push({
          question,
          answer,
          resolvedAt: request.resolvedAt,
        });
      }
    }

    return questions;
  }, [resolvedQuestionRequests]);

  return (
    <Modal
      contentStyle={{ p: { xs: 0, md: 0 }, outlineStyle: "none" }}
      open={open}
      header={{
        title: `You previously answered 
            ${multipleQuestions ? "these questions" : "this question"}`,
      }}
      onClose={onClose}
    >
      <Box px={2.5} py={2}>
        {resolvedQuestions.map((resolvedQuestion, index) => (
          // eslint-disable-next-line react/no-array-index-key -- no better alternative, questions may include duplicates
          <ResolvedQuestion key={index} {...resolvedQuestion} />
        ))}
      </Box>
    </Modal>
  );
};
