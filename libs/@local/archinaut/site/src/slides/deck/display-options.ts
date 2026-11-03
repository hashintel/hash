/**
 * How the viewer wants the deck drawn: the slide's shape, and whether a
 * slide whose content does not fit is flagged. Both are the viewer's
 * choice, kept per browser, not the deck's.
 */

import { useStoredPreference } from "./stored-preference";

/**
 * `responsive` fills the window. A ratio draws the slide at a fixed size
 * and scales it to fit, so it looks the same on every screen.
 */
export type SlideShape = "responsive" | "16:9" | "4:3";

export const slideShapeOptions: readonly {
  value: SlideShape;
  label: string;
}[] = [
  { value: "responsive", label: "Fill the window" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
];

export const parseSlideShape = (
  stored: string | null,
): SlideShape | undefined =>
  slideShapeOptions.find((option) => option.value === stored)?.value;

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
