import { Typography } from "@mui/material";
import { Box } from "@mui/system";
import { FunctionComponent } from "react";
import { PropertyListCard } from "../property-list-card";
import {
  PropertyTypesContext,
  usePropertyTypesContextValue,
} from "../use-property-types";

export type DefinitionTabProps = {
  entityTypeTitle: string;
};

export const DefinitionTab: FunctionComponent<DefinitionTabProps> = ({
  entityTypeTitle,
}) => {
  const propertyTypes = usePropertyTypesContextValue();

  return (
    <PropertyTypesContext.Provider value={propertyTypes}>
      <Typography variant="h5" mb={1.25}>
        Properties of{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {entityTypeTitle}
        </Box>
      </Typography>
      <PropertyListCard />
    </PropertyTypesContext.Provider>
  );
};
