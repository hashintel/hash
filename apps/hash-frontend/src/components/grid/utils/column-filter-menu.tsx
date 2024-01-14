import {
  Box,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  PopperProps,
  Typography,
} from "@mui/material";
import { FunctionComponent } from "react";

import { ColumnFilter } from "./filtering";

export const ColumnFilterMenu: FunctionComponent<
  {
    columnFilter?: ColumnFilter<string>;
    onClose: () => void;
  } & PopperProps
> = ({ onClose, open, ...popoverProps }) => {
  return (
    <Popper open={open} {...popoverProps}>
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} timeout={350}>
          <Box
            sx={{
              marginTop: 3,
              marginLeft: -3,
            }}
          >
            <ClickAwayListener
              onClickAway={() => {
                if (open) {
                  onClose();
                }
              }}
            >
              <Paper>
                <Typography sx={{ p: 2 }}>
                  The content of the Popper.
                </Typography>
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
