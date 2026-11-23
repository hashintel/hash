import { Box, styled, Tooltip } from "@mui/material";

import { HashInlineIcon } from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";

import type { BoxProps } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";

const faQuestionCircle = { icon: "help" } as const;

const StyledQuestionIcon = styled(
  (props: Omit<ComponentProps<typeof HashInlineIcon>, "icon">) => (
    <HashInlineIcon {...props} icon={faQuestionCircle} />
  ),
)(({ theme }) =>
  theme.unstable_sx({
    color: theme.palette.gray[40],
  }),
);

export const QuestionIcon = ({
  tooltip,
  ...props
}: { tooltip: NonNullable<ReactNode> } & BoxProps) => {
  return (
    <Tooltip
      title={tooltip}
      placement="top"
      classes={{ popper: fluidFontClassName }}
    >
      <Box display="inline" {...props}>
        <StyledQuestionIcon />
      </Box>
    </Tooltip>
  );
};
