import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { Box, Typography } from "@mui/material";

import { SectionContainer } from "./shared/section-container";

export const FlowActions = () => {
  return (
    <SectionContainer>
      <Typography
        variant="h5"
        sx={{ color: ({ palette }) => palette.black, mb: 2 }}
      >
        Available Flow Actions
      </Typography>
      <Box>
        {Object.values(actionDefinitions).map((definition) => (
          <Box
            sx={{ ":not(:last-of-type)": { mb: 3 } }}
            key={definition.actionDefinitionId}
          >
            <Typography
              key={definition.actionDefinitionId}
              sx={{ fontWeight: 600, mb: 1 }}
            >
              {definition.name}
            </Typography>
            <Typography>{definition.description}</Typography>
          </Box>
        ))}
      </Box>
    </SectionContainer>
  );
};
