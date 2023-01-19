import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import {
  Box,
  BoxProps,
  experimental_sx as sx,
  styled,
  Theme,
  Tooltip,
} from "@mui/material";
import { ComponentProps, ReactNode } from "react";

const StyledQuestionIcon = styled(
  (props: Omit<ComponentProps<typeof FontAwesomeIcon>, "icon">) => (
    <FontAwesomeIcon {...props} icon={faQuestionCircle} />
  ),
)(
  sx<Theme>((theme) => ({
    color: theme.palette.gray[40],
  })),
);

export const QuestionIcon = ({
  tooltip,
  ...props
}: { tooltip: NonNullable<ReactNode> } & BoxProps) => {
  return (
    <Tooltip
      title={tooltip}
      placement="top"
      PopperProps={{
        modifiers: [
          {
            name: "offset",
            options: {
              offset: [0, 8],
            },
          },
        ],
      }}
    >
      <Box display="inline" {...props}>
        <StyledQuestionIcon />
      </Box>
    </Tooltip>
  );
};
