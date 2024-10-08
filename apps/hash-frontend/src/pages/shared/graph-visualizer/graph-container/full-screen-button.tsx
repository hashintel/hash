import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  IconButton,
} from "@hashintel/design-system";

import { buttonSx } from "./shared/button-styles";
import { useFullScreen } from "./shared/full-screen-context";

export const FullScreenButton = () => {
  const { isFullScreen, toggleFullScreen } = useFullScreen();

  return (
    <IconButton
      onClick={toggleFullScreen}
      sx={[buttonSx, { top: 8, left: 13 }]}
    >
      {isFullScreen ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </IconButton>
  );
};
