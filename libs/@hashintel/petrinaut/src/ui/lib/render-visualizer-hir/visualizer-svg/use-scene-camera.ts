import { useEffect, useRef, useState } from "react";

import { camerasMatch, fitCamera, interpolateCamera } from "./camera";

import type { Camera, Size } from "./camera";
import type { VisualizerSvgOptions } from "@hashintel/petrinaut-core";

export const useSceneCamera = (
  options: VisualizerSvgOptions,
  size: Size,
  animated: boolean,
) => {
  const [view, setView] = useState(() => {
    const camera = fitCamera(options, size);
    return { camera, home: camera };
  });
  const animationFrame = useRef<number | null>(null);

  const cancelAnimation = () => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  };

  useEffect(() => cancelAnimation, []);

  const navigate = (update: (camera: Camera) => Camera) => {
    cancelAnimation();
    setView((previous) => ({ ...previous, camera: update(previous.camera) }));
  };

  const reset = () => {
    cancelAnimation();
    const home = fitCamera(options, size);
    if (
      camerasMatch(view.camera, home) ||
      !animated ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setView({ camera: home, home });
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / 180));
      if (progress === 1) {
        animationFrame.current = null;
        setView({ camera: home, home });
      } else {
        setView({
          ...view,
          camera: interpolateCamera(view.camera, home, progress),
        });
        animationFrame.current = requestAnimationFrame(tick);
      }
    };
    animationFrame.current = requestAnimationFrame(tick);
  };

  return {
    camera: view.camera,
    changed: !camerasMatch(view.camera, view.home),
    navigate,
    reset,
  };
};
