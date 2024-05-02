import {
  CaretDownSolidIcon,
  CircleCheckRegularIcon,
  CircleEllipsisRegularIcon,
  CloseIcon,
} from "@hashintel/design-system";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import {
  Box,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from "@mui/material";
import { differenceInMilliseconds, intervalToDuration } from "date-fns";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useState } from "react";

import { isNonNullable } from "../../../lib/typeguards";
import { ArrowRightIcon } from "../../../shared/icons/arrow-right";
import { EllipsisRegularIcon } from "../../../shared/icons/ellipsis-regular-icon";
import { SectionLabel } from "./section-label";
import {
  statusToSimpleStatus,
  useStatusForStep,
  useStatusForSteps,
} from "./shared/flow-runs-context";
import { flowSectionBorderRadius } from "./shared/styles";
import type {
  FlowMaybeGrouped,
  GroupWithEdgesAndNodes,
  UngroupedEdgesAndNodes,
} from "./shared/types";

type StatusFor = "group" | "step";

const iconSx = {
  group: {
    fontSize: 18,
  },
  step: {
    fontSize: 13,
  },
} as const;

type IconProps = { statusFor: StatusFor };

const SuccessIcon = ({ statusFor }: IconProps) => (
  <CircleCheckRegularIcon
    sx={{ fill: ({ palette }) => palette.success.main, ...iconSx[statusFor] }}
  />
);

const WaitingIcon = ({ statusFor }: IconProps) =>
  statusFor === "group" ? (
    <CircleEllipsisRegularIcon
      sx={{ fill: ({ palette }) => palette.gray[50], ...iconSx[statusFor] }}
    />
  ) : (
    <EllipsisRegularIcon
      sx={{ fill: ({ palette }) => palette.gray[50], ...iconSx[statusFor] }}
    />
  );

const ErrorIcon = ({ statusFor }: IconProps) => (
  <CloseIcon
    sx={{
      fill: ({ palette }) => palette.error.main,
      fontSize: iconSx[statusFor].fontSize - 1,
    }}
  />
);

const InProgressIcon = ({ statusFor }: IconProps) =>
  statusFor === "group" ? (
    <CircularProgress
      disableShrink
      size={iconSx.group.fontSize}
      sx={{ fill: ({ palette }) => palette.blue[70] }}
      variant="indeterminate"
    />
  ) : (
    <ArrowRightIcon
      sx={{ fill: ({ palette }) => palette.blue[70], ...iconSx[statusFor] }}
    />
  );

const SidebarSection = ({ children }: PropsWithChildren) => (
  <Box
    sx={({ palette }) => ({
      background: palette.common.white,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: flowSectionBorderRadius,
      px: 3,
      py: 2.5,
    })}
  >
    {children}
  </Box>
);

const GroupStepStatus = ({
  kind,
  label,
  stepId,
}: {
  kind: StepDefinition["kind"];
  label: string;
  stepId: string;
}) => {
  const statusForStep = useStatusForStep(stepId);

  if (kind === "parallel-group") {
    return null;
  }

  const simpleStatus = statusForStep
    ? statusToSimpleStatus(statusForStep.status)
    : null;

  return (
    <Stack direction="row" ml={2} mb={1}>
      <Box>
        {!simpleStatus || simpleStatus === "Waiting" ? (
          <WaitingIcon statusFor="step" />
        ) : simpleStatus === "In Progress" ? (
          <InProgressIcon statusFor="step" />
        ) : simpleStatus === "Error" ? (
          <ErrorIcon statusFor="step" />
        ) : (
          <SuccessIcon statusFor="step" />
        )}
      </Box>
      <Typography sx={{ fontSize: 14, ml: 1, mt: 0.2 }}>{label}</Typography>
    </Stack>
  );
};

const pad = (num: number) => String(num).padStart(2, "0");

const formatTimeTaken = (scheduledAt: string, closedAt?: string) => {
  const start = new Date(scheduledAt);

  const elapsed = differenceInMilliseconds(
    closedAt ? new Date(closedAt) : new Date(),
    start,
  );

  const duration = intervalToDuration({ start: 0, end: elapsed });

  return [duration.hours, duration.minutes, duration.seconds]
    .filter(isNonNullable)
    .map(pad)
    .join(":");
};

const GroupStatus = ({
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
    let interval: NodeJS.Timer;

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
            ) : groupStatus === "Error" ? (
              <ErrorIcon statusFor="group" />
            ) : (
              <SuccessIcon statusFor="group" />
            )}
          </Box>
          <Typography
            variant="smallTextParagraphs"
            sx={{ lineHeight: 1.2, ml: 1.5 }}
          >
            {groupData.group?.description ?? "Flow"}
          </Typography>
        </Stack>
        <Stack direction="row" gap={1}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.3,
              mt: 0.1,
              color: ({ palette }) =>
                groupStatus === "In Progress"
                  ? palette.blue[70]
                  : groupStatus === "Error"
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

type FlowRunSidebarProps = {
  flowDefinition: FlowDefinition;
  groups: FlowMaybeGrouped["groups"];
};

export const FlowRunSidebar = ({
  flowDefinition,
  groups,
}: FlowRunSidebarProps) => {
  return (
    <Box sx={{ ml: 3, width: 320 }}>
      <Box sx={{ mb: 2 }}>
        <SectionLabel text="Description" />
        <SidebarSection>
          <Typography
            component="p"
            variant="smallTextParagraphs"
            sx={{ lineHeight: 1, mb: 0.7 }}
          >
            <strong>{flowDefinition.name}</strong>
          </Typography>
          <Typography
            component="p"
            variant="smallTextParagraphs"
            sx={{ lineHeight: "18px" }}
          >
            {flowDefinition.description}
          </Typography>
        </SidebarSection>
      </Box>
      <Box>
        <SectionLabel text="Flow" />
        <SidebarSection>
          <Box>
            {groups.map((groupData) => (
              <GroupStatus
                key={groupData.group?.groupId ?? "ungrouped"}
                groupData={groupData}
              />
            ))}
          </Box>
        </SidebarSection>
      </Box>
    </Box>
  );
};
