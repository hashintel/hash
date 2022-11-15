import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { PropertyListCard } from "../property-list-card";
import {
  PropertyTypesContext,
  usePropertyTypesContextValue,
} from "../use-property-types";
import { useEntityType } from "../use-entity-type";

export const DefinitionTab: FunctionComponent = () => {
  const propertyTypes = usePropertyTypesContextValue();
  const entityType = useEntityType();

  return (
    <PropertyTypesContext.Provider value={propertyTypes}>
      <Typography variant="h5" mb={2}>
        Properties of{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {entityType?.title}
        </Box>
      </Typography>
      <PropertyListCard />
    </PropertyTypesContext.Provider>
  );
};
