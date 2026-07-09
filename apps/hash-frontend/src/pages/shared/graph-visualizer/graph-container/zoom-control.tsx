import { useSigma } from "@react-sigma/core";

import {
  MagnifyingGlassMinusLightIcon,
  MagnifyingGlassPlusLightIcon,
} from "@hashintel/design-system";

import { GrayToBlueIconButton } from "../../gray-to-blue-icon-button";

export const ZoomControl = () => {
  const sigma = useSigma();

  const camera = sigma.getCamera();

  return (
    <>
      <GrayToBlueIconButton onClick={() => camera.animatedUnzoom(1.5)}>
        <MagnifyingGlassMinusLightIcon />
      </GrayToBlueIconButton>
      <GrayToBlueIconButton onClick={() => camera.animatedZoom(1.5)}>
        <MagnifyingGlassPlusLightIcon />
      </GrayToBlueIconButton>
    </>
  );
};
