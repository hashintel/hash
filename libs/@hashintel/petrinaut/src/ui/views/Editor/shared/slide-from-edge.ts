/**
 * The transform of a panel that slides in from an edge of its container, for
 * how far the panel is in view: off the edge at 0, in place at 1. `pushedBy`
 * moves it that many pixels further from the edge, for a panel that makes way
 * for another.
 *
 * In place the transform is `none` and not a translation by nothing. Any
 * transform makes the panel the containing block of the fixed elements inside
 * it, such as a code editor's suggestion list.
 */
export const slideFromEdge = (
  edge: "left" | "right" | "bottom",
  shown: number,
  pushedBy = 0,
): string => {
  if (shown === 1 && pushedBy === 0) {
    return "none";
  }
  const hidden = `${(1 - shown) * 100}%`;
  switch (edge) {
    case "left":
      return `translateX(calc(${pushedBy}px - ${hidden}))`;
    case "right":
      return `translateX(calc(${hidden} - ${pushedBy}px))`;
    case "bottom":
      return `translateY(calc(${hidden} - ${pushedBy}px))`;
  }
};
