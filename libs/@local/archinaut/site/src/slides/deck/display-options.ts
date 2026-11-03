/**
 * How the viewer wants the deck drawn: the slide's shape, and whether a
 * slide whose content does not fit is flagged. Both are the viewer's
 * choice, kept per browser, not the deck's.
 */

import { parseSlideShape } from "./slide-shape";
import { useStoredPreference } from "./stored-preference";

const parseSwitch = (stored: string | null): "on" | "off" | undefined =>
  stored === "on" || stored === "off" ? stored : undefined;

export const useDisplayOptions = () => {
  const [slideShape, setSlideShape] = useStoredPreference(
    "slides.slide-shape.v1",
    parseSlideShape,
    "responsive",
  );
  const [overflowSwitch, setOverflowSwitch] = useStoredPreference(
    "slides.flag-overflow.v1",
    parseSwitch,
    "off",
  );
  return {
    slideShape,
    setSlideShape,
    flagOverflow: overflowSwitch === "on",
    setFlagOverflow: (on: boolean) => setOverflowSwitch(on ? "on" : "off"),
  };
};
