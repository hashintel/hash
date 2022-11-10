import {
  EntityType,
  extractBaseUri,
  VersionedUri,
} from "@blockprotocol/type-system-web";
import { Box, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";
import { TabButton } from "./tab-button";

export const EntityTypeDefinitionTab = ({
  entityType,
}: {
  entityType: EntityType;
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const propertiesCount = useWatch({ control, name: "properties.length" });

  return (
    <TabButton
      href={extractBaseUri(entityType.$id as VersionedUri)}
      sx={(theme) => ({
        borderBottomColor: theme.palette.blue[60],
        color: theme.palette.blue[70],
      })}
    >
      <Typography variant="smallTextLabels" sx={{ fontWeight: 500 }}>
        Definition
      </Typography>
      <Box
        sx={(theme) => ({
          py: 0.25,
          px: 1,
          backgroundColor: theme.palette.blue[20],
          borderRadius: "30px",
          ml: 1,
        })}
      >
        <Typography variant="microText" sx={{ fontWeight: 500 }}>
          {propertiesCount}
        </Typography>
      </Box>
    </TabButton>
  );
};
