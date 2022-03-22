import { VFC } from "react";

/**
 * @todo decide if this is the approach we want for icons
 *
 * @note A necessary script for this is added in {@link import("../../theme/MuiProvider").MuiProvider}
 */
export const FaIcon: VFC<{ name: string; type: string }> = ({ name, type }) => (
  <span className={`fa-${name} fa-${type}`} />
);
