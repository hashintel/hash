import type { VersionedUrl } from "@blockprotocol/type-system";
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
import { useEffect, useRef, useState } from "react";

import { MenuItem } from "../../../shared/ui";

export type ConversionTargetsByColumnKey = Record<
  string,
  {
    title: string;
    dataTypeId: VersionedUrl;
    guessedAsCanonical?: boolean;
  }[]
>;

export const ConversionMenu = ({
  activeConversion,
  columnKey,
  conversionTargetsByColumnKey,
  onClose,
  onSelectConversionTarget,
  open,
  ...popoverProps
}: {
  activeConversion: { dataTypeId: VersionedUrl; title: string } | null;
  columnKey?: string;
  conversionTargetsByColumnKey?: ConversionTargetsByColumnKey;
  onClose: () => void;
  onSelectConversionTarget: (dataTypeId: VersionedUrl | null) => void;
} & PopperProps) => {
  if (!conversionTargetsByColumnKey) {
    throw new Error(
      "Conversion menu requires column key and conversion targets",
    );
  }

  if (columnKey && !conversionTargetsByColumnKey[columnKey]) {
    throw new Error("Conversion targets not found for column key");
  }

  const selectRef = useRef<HTMLSelectElement>(null);
  const [selectOpen, setSelectOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeout(() => setSelectOpen(true), 0);
    }
  }, [open]);

  const activeConversionInTargets =
    columnKey &&
    conversionTargetsByColumnKey[columnKey]?.find(
      (target) => target.dataTypeId === activeConversion?.dataTypeId,
    );

  return (
    <Popper open={open} {...popoverProps}>
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} timeout={350}>
          <Box
            sx={{
              marginTop: 3,
              marginLeft: -3,
              position: "absolute",
            }}
          >
            <ClickAwayListener
              onClickAway={() => {
                if (!selectOpen) {
                  onClose();
                }
              }}
            >
              <Paper sx={{ padding: 0.25 }}>
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
                    Normalize
                  </Typography>
                </Stack>
                <Select
                  MenuProps={{
                    anchorEl: selectRef.current,
                    anchorOrigin: {
                      vertical: "bottom",
                      horizontal: "left",
                    },
                    transformOrigin: {
                      vertical: "top",
                      horizontal: "left",
                    },
                  }}
                  open={selectOpen}
                  onClose={() => {
                    setSelectOpen(false);
                    onClose();
                  }}
                  onChange={(event) => {
                    const value = event.target.value
                      ? (event.target.value as VersionedUrl)
                      : null;

                    onSelectConversionTarget(value);
                    onClose();
                  }}
                  displayEmpty
                  renderValue={() => (
                    <Typography
                      sx={{
                        fontSize: 14,
                        color: "gray.50",
                      }}
                    >
                      Show values as...
                    </Typography>
                  )}
                  ref={selectRef}
                  sx={{ width: 200, mx: 1.5, mb: 1 }}
                  value={activeConversion?.dataTypeId ?? ""}
                >
                  {activeConversion && (
                    <MenuItem
                      value={undefined}
                      sx={{ color: ({ palette }) => palette.red[70] }}
                    >
                      Show original values
                    </MenuItem>
                  )}
                  {/*
                    If the active conversion is not in the targets already,
                    we need to insert it to show the user the selected conversion.
                  */}
                  {activeConversion && !activeConversionInTargets && (
                    <MenuItem disabled value={activeConversion.dataTypeId}>
                      {activeConversion.title}
                    </MenuItem>
                  )}
                  {columnKey &&
                    conversionTargetsByColumnKey[columnKey]?.map(
                      (target: { dataTypeId: VersionedUrl; title: string }) => (
                        <MenuItem
                          key={target.dataTypeId}
                          value={target.dataTypeId}
                        >
                          {target.title}
                        </MenuItem>
                      ),
                    )}
                </Select>
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
