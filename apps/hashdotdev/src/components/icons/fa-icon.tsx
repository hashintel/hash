import { Box } from "@mui/material";
import { ComponentProps, FunctionComponent } from "react";

/**
 * @note A necessary script for this is added in
 *   {@link import("../../theme/MuiProvider").MuiProvider}
 */
export const FaIcon: FunctionComponent<
  { name: string; type: string } & ComponentProps<typeof Box>
> = ({ name, type, ...props }) => (
  <Box component="span" className={`fa-${name} fa-${type}`} {...props} />
);
