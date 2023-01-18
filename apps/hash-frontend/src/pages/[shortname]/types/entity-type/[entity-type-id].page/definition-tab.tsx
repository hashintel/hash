import { Box, Stack, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { LinkListCard } from "./definition-tab/link-list-card";
import { PropertyListCard } from "./definition-tab/property-list-card";
import { useEntityType } from "./shared/entity-type-context";

export const DefinitionTab: FunctionComponent = () => {
  const entityType = useEntityType();

  return (
    <Stack spacing={6.5}>
      <Box>
        <Typography variant="h5" mb={2}>
          Properties of{" "}
          <Box component="span" sx={{ fontWeight: "bold" }}>
            {entityType.title}
          </Box>
        </Typography>
        <PropertyListCard />
      </Box>

      <Box>
        <Typography variant="h5" mb={2}>
          Links defined on{" "}
          <Box component="span" sx={{ fontWeight: "bold" }}>
            {entityType.title}
          </Box>
        </Typography>
        <LinkListCard />
      </Box>
    </Stack>
  );
};
