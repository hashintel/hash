import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useMemo } from "react";

import { Circle1RegularIcon } from "../../shared/icons/circle-1-regular-icon";
import { Circle2RegularIcon } from "../../shared/icons/circle-2-regular-icon";
import { Circle3RegularIcon } from "../../shared/icons/circle-3-regular-icon";
import { Circle4RegularIcon } from "../../shared/icons/circle-4-regular-icon";
import { CircleArrowRightRegularIcon } from "../../shared/icons/circle-arrow-right-regular-icon";

type StepName =
  | "verify-email"
  | "reserve-username"
  | "start-using-hash"
  | "accept-invitation";

type Step = {
  name: StepName;
  label: string;
  labelPastTense?: string;
};

const stepsWithoutInvitation: Step[] = [
  {
    name: "verify-email",
    label: "Verify your email address",
    labelPastTense: "Email address verified",
  },
  {
    name: "reserve-username",
    label: "Reserve your username",
    labelPastTense: "Username reserved",
  },
  {
    name: "start-using-hash",
    label: "Start using HASH",
  },
];

const stepsWithInvitation: Step[] = [
  {
    name: "accept-invitation",
    label: "Accept invitation",
    labelPastTense: "Invitation accepted",
  },
  ...stepsWithoutInvitation,
];

const stepNumberToHumanReadable: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
};

const stepNumberToCircleIcon: Record<number, ReactNode> = {
  1: <Circle1RegularIcon />,
  2: <Circle2RegularIcon />,
  3: <Circle3RegularIcon />,
  4: <Circle4RegularIcon />,
};

export const SignupSteps: FunctionComponent<{
  currentStep: StepName;
  withInvitation: boolean;
}> = ({ currentStep, withInvitation }) => {
  const stepsToDisplay = withInvitation
    ? stepsWithInvitation
    : stepsWithoutInvitation;

  const currentStepIndex = useMemo(
    () => stepsToDisplay.findIndex(({ name }) => name === currentStep),
    [currentStep, stepsToDisplay],
  );

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        rowGap: 2,
      }}
    >
      {stepsToDisplay.map(({ name, label, labelPastTense }, index) => {
        const isCurrentStep = currentStepIndex === index;

        const isCompletedStep = currentStepIndex > index;

        return (
          <Box
            key={name}
            sx={{
              display: "flex",
              alignItems: "center",
              columnGap: 4,
              borderRadius: "8px",
              paddingX: 8,
              paddingY: 4,
              background: ({ palette }) =>
                isCurrentStep ? "#001F41" : palette.common.white,
              svg: {
                fontSize: 24,
                color: ({ palette }) =>
                  isCurrentStep ? palette.blue[50] : palette.gray[60],
              },
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: ({ palette }) => palette.gray[30],
            }}
          >
            {isCurrentStep ? (
              <CircleArrowRightRegularIcon />
            ) : isCompletedStep ? (
              <FontAwesomeIcon icon={faCircleCheck} />
            ) : (
              stepNumberToCircleIcon[index + 1]
            )}
            <Box>
              <Typography
                sx={{
                  color: ({ palette }) =>
                    isCurrentStep ? palette.common.white : palette.common.black,
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: "130%",
                }}
              >
                Step {stepNumberToHumanReadable[index + 1]}
              </Typography>
              <Typography
                sx={{
                  color: ({ palette }) =>
                    isCurrentStep ? palette.common.white : palette.gray[50],
                  fontSize: 16,
                  fontWeight: 400,
                  lineHeight: "130%",
                }}
              >
                {isCompletedStep ? labelPastTense : label}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
