import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { fluidFontClassName, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, BoxProps, styled, Tooltip } from "@mui/material";
import { ComponentProps, ReactNode } from "react";

const StyledQuestionIcon = styled(
  (props: Omit<ComponentProps<typeof FontAwesomeIcon>, "icon">) => (
    <FontAwesomeIcon {...props} icon={faQuestionCircle} />
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
