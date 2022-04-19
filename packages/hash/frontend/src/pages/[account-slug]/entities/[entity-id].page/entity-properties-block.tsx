import { ThemeProvider } from "@emotion/react";
/* eslint-disable-next-line -- no-restricted-imports */
import { Button, Typography } from "@mui/material";
import { BlockComponent } from "blockprotocol/react";

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
