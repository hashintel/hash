import { css } from "@hashintel/ds-helpers/css";

/**
 * Parks a zag popper's positioner off-screen until its first position
 * compute. Zag sets the placement — and with it the positioner's
 * translate3d(var(--x), var(--y), 0) transform — before the deferred compute
 * writes the inline `--x`/`--y`, so a dropdown that is open while unpositioned
 * (an initially-open select, or any popper racing its first paint) renders at
 * the portal container's origin. The park is leftward by more than the
 * element's own width because the content's height — unclamped while
 * `--available-height` is also still unset, hence its fallback here — can
 * exceed any fixed vertical offset. The computed inline values override these
 * the moment positioning lands.
 */
export const parkedPopperPositioner = css({
  "--x": "calc(-100vw - 100%)",
  "--y": "-100vh",
  "--available-height": "50vh",
});
