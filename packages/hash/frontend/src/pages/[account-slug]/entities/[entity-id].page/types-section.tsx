import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Paper, Typography } from "@mui/material";
import { useEntityEditor } from "./entity-editor-context";
import { EntitySection } from "./shared/entity-section";

export const TypesSection = () => {
  const { entity } = useEntityEditor();
  const entityTypeTitle = entity?.entityTypeRootedSubgraph.entityType.title;

  return (
    <EntitySection title="Type">
      <Box display="flex">
        <Paper
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1.5,
            py: 1.25,
            gap: 1.25,
            color: ({ palette }) => palette.black,
          }}
        >
          <FontAwesomeIcon icon={faAsterisk} />
          <Typography variant="smallTextLabels" fontWeight={600}>
            {entityTypeTitle}
          </Typography>
        </Paper>
      </Box>
    </EntitySection>
  );
};
