import { TextField } from "@hashintel/design-system";
import { Autocomplete, Box, Modal } from "@mui/material";
import { bindPopover, usePopupState } from "material-ui-popup-state/hooks";
import { useKeys } from "rooks";

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
        maxWidth={560}
        width="100vw"
        height="100vh"
        display="flex"
        alignItems="center"
        margin="0 auto"
      >
        <Autocomplete
          options={[]}
          openOnFocus
          sx={{ width: "100%" }}
          renderInput={(props) => (
            <TextField onBlur={() => popupState.close()} autoFocus {...props} />
          )}
        />
      </Box>
    </Modal>
  );
};
