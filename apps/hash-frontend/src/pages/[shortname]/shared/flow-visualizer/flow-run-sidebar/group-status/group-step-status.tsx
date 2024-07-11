import {
  ArrowRightIconRegular,
  CheckRegularIcon,
  CircleEllipsisRegularIcon,
  CloseIcon,
} from "@hashintel/design-system";
import { EllipsisRegularIcon } from "../../../../../../shared/icons/ellipsis-regular-icon";
import type { StepDefinition } from "@local/hash-isomorphic-utils/src/flows/types";
import {
  statusToSimpleStatus,
  useStatusForStep,
} from "../../../../../shared/flow-runs-context";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";

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

export const SuccessIcon = ({ statusFor }: IconProps) => (
  <CheckRegularIcon
    sx={{ fill: ({ palette }) => palette.success.main, ...iconSx[statusFor] }}
  />
);

export const WaitingIcon = ({ statusFor }: IconProps) =>
  statusFor === "group" ? (
    <CircleEllipsisRegularIcon
      sx={{ fill: ({ palette }) => palette.gray[50], ...iconSx[statusFor] }}
    />
  ) : (
    <EllipsisRegularIcon
      sx={{ fill: ({ palette }) => palette.gray[50], ...iconSx[statusFor] }}
    />
  );

export const ErrorIcon = ({ statusFor }: IconProps) => (
  <CloseIcon
    sx={{
      fill: ({ palette }) => palette.error.main,
      fontSize: iconSx[statusFor].fontSize - 1,
    }}
  />
);

export const InProgressIcon = ({ statusFor }: IconProps) =>
  statusFor === "group" ? (
    <CircularProgress
      disableShrink
      size={iconSx.group.fontSize}
      sx={{ fill: ({ palette }) => palette.blue[70] }}
      variant="indeterminate"
    />
  ) : (
    <ArrowRightIconRegular
      sx={{ fill: ({ palette }) => palette.blue[70], ...iconSx[statusFor] }}
    />
  );

export const GroupStepStatus = ({
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
        {!simpleStatus ||
        simpleStatus === "Waiting" ||
        simpleStatus === "Information Required" ? (
          <WaitingIcon statusFor="step" />
        ) : simpleStatus === "In Progress" ? (
          <InProgressIcon statusFor="step" />
        ) : simpleStatus === "Complete" ? (
          <SuccessIcon statusFor="step" />
        ) : (
          <ErrorIcon statusFor="step" />
        )}
      </Box>
      <Typography sx={{ fontSize: 14, ml: 1, mt: 0.2 }}>{label}</Typography>
    </Stack>
  );
};
