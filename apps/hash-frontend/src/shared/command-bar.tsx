import { TextField } from "@hashintel/design-system";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  Modal,
  Paper,
} from "@mui/material";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { HTMLAttributes } from "react";
import { useKeys } from "rooks";

const CustomPaperComponent = ({
  children,
  ...props
}: HTMLAttributes<HTMLElement>) => (
  <Paper
    {...props}
    sx={{
      [`.${autocompleteClasses.listbox}`]: {
        height: 461,
        maxHeight: "none",
      },
    }}
  >
    {children}
  </Paper>
);

export const CommandBar = () => {
  const popupState = usePopupState({
    popupId: "kbar",
    variant: "popover",
  });

  useKeys(["Meta", "k"], () => {
    popupState.toggle();
  });

  return (
    <Modal {...bindPopover(popupState)}>
      <Box
        width="100vw"
        height="100vh"
        display="flex"
        alignItems="center"
        margin="0 auto"
      >
        <Box
          height={518}
          maxWidth={560}
          width="100vw"
          display="flex"
          justifyContent="center"
          margin="0 auto"
        >
          <Autocomplete
            options={[
              {
                group: "Blocks",
                label: "Find a block…",
              },
              {
                group: "Blocks",
                label: "Generate new block with AI…",
              },
              {
                group: "Entities",
                label: "Search for an entity…",
              },
              {
                group: "Entities",
                label: "Insert a link to an entity…",
              },
              {
                group: "Entities",
                label: "Create new entity…",
              },
              {
                group: "Types",
                label: "Create new type…",
              },
              {
                group: "Apps",
                label: "Find an app…",
              },
              {
                group: "Apps",
                label: "Create an app…",
              },
              {
                group: "Apps",
                label: "Generate new app…",
              },
            ]}
            open
            onClose={() => popupState.close()}
            sx={{ width: "100%" }}
            renderInput={(props) => (
              <TextField
                onBlur={() => popupState.close()}
                autoFocus
                {...props}
              />
            )}
            onChange={(_, __, reason) => {
              if (reason === "selectOption") {
                popupState.close();
              }
            }}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            PaperComponent={CustomPaperComponent}
          />
        </Box>
      </Box>
    </Modal>
  );
};
