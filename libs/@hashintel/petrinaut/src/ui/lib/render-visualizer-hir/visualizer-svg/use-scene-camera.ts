import { useEffect, useRef, useState } from "react";

import { camerasMatch, fitCamera, interpolateCamera } from "./camera";

import type { Camera, Size } from "./camera";
import type { VisualizerSvgOptions } from "@hashintel/petrinaut-core";

export const useSceneCamera = (
  options: VisualizerSvgOptions,
  size: Size,
  animated: boolean,
) => {
  const [view, setView] = useState<Camera | null>(null);
  const home = fitCamera(options, size);
  const camera = view ?? home;
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
    setView((previous) => {
      const next = update(previous ?? home);
      return camerasMatch(next, home) ? null : next;
    });
  };

  const reset = () => {
    cancelAnimation();
    if (
      camerasMatch(camera, home) ||
      !animated ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setView(null);
      return;
    }
    let startedAt: number | undefined;
    const tick = (now: number) => {
      if (startedAt === undefined) startedAt = now;
      const progress = Math.max(0, Math.min(1, (now - startedAt) / 180));
      if (progress === 1) {
        animationFrame.current = null;
        setView(null);
      } else {
        setView(interpolateCamera(camera, home, progress));
        animationFrame.current = requestAnimationFrame(tick);
      }
    };
    animationFrame.current = requestAnimationFrame(tick);
  };

  return {
    camera,
    homeZoom: home.zoom,
    changed: !camerasMatch(camera, home),
    navigate,
    reset,
  };
};
