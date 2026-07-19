/**
 * Consumer-facing derivation of the network graph's camera max-zoom from the
 * closest node spacing.
 *
 * {@link NetworkGraph} takes `maxZoom` as an absolute orthographic zoom
 * (`2 ** zoom` = pixels per world unit) rather than deriving it itself, so a
 * caller can choose how far in the camera may go from whatever it knows about its
 * data. This is the derivation the non-tiled consumers use, factored out so the
 * component no longer needs the global minimum node distance — a value a tiled
 * consumer can't cheaply obtain.
 */

/**
 * On-screen distance (px) the closest pair of nodes sit apart at max zoom, so two
 * distinct nodes stay just resolvable rather than fusing into one blob.
 */
const MAX_ZOOM_TARGET_CLOSEST_PX = 1;

/**
 * The absolute orthographic max-zoom at which the closest pair of nodes,
 * `nodeMinDistance` world units apart, sit {@link MAX_ZOOM_TARGET_CLOSEST_PX} px
 * apart on screen — solving `nodeMinDistance · 2 ** zoom = target`. Pass the
 * result as {@link NetworkGraph}'s `maxZoom`.
 *
 * Returns `null` when `nodeMinDistance` is unusable (`0` or non-finite, as for an
 * empty or single-node graph), letting the graph fall back to its framing-based
 * default.
 */
export const maxZoomForNodeMinDistance = (
  nodeMinDistance: number,
): number | null =>
  Number.isFinite(nodeMinDistance) && nodeMinDistance > 0
    ? Math.log2(MAX_ZOOM_TARGET_CLOSEST_PX / nodeMinDistance)
    : null;
