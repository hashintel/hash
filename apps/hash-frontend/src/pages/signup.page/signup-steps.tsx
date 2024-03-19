import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useMemo } from "react";

import { Circle1RegularIcon } from "../../shared/icons/circle-1-regular-icon";
import { Circle2RegularIcon } from "../../shared/icons/circle-2-regular-icon";
import { Circle3RegularIcon } from "../../shared/icons/circle-3-regular-icon";
import { CircleArrowRightRegularIcon } from "../../shared/icons/circle-arrow-right-regular-icon";

type StepName = "reserve-username" | "start-using-hash";

const steps: { name: StepName; label: string; labelPastTense?: string }[] = [
  // {
  //   name: "verify-email",
  //   label: "Verify your email address",
  //   labelPastTense: "Email address verified",
  // },
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

const stepNumberToHumanReadable: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
};

const stepNumberToCircleIcon: Record<number, ReactNode> = {
  1: <Circle1RegularIcon />,
  2: <Circle2RegularIcon />,
  3: <Circle3RegularIcon />,
};

export const SignupSteps: FunctionComponent<{
  currentStep: StepName;
}> = ({ currentStep }) => {
  const currentStepIndex = useMemo(
    () => steps.findIndex(({ name }) => name === currentStep),
    [currentStep],
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
      {steps.map(({ name, label, labelPastTense }, index) => {
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
