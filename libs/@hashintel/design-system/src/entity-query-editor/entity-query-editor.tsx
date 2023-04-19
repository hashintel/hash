import { QueryEntitiesData } from "@blockprotocol/graph";
import { Box, ThemeProvider } from "@mui/material";

import { fluidFontClassName } from "../fluid-fonts";
import { theme } from "../theme";

export interface EntityQueryEditorProps {
  defaultValue?: QueryEntitiesData;
  onSave: (query: QueryEntitiesData) => void;
  onClose: () => void;
}

export const EntityQueryEditor = ({
  onClose,
  onSave,
  defaultValue,
}: EntityQueryEditorProps) => {
  return (
    <ThemeProvider theme={theme}>
      <Box className={fluidFontClassName}>
        <h1>QUERY FOR ENTITIES</h1>
      </Box>
    </ThemeProvider>
  );
};
