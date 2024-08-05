import { CaretDownSolidIcon } from "@hashintel/design-system";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { useStatusForSteps } from "../../../../shared/flow-runs-context";
import { formatTimeTaken } from "../shared/format-time-taken";
import type {
  GroupWithEdgesAndNodes,
  UngroupedEdgesAndNodes,
} from "../shared/types";
import {
  ErrorIcon,
  GroupStepStatus,
  InProgressIcon,
  SuccessIcon,
  WaitingIcon,
} from "./group-status/group-step-status";

export const GroupStatus = ({
  groupData,
}: {
  groupData: UngroupedEdgesAndNodes | GroupWithEdgesAndNodes;
}) => {
  const groupStepsWithIds = useMemo(
    () => groupData.nodes.map((node) => ({ ...node, stepId: node.id })),
    [groupData],
  );

  const {
    closedAt,
    scheduledAt,
    overallStatus: groupStatus,
  } = useStatusForSteps(groupStepsWithIds) ?? {};

  const [showSteps, setShowSteps] = useState(groupStatus === "In Progress");

  const [timeTaken, setTimeTaken] = useState("");

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (scheduledAt) {
      setTimeTaken(formatTimeTaken(scheduledAt, closedAt));

      interval = setInterval(() => {
        setTimeTaken(formatTimeTaken(scheduledAt, closedAt));
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [scheduledAt, closedAt]);

  useEffect(() => {
    if (groupStatus === "In Progress") {
      setShowSteps(true);
    } else {
      setShowSteps(false);
    }
  }, [groupStatus]);

  return (
    <Box sx={{ "&:not(:first-of-type)": { mt: 1.5 } }}>
      <Stack
        alignItems="flex-start"
        direction="row"
        justifyContent="space-between"
        gap={1}
        sx={{ cursor: "pointer" }}
        onClick={() => setShowSteps(!showSteps)}
      >
        <Stack direction="row">
          <Box
            sx={{
              width: 18,
              minWidth: 18,
              mt: 0.1,
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            {!groupStatus || groupStatus === "Waiting" ? (
              <WaitingIcon statusFor="group" />
            ) : groupStatus === "In Progress" ? (
              <InProgressIcon statusFor="group" />
            ) : groupStatus === "Complete" ? (
              <SuccessIcon statusFor="group" />
            ) : (
              <ErrorIcon statusFor="group" />
            )}
          </Box>
          <Typography
            variant="smallTextParagraphs"
            sx={{ lineHeight: 1.2, ml: 1.5 }}
          >
            {groupData.group?.description ?? "Flow"}
          </Typography>
        </Stack>
        <Stack alignItems="center" direction="row" gap={1} mt={0.2}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.3,
              color: ({ palette }) =>
                groupStatus === "In Progress"
                  ? palette.blue[70]
                  : groupStatus === "Errored"
                    ? palette.error.main
                    : palette.common.black,
            }}
          >
            {timeTaken}
          </Typography>
          <CaretDownSolidIcon
            sx={{
              color: ({ palette }) => palette.gray[50],
              height: 14,
              transform: !showSteps ? "rotate(-90deg)" : "translateY(-1px)",
              transition: ({ transitions }) => transitions.create("transform"),
            }}
          />
        </Stack>
      </Stack>

      <Collapse in={showSteps}>
        <Box
          sx={{
            borderLeft: ({ palette }) => `1px solid ${palette.gray[30]}`,
            ml: 1,
            my: 1,
          }}
        >
          {groupStepsWithIds.map((step) => (
            <GroupStepStatus
              key={step.stepId}
              kind={step.data.kind}
              label={step.data.label}
              stepId={step.stepId}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
