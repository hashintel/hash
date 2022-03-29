// @todo remove this
import { Box } from "@mui/system";
import { ComponentProps, VFC } from "react";

/**
 * @todo decide if this is the approach we want for icons
 *
 * @note A necessary script for this is added in
 *   {@link import("../../theme/MuiProvider").MuiProvider}
 */
export const FaIcon: VFC<
  { name: string; type: string } & ComponentProps<typeof Box>
> = ({ name, type, ...props }) => (
  <Box component="span" className={`fa-${name} fa-${type}`} {...props} />
);
