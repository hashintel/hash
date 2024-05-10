import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import { formatDistance } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type { NodeProps } from "reactflow";

import { ArrowRightIcon } from "../../../../../../shared/icons/arrow-right";
import { Button } from "../../../../../../shared/ui/button";
import {
  statusToSimpleStatus,
  useFlowRunsContext,
  useStatusForCurrentStep,
} from "../../../../../shared/flow-runs-context";
import type { NodeData } from "../shared/types";
import { Handles } from "./custom-node/handles";
import { NodeContainer } from "./custom-node/node-container";
import { statusSx } from "./custom-node/node-styles";
import { QuestionModal } from "./custom-node/question-modal";

const getTimeAgo = (isoString: string) =>
  formatDistance(new Date(isoString), new Date(), {
    addSuffix: true,
  });

export const CustomNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const [showQuestionModal, setShowQuestionModal] = useState(false);

  const statusData = useStatusForCurrentStep();

  const { selectedFlowRun } = useFlowRunsContext();

  const outstandingInputRequest = useMemo(() => {
    /**
     * We'll take the first human input request that is not resolved,
     * and if none are found return the first unresolved browser plugin request.
     *
     * There should only ever be a single human input request active,
     * as they are asked by the top-level co-ordinating agent.
     *
     * There may be multiple browser web page requests, but the node's appearance
     * should remain unchanged as they are resolved.
     *
     * We could alternatively show a count of outstanding requests.
     */
    let browserInputRequest: ExternalInputRequest | undefined;
    for (const request of selectedFlowRun?.inputRequests ?? []) {
      if (request.resolved || request.stepId !== id) {
        continue;
      }
      if (request.type === "human-input") {
        return request;
      }
      browserInputRequest ??= request;
    }
    return browserInputRequest;
  }, [id, selectedFlowRun]);

  const { closedAt, scheduledAt } = statusData ?? {};

  const stepStatusName = statusToSimpleStatus(statusData?.status ?? null);

  const isoString = closedAt ?? scheduledAt;

  const [timeAgo, setTimeAgo] = useState(
    isoString ? getTimeAgo(isoString) : "",
  );

  const isParallelizedGroup = data.kind === "parallel-group";

  const isParallelizedStep = data.inputSources.find(
    (input) => input.kind === "parallel-group-input",
  );

  const styles = statusSx[stepStatusName];

  useEffect(() => {
    let timeUpdateInterval: NodeJS.Timeout | undefined;

    if (isoString) {
      setTimeAgo(getTimeAgo(isoString));

      timeUpdateInterval = setInterval(() => {
        setTimeAgo(getTimeAgo(isoString));
      }, 5_000);
    } else {
      setTimeAgo("");
    }

    return () => {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  }, [isoString]);

  const commonStatusBarSx: SxProps<Theme> = {
    background: styles.lightestBackground,
    borderRadius: 2.5,
    p: 2,
    transition: ({ transitions }) => transitions.create("background"),
  };

  const statusBarTextSx: SxProps<Theme> = {
    color: styles.text,
    fontSize: 12,
    fontWeight: 500,
    textAlign: "center",
  };

  return (
    <>
      {showQuestionModal && !!outstandingInputRequest && (
        <QuestionModal
          inputRequest={outstandingInputRequest}
          open
          onClose={() => setShowQuestionModal(false)}
        />
      )}
      <NodeContainer
        kind={data.kind}
        selected={selected}
        stepStatusName={stepStatusName}
      >
        <Stack justifyContent="space-between" sx={{ height: "100%" }}>
          <Typography sx={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}>
            {data.label}
            {isParallelizedStep ? "[]" : ""}
          </Typography>
          <Stack direction="row" mb={2} mt={1}>
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
              {timeAgo}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                ml: 0.5,
                color: ({ palette }) => palette.gray[60],
              }}
            >
              {timeAgo ? `(${isoString})` : ""}
            </Typography>
          </Stack>

          {!isParallelizedGroup &&
          // selectedFlowRun &&
          // stepStatusName === "Information Required" &&
          outstandingInputRequest &&
          outstandingInputRequest.type === "human-input" ? (
            <Button
              component="button"
              onClick={() => setShowQuestionModal(true)}
              sx={{
                ...commonStatusBarSx,
                ...statusBarTextSx,
                cursor: "pointer",
                "&:hover": {
                  background: styles.lightBackground,
                },
                "&::before": { background: "none" },
              }}
            >
              Your worker wants your advice
              <ArrowRightIcon sx={{ ...statusBarTextSx, ml: 0.8 }} />
            </Button>
          ) : (
            <Box sx={commonStatusBarSx}>
              <Typography sx={statusBarTextSx}>
                {stepStatusName === "Complete"
                  ? "Successfully completed"
                  : stepStatusName === "In Progress"
                    ? "Currently processing step..."
                    : stepStatusName === "Error"
                      ? "Step failed to complete"
                      : stepStatusName === "Cancelled"
                        ? "Cancelled"
                        : stepStatusName === "Information Required"
                          ? "Waiting for information from browser plugin"
                          : "Waiting for earlier stages to finish"}
              </Typography>
            </Box>
          )}

          <Handles
            kind={data.kind}
            inputSources={data.inputSources}
            actionDefinition={data.actionDefinition}
            stepId={id}
            stepStatusName={stepStatusName}
          />
        </Stack>
      </NodeContainer>
    </>
  );
};
