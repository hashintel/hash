/**
 * The single focus-dim formula, shared by the worker (entity dots + edge beziers, dimmed in
 * the SABs / bezier buffers) and the main thread (cluster bubbles, dimmed in the layer) so
 * everything recedes by exactly the same amount when a highlight is active. Desaturates toward
 * a neutral grey and drops alpha, so a non-highlighted element fades into the background.
 */
import type { Color } from "./frames";

const DIM_GRAY = 150;
const DIM_MIX = 0.8;
const DIM_ALPHA = 0.2;

export function dimColor(color: Color): Color {
  return [
    Math.round(color[0] + (DIM_GRAY - color[0]) * DIM_MIX),
    Math.round(color[1] + (DIM_GRAY - color[1]) * DIM_MIX),
    Math.round(color[2] + (DIM_GRAY - color[2]) * DIM_MIX),
    Math.round(color[3] * DIM_ALPHA),
  ];
}
