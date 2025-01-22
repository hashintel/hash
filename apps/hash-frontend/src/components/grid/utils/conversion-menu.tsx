import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Select } from "@hashintel/design-system";
import {
  Box,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  type PopperProps,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef } from "react";

import { MenuItem } from "../../../shared/ui";

export type ConversionTargetsByColumnKey = Record<
  string,
  { title: string; dataTypeId: VersionedUrl }[]
>;

export const ConversionMenu = ({
  columnKey,
  conversionTargetsByColumnKey,
  onClose,
  onSelectConversionTarget,
  open,
  ...popoverProps
}: {
  columnKey?: string;
  conversionTargetsByColumnKey?: ConversionTargetsByColumnKey;
  onClose: () => void;
  onSelectConversionTarget: (dataTypeId: VersionedUrl) => void;
} & PopperProps) => {
  if (!conversionTargetsByColumnKey) {
    throw new Error(
      "Conversion menu requires column key and conversion targets",
    );
  }

  if (columnKey && !conversionTargetsByColumnKey[columnKey]) {
    throw new Error("Conversion targets not found for column key");
  }

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (wrapper) {
      const onMouseMove = (event: MouseEvent) => {
        event.stopPropagation();
      };

      wrapper.addEventListener("mousemove", onMouseMove);

      return () => {
        wrapper.removeEventListener("mousemove", onMouseMove);
      };
    }
  }, [wrapperRef]);

  console.log("Conversion menu open", open);

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
                  console.log("Click away");
                  onClose();
                }
              }}
            >
              <Paper ref={wrapperRef} sx={{ padding: 0.25 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  mt={1}
                  mx={1.5}
                  mb={0.5}
                >
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[50],
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      py: 0.5,
                    }}
                  >
                    Convert values to
                  </Typography>
                </Stack>
                <Select
                  onChange={(event) => {
                    onSelectConversionTarget(
                      event.target.value as VersionedUrl,
                    );
                  }}
                >
                  {conversionTargetsByColumnKey[columnKey].map((target) => (
                    <MenuItem key={target.dataTypeId} value={target.dataTypeId}>
                      {target.title}
                    </MenuItem>
                  ))}
                </Select>
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
