import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
} from "@hashintel/design-system";

import { GrayToBlueIconButton } from "../../gray-to-blue-icon-button";
import { useFullScreen } from "./shared/full-screen-context";

export const FullScreenButton = () => {
  const { isFullScreen, toggleFullScreen } = useFullScreen();

  if (!document.fullscreenEnabled) {
    return null;
  }

  return (
    <GrayToBlueIconButton onClick={toggleFullScreen}>
      {isFullScreen ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </GrayToBlueIconButton>
  );
};
