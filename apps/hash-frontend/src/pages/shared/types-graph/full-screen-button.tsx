import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  IconButton,
} from "@hashintel/design-system";

import { useFullScreen } from "./shared/full-screen";

export const FullScreenButton = () => {
  const { isFullScreen, toggleFullScreen } = useFullScreen();

  return (
    <IconButton
      onClick={toggleFullScreen}
      sx={({ palette }) => ({
        background: palette.common.white,
        borderColor: palette.gray[30],
        borderStyle: "solid",
        borderWidth: 1,
        borderRadius: "4px",
        position: "absolute",
        top: 8,
        right: 14,
        transition: "none",
      })}
    >
      {isFullScreen ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </IconButton>
  );
};
