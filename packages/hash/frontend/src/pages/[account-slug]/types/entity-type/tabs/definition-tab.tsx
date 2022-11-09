import { Typography } from "@mui/material";
import { Box, Container } from "@mui/system";
import { FunctionComponent } from "react";
import { PropertyListCard } from "../property-list-card";

export type DefinitionTabProps = {
  entityTypeTitle: string;
};

export const DefinitionTab: FunctionComponent<DefinitionTabProps> = ({
  entityTypeTitle,
}) => {
  return (
    <Container>
      <Typography variant="h5" mb={1.25}>
        Properties of{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {entityTypeTitle}
        </Box>
      </Typography>
      <PropertyListCard />
    </Container>
  );
};
