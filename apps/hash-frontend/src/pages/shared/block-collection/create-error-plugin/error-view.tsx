import { Box, Dialog, Stack, Typography } from "@mui/material";

import { Button } from "../../../../shared/ui";

import type { FunctionComponent } from "react";

export type ErrorProps = { errored: boolean };

export const ErrorView: FunctionComponent<ErrorProps> = ({ errored }) => {
  return (
    <Dialog open={errored} maxWidth="md">
      <Box p={10} textAlign="center">
        <Typography variant="h1" mb={2}>
          Error with collaborative server
        </Typography>
        <Typography>
          The collaborative server has errored.{" "}
          <strong>Recent changes may not have been saved.</strong>
        </Typography>
        <Typography mb={4}>
          Please refresh to ensure no further work is lost.
        </Typography>
        <Stack direction="row" justifyContent="center">
          <Button size="large" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
};
