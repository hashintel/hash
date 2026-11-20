import { StaticHashIcon } from "@hashintel/ds-icons/static";
/**
 * A thumbtack, for fixing a floating surface in place.
 *
 * Drawn here rather than taken from the icon set, which has no pin. Rounded
 * throughout and stroked thinly: it sits over a visualizer's own artwork, so
 * it has to read as a mark rather than compete as a picture.
 */
export const PinIcon = () => (
  <StaticHashIcon aria-hidden fill="none" height={13} width={13} name="pin" />
);
