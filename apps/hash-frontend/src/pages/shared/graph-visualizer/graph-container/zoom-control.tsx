import { DashIcon, IconButton, PlusIcon } from "@hashintel/design-system";
import { useSigma } from "@react-sigma/core";

import { controlButtonSx } from "./shared/control-components";

export const ZoomControl = () => {
  const sigma = useSigma();

  const camera = sigma.getCamera();

  return (
    <>
      <IconButton
        onClick={() => camera.animatedUnzoom(1.5)}
        sx={controlButtonSx}
      >
        <DashIcon />
      </IconButton>
      <IconButton onClick={() => camera.animatedZoom(1.5)} sx={controlButtonSx}>
        <PlusIcon />
      </IconButton>
    </>
  );
};
