import { useEffect, useRef, useState } from "react";

const defaultIntervalMs = 500;

/**
 * Speech arrives as a stream of small deltas. Announcing every one of them
 * makes a screen reader unusable, so the caption is announced at most once per
 * interval, always ending on the latest text.
 */
export const useThrottledAnnouncement = (
  text: string,
  intervalMs: number = defaultIntervalMs,
): string => {
  const [announcement, setAnnouncement] = useState(text);
  const latestTextRef = useRef(text);
  const lastAnnouncedAtRef = useRef(0);

  useEffect(() => {
    latestTextRef.current = text;
    const elapsedMs = Date.now() - lastAnnouncedAtRef.current;
    const timeout = globalThis.setTimeout(
      () => {
        lastAnnouncedAtRef.current = Date.now();
        setAnnouncement(latestTextRef.current);
      },
      Math.max(intervalMs - elapsedMs, 0),
    );

    return () => globalThis.clearTimeout(timeout);
  }, [intervalMs, text]);

  return announcement;
};
