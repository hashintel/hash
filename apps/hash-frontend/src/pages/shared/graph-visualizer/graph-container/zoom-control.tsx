import {
  IconButton,
  MagnifyingGlassMinusIconLight,
  MagnifyingGlassPlusIconLight,
} from "@hashintel/design-system";
import { useSigma } from "@react-sigma/core";

import { GrayToBlueIconButton } from "../../gray-to-blue-icon-button";

export const ZoomControl = () => {
  const sigma = useSigma();

  const camera = sigma.getCamera();

  return (
    <>
      <GrayToBlueIconButton onClick={() => camera.animatedUnzoom(1.5)}>
        <MagnifyingGlassMinusIconLight />
      </GrayToBlueIconButton>
      <IconButton onClick={() => camera.animatedZoom(1.5)}>
        <MagnifyingGlassPlusIconLight />
      </IconButton>
    </>
  );
};
