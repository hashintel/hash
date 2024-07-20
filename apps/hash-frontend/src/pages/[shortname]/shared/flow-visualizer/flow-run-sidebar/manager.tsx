import { useMemo, useState } from "react";
import { CircleCheckRegularIcon } from "@hashintel/design-system";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";
import type { Stack, SxProps, Theme , Typography } from "@mui/material";

import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { QuestionModal } from "../shared/question-modal";

import type { ResolvedQuestionRequest , ResolvedQuestionsModal } from "./manager/resolved-questions-modal";

const iconSx: SxProps<Theme> = {
  mr: 1.5,
  fontSize: 18,
};

const SuccessIcon = ({ closed }: { closed?: boolean }) => (
  <CircleCheckRegularIcon
    sx={{
      ...iconSx,
      color: ({ palette }) => (closed ? palette.gray[50] : palette.green[80]),
    }}
  />
);

export const Manager = () => {
  const { selectedFlowRun } = useFlowRunsContext();

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showResolvedQuestionsModal, setShowResolvedQuestionsModal] =
    useState(false);

  const {
    outstandingQuestionsRequest,
    resolvedQuestionsRequests,
    resolvedQuestionsCount,
  } = useMemo(() => {
    let outstandingRequest: ExternalInputRequest | undefined;
    const resolvedRequests: ResolvedQuestionRequest[] = [];

    let answersProvidedCount = 0;

    for (const inputRequest of selectedFlowRun?.inputRequests ?? []) {
      if (inputRequest.type === "human-input") {
        if (!inputRequest.resolvedAt && !outstandingRequest) {
          outstandingRequest = inputRequest;
        } else if (inputRequest.resolvedAt && inputRequest.answers) {
          resolvedRequests.push({
            ...inputRequest,
            resolvedAt: inputRequest.resolvedAt,
            answers: inputRequest.answers,
          });
          answersProvidedCount = answersProvidedCount + inputRequest.data.questions.length;
        }
      }
    }

    return {
      outstandingQuestionsRequest: outstandingRequest,
      resolvedQuestionsRequests: resolvedRequests,
      resolvedQuestionsCount: answersProvidedCount,
    };
  }, [selectedFlowRun]);

  const flowIsClosed = Boolean(selectedFlowRun?.closedAt);

  return (
    <>
      {showQuestionModal && Boolean(outstandingQuestionsRequest) && !flowIsClosed && (
        <QuestionModal
          open
          inputRequest={outstandingQuestionsRequest}
          onClose={() => { setShowQuestionModal(false); }}
        />
      )}
      {showResolvedQuestionsModal && resolvedQuestionsRequests.length > 0 && (
        <ResolvedQuestionsModal
          open
          resolvedQuestionRequests={resolvedQuestionsRequests}
          onClose={() => { setShowResolvedQuestionsModal(false); }}
        />
      )}
      <Stack direction={"row"} alignItems={"center"}>
        <SuccessIcon closed={flowIsClosed} />
        <Typography variant={"smallTextParagraphs"}>
          {flowIsClosed ? "Flow is closed" : "Actively managing this flow"}
        </Typography>
      </Stack>
      {selectedFlowRun?.closedAt ? null : outstandingQuestionsRequest ? (
        <Stack
          direction={"row"}
          alignItems={"center"}
          role={"button"}
          sx={{
            cursor: "pointer",
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            pt: 2,
            mt: 2,
          }}
          onClick={() => { setShowQuestionModal(true); }}
        >
          <CircleInfoIcon
            sx={{ fill: ({ palette }) => palette.yellow[80], ...iconSx }}
          />
          <Typography
            variant={"smallTextParagraphs"}
            sx={{ color: ({ palette }) => palette.yellow[80] }}
          >
            Your input is requested
          </Typography>
        </Stack>
      ) : (
        <Stack
          direction={"row"}
          alignItems={"center"}
          sx={{
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            pt: 2,
            mt: 2,
          }}
        >
          <SuccessIcon />
          <Typography variant={"smallTextParagraphs"}>
            No outstanding input requests
          </Typography>
        </Stack>
      )}
      {resolvedQuestionsCount > 0 && (
        <Stack
          direction={"row"}
          alignItems={"center"}
          role={"button"}
          sx={{
            cursor: "pointer",
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            pt: 2,
            mt: 2,
          }}
          onClick={() => { setShowResolvedQuestionsModal(true); }}
        >
          <CircleInfoIcon
            sx={{ fill: ({ palette }) => palette.blue[60], ...iconSx }}
          />
          <Typography variant={"smallTextParagraphs"}>
            {resolvedQuestionsCount} resolved questions
          </Typography>
        </Stack>
      )}
    </>
  );
};
