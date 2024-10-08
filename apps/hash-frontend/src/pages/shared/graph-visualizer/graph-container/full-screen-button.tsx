import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  IconButton,
} from "@hashintel/design-system";

import { controlButtonSx } from "./shared/control-components";
import { useFullScreen } from "./shared/full-screen-context";

export const FullScreenButton = () => {
  const { isFullScreen, toggleFullScreen } = useFullScreen();

  return (
    <IconButton
      onClick={toggleFullScreen}
      sx={[controlButtonSx, { position: "absolute", top: 8, left: 13 }]}
    >
      {isFullScreen ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </IconButton>
  );
};
