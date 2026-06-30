import { Tooltip } from "@mui/material";

import {
  MagnifyingGlassMinusLightIcon,
  MagnifyingGlassPlusLightIcon,
} from "@hashintel/design-system";

import { ArrowsToLineRegularIcon } from "../../../../shared/icons/arrows-to-line-regular-icon";
import { GrayToBlueIconButton } from "../../gray-to-blue-icon-button";

interface GraphControlsProps {
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFitView: () => void;
}

export const GraphControls = ({
  onZoomIn,
  onZoomOut,
  onFitView,
}: GraphControlsProps) => (
  <>
    <Tooltip title="Zoom in" placement="left">
      <GrayToBlueIconButton
        aria-label="Zoom in"
        onClick={onZoomIn}
        sx={{ position: "absolute", right: 13, bottom: 94, zIndex: 8 }}
      >
        <MagnifyingGlassPlusLightIcon />
      </GrayToBlueIconButton>
    </Tooltip>
    <Tooltip title="Zoom out" placement="left">
      <GrayToBlueIconButton
        aria-label="Zoom out"
        onClick={onZoomOut}
        sx={{ position: "absolute", right: 13, bottom: 51, zIndex: 8 }}
      >
        <MagnifyingGlassMinusLightIcon />
      </GrayToBlueIconButton>
    </Tooltip>
    <Tooltip title="Fit graph to view" placement="left">
      <GrayToBlueIconButton
        aria-label="Fit graph to view"
        onClick={onFitView}
        sx={{ position: "absolute", right: 13, bottom: 8, zIndex: 8 }}
      >
        <ArrowsToLineRegularIcon />
      </GrayToBlueIconButton>
    </Tooltip>
  </>
);
