import { Box } from "@mui/system";
import { ComponentProps, VFC } from "react";

/**
 * @note A necessary script for this is added in
 *   {@link import("../../theme/MuiProvider").MuiProvider}
 */
export const FaIcon: VFC<
  { name: string; type: string } & ComponentProps<typeof Box>
> = ({ name, type, ...props }) => (
  <Box component="span" className={`fa-${name} fa-${type}`} {...props} />
);
