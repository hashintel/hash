import { ThemeProvider } from "@emotion/react";
import { Typography } from "@mui/material";
import { BlockComponent } from "blockprotocol/react";
import { Button } from "../../../../shared/ui";

export const EntityPropertiesBlock: BlockComponent = ({ theme, entityId }) => {
  return (
    <ThemeProvider theme={theme ?? {}}>
      <Button variant="primary" size="small">
        styled button inside a block
      </Button>
      <Typography>entityId: {entityId}</Typography>
    </ThemeProvider>
  );
};
