import { CircleCheckRegularIcon } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { QuestionModal } from "../shared/question-modal";

const iconSx: SxProps<Theme> = {
  mr: 1.5,
  fontSize: 18,
};

const SuccessIcon = () => (
  <CircleCheckRegularIcon
    sx={{
      ...iconSx,
      color: ({ palette }) => palette.green[80],
    }}
  />
);

export const Manager = () => {
  const { selectedFlowRun } = useFlowRunsContext();

  const [showQuestionModal, setShowQuestionModal] = useState(false);

  const outstandingInputRequest = useMemo(() => {
    return selectedFlowRun?.inputRequests.find(
      (request) => request.type === "human-input" && !request.resolvedAt,
    );
  }, [selectedFlowRun]);

  return (
    <>
      {showQuestionModal && !!outstandingInputRequest && (
        <QuestionModal
          inputRequest={outstandingInputRequest}
          open
          onClose={() => setShowQuestionModal(false)}
        />
      )}
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          pb: 2,
          mb: 2,
        }}
      >
        <SuccessIcon />
        <Typography variant="smallTextParagraphs">
          Actively managing this flow
        </Typography>
      </Stack>
      {outstandingInputRequest ? (
        <Stack
          direction="row"
          alignItems="center"
          role="button"
          onClick={() => setShowQuestionModal(true)}
          sx={{ cursor: "pointer" }}
        >
          <CircleInfoIcon
            sx={{ fill: ({ palette }) => palette.yellow[80], ...iconSx }}
          />
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.yellow[80] }}
          >
            Your input is requested
          </Typography>
        </Stack>
      ) : (
        <Stack direction="row" alignItems="center">
          <SuccessIcon />
          <Typography variant="smallTextParagraphs">
            No outstanding input requests
          </Typography>
        </Stack>
      )}
    </>
  );
};
