import {
  ArrowLeftIcon,
  ArrowRightIconRegular,
  CloseIcon,
  IconButton,
} from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";

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
      paddingX={4}
      paddingY={2}
      display="flex"
      justifyContent="space-between"
    >
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
              <ArrowRightIconRegular />
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
  );
};
