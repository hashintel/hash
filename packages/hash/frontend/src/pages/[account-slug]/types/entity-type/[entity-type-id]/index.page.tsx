import { Box, Typography } from "@mui/material";
import { NextPageWithLayout } from "../../../../../shared/layout";
import { PropertyListCard } from "../property-list-card";
import {
  PropertyTypesContext,
  usePropertyTypesContextValue,
} from "../use-property-types";
import { getEntityTypeEditorLayout } from "../entity-type-header";
import { useEntityType } from "../use-entity-type";

const Page: NextPageWithLayout = () => {
  const propertyTypes = usePropertyTypesContextValue();
  const entityType = useEntityType();

  return (
    <PropertyTypesContext.Provider value={propertyTypes}>
      <Typography variant="h5" mb={1.25}>
        Properties of{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {entityType?.title}
        </Box>
      </Typography>
      <PropertyListCard />
    </PropertyTypesContext.Provider>
  );
};
Page.getLayout = getEntityTypeEditorLayout;

export default Page;
