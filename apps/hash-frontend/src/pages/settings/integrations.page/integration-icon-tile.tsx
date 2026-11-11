import { Box } from "@mui/material";

import {
  genericIntegrationIconPath,
  integrationIconPaths,
} from "./integration-icon-paths";

export const IntegrationIconTile = ({
  name,
  tileSize = 44,
}: {
  name: string;
  tileSize?: number;
}) => (
  <Box
    component="img"
    src={integrationIconPaths[name] ?? genericIntegrationIconPath}
    alt=""
    width={tileSize}
    height={tileSize}
    sx={{ flexShrink: 0 }}
  />
);
