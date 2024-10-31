import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  IconButton,
} from "@hashintel/design-system";

import { controlButtonSx } from "./shared/control-components";
import { useFullScreen } from "./shared/full-screen-context";

export const FullScreenButton = () => {
  const { isFullScreen, toggleFullScreen } = useFullScreen();

  if (!document.fullscreenEnabled) {
    return null;
  }

  return (
    <IconButton onClick={toggleFullScreen} sx={controlButtonSx}>
      {isFullScreen ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </IconButton>
  );
};
