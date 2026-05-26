import {
  Box,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  Stack,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";

import { ChevronDownRegularIcon } from "../../../../shared/icons/chevron-down-regular-icon";

import type { FunctionComponent, ReactNode } from "react";

export const FilterPill: FunctionComponent<{
  label: string;
  valueSummary: string;
  children: (close: () => void) => ReactNode;
  onRemove?: () => void;
  isActive?: boolean;
}> = ({ label, valueSummary, children, onRemove, isActive }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((prev) => !prev)}
        sx={({ palette, transitions }) => ({
          alignItems: "center",
          background: isActive ? palette.blue[20] : palette.common.white,
          border: `1px solid ${isActive ? palette.blue[40] : palette.gray[30]}`,
          borderRadius: 16,
          color: isActive ? palette.blue[80] : palette.gray[80],
          cursor: "pointer",
          display: "inline-flex",
          fontSize: 13,
          gap: 0.75,
          height: 28,
          px: 1.25,
          transition: transitions.create(["background", "border-color"]),
          "&:hover": {
            background: isActive ? palette.blue[30] : palette.gray[10],
          },
        })}
      >
        <Typography
          component="span"
          sx={{
            color: ({ palette }) =>
              isActive ? palette.blue[70] : palette.gray[60],
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {label}
        </Typography>
        <Typography
          component="span"
          sx={{ fontSize: 13, fontWeight: 600 }}
        >
          {valueSummary}
        </Typography>
        <ChevronDownRegularIcon sx={{ fontSize: 12 }} />
        {onRemove && (
          <Box
            component="span"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            sx={({ palette }) => ({
              alignItems: "center",
              borderRadius: "50%",
              color: palette.gray[60],
              cursor: "pointer",
              display: "inline-flex",
              fontSize: 12,
              height: 16,
              justifyContent: "center",
              lineHeight: 1,
              ml: 0.25,
              width: 16,
              "&:hover": {
                background: palette.gray[20],
                color: palette.gray[80],
              },
            })}
          >
            ×
          </Box>
        )}
      </Box>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        transition
        sx={{ zIndex: 1300 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={150}>
            <Box sx={{ mt: 0.5 }}>
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <Paper
                  sx={({ palette }) => ({
                    border: `1px solid ${palette.gray[30]}`,
                    borderRadius: 1,
                    boxShadow: "0px 4px 16px rgba(0,0,0,0.08)",
                    minWidth: 240,
                    overflow: "hidden",
                  })}
                >
                  <Stack>{children(() => setOpen(false))}</Stack>
                </Paper>
              </ClickAwayListener>
            </Box>
          </Fade>
        )}
      </Popper>
    </>
  );
};
