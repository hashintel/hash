/**
 * The shapes a deck can be drawn in. `responsive` fills the window; a ratio
 * draws the slide at a fixed size and scales it to fit, so it looks the
 * same on every screen. Plain data, so the dev server's export route can
 * read it too.
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
