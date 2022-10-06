import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Paper, Typography } from "@mui/material";
import { EntitySection } from "./shared/entity-section";

export const TypesSection = () => {
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
            Company
          </Typography>
        </Paper>
      </Box>
    </EntitySection>
  );
};
