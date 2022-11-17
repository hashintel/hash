import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { PropertyListCard } from "../property-list-card";
import { useEntityType } from "../use-entity-type";

export const DefinitionTab: FunctionComponent = () => {
  const entityType = useEntityType();

  return (
    <>
      <Typography variant="h5" mb={2}>
        Properties of{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {entityType?.title}
        </Box>
      </Typography>
      <PropertyListCard />
    </>
  );
};
