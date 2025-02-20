import {
  ArrowLeftIcon,
  ArrowRightRegularIcon,
  CloseIcon,
  IconButton,
} from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";

export const backForwardHeight = 56;

export const SlideBackForwardCloseBar = ({
  onBack,
  onClose,
  onForward,
}: {
  onBack?: () => void;
  onClose?: () => void;
  onForward?: () => void;
}) => {
  return (
    <Box
      sx={{
        width: "100%",
        position: "sticky",
        top: 0,
        background: ({ palette }) => palette.common.white,
        zIndex: 2,
      }}
    >
      <Box pl={3} pr={4} py={1.5} display="flex" justifyContent="space-between">
        <Box display="flex" justifyContent="space-between" gap={1}>
          {(onBack ?? onForward) ? (
            <Tooltip title="Back" placement="bottom">
              <IconButton disabled={!onBack} onClick={onBack}>
                <ArrowLeftIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          {onForward ? (
            <Tooltip title="Forward" placement="bottom">
              <IconButton onClick={onForward}>
                <ArrowRightRegularIcon />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
        <Tooltip title="Close" placement="bottom">
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
