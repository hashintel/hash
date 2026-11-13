import { Alert } from "@mui/material";

import { Button } from "../../shared/ui/button";
import { useDataTypesContext } from "./data-types-context";

export const DataTypesLoadError = () => {
  const { refetch } = useDataTypesContext();

  return (
    <Alert
      severity="error"
      action={
        <Button
          size="small"
          variant="tertiary_quiet"
          onClick={() => {
            void refetch();
          }}
          sx={{ color: "inherit" }}
        >
          Retry
        </Button>
      }
    >
      Could not load data types.
    </Alert>
  );
};
