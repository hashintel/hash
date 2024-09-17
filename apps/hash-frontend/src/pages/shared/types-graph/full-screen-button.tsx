import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  IconButton,
} from "@hashintel/design-system";
import type { FullScreenHandle } from "react-full-screen";

import { useLayout } from "./use-layout";

export const FullScreenButton = ({ handle }: { handle: FullScreenHandle }) => {
  const layout = useLayout();

  return (
    <IconButton
      onClick={() => {
        void (handle.active ? handle.exit : handle.enter)().then(() =>
          layout(),
        );
      }}
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
      {handle.active ? (
        <ArrowDownLeftAndArrowUpRightToCenterIcon />
      ) : (
        <ArrowUpRightAndArrowDownLeftFromCenterIcon />
      )}
    </IconButton>
  );
};
