import { Box, Tooltip } from "@mui/material";

import {
  ArrowLeftIcon,
  ArrowRightRegularIcon,
  CloseIcon,
  IconButton,
} from "@hashintel/design-system";

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
        position: "absolute",
        top: 0,
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: "auto",
        pt: 1.5,
        pr: 3,
        zIndex: 2,
      }}
    >
      <Box display="flex" justifyContent="space-between" gap={1}>
        {(onBack ?? onForward) ? (
          <>
            <Tooltip title="Back" placement="bottom">
              <IconButton disabled={!onBack} onClick={onBack}>
                <ArrowLeftIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Forward" placement="bottom">
              <IconButton disabled={!onForward} onClick={onForward}>
                <ArrowRightRegularIcon />
              </IconButton>
            </Tooltip>
          </>
        ) : null}
        <Tooltip title="Close" placement="bottom">
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
