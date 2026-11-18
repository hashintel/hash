import { useEffect, useState } from "react";

export const useBrowserFps = () => {
  const [frames, setFrames] = useState<readonly number[]>([]);

  useEffect(() => {
    let frameId = 0;
    let started = performance.now();
    let frameCount = 0;
    const sample = (now: number) => {
      frameCount += 1;
      const elapsed = now - started;
      if (elapsed >= 250) {
        const fps = (frameCount * 1000) / elapsed;
        setFrames((previous) => [...previous.slice(-23), fps]);
        started = now;
        frameCount = 0;
      }
      frameId = requestAnimationFrame(sample);
    };
    const resume = () => {
      cancelAnimationFrame(frameId);
      setFrames([]);
      started = performance.now();
      frameCount = 0;
      if (!document.hidden) frameId = requestAnimationFrame(sample);
    };
    if (!document.hidden) frameId = requestAnimationFrame(sample);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return frames;
};
