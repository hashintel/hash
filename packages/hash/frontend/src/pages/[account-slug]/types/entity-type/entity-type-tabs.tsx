import { EntityType } from "@blockprotocol/type-system-web";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Typography } from "@mui/material";
import { EntityTypeDefinitionTab } from "./entity-type-definition-tab";
import { TabButton } from "./tab-button";

export const EntityTypeTabs = ({ entityType }: { entityType: EntityType }) => {
  return (
    <Box display="flex">
      <EntityTypeDefinitionTab entityType={entityType} />
      <Box display="flex" ml="auto">
        <TabButton href="#" sx={(theme) => ({ color: theme.palette.gray[90] })}>
          <Typography variant="smallTextLabels" sx={{ fontWeight: 500 }}>
            Create new entity
          </Typography>
          <FontAwesomeIcon
            icon={faPlus}
            sx={(theme) => ({
              ...theme.typography.smallTextLabels,
              color: theme.palette.blue[70],
              ml: 1,
            })}
          />
        </TabButton>
      </Box>
    </Box>
  );
};
