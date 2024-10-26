import {
  type PopperProps,
  Stack,
  type SxProps,
  type Theme,
} from "@mui/material";
import {
  Box,
  Checkbox,
  ClickAwayListener,
  Fade,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { MenuItem } from "../../../shared/ui";
import type { ColumnFilter } from "./filtering";

const blueFilterButtonSx: SxProps<Theme> = ({ palette, transitions }) => ({
  background: "transparent",
  border: "none",
  borderRadius: 1,
  cursor: "pointer",
  px: 1,
  py: 0.5,
  "& > span": {
    color: palette.blue[70],
    fontSize: 12,
  },
  "&:hover": {
    background: palette.blue[20],
  },
  transition: transitions.create("background"),
});

export const ColumnFilterMenu: FunctionComponent<
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columnFilter?: ColumnFilter<string, any>;
    onClose: () => void;
  } & PopperProps
> = ({ columnFilter, onClose, open, ...popoverProps }) => {
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

  const [previousColumnFilter, setPreviousColumnFilter] =
    useState<ColumnFilter<string>>();

  if (
    columnFilter &&
    (!previousColumnFilter ||
      previousColumnFilter.columnKey !== columnFilter.columnKey)
  ) {
    setPreviousColumnFilter(columnFilter);
  }

  const { filterItems, selectedFilterItemIds, setSelectedFilterItemIds } =
    columnFilter ?? previousColumnFilter ?? {};

  const isFiltered = useMemo(
    () =>
      filterItems?.some((item) => !selectedFilterItemIds?.includes(item.id)),
    [filterItems, selectedFilterItemIds],
  );

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
              <Paper
                ref={wrapperRef}
                sx={{ padding: 0.25, maxHeight: 350, overflowY: "scroll" }}
              >
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
                    Filter
                  </Typography>
                  {isFiltered && (
                    <Box
                      component="button"
                      onClick={() => {
                        setSelectedFilterItemIds?.(
                          filterItems?.map((item) => item.id) ?? [],
                        );
                        onClose();
                      }}
                      sx={blueFilterButtonSx}
                    >
                      <Typography component="span">Reset</Typography>
                    </Box>
                  )}
                </Stack>
                {filterItems
                  ?.sort((a, b) => a.label.localeCompare(b.label))
                  .map(({ id, label, count }) => {
                    const checked = selectedFilterItemIds?.includes(id);

                    const text =
                      count !== undefined
                        ? `${label} (${formatNumber(count)})`
                        : label;

                    return (
                      <MenuItem
                        key={id}
                        onClick={() =>
                          setSelectedFilterItemIds?.(
                            checked
                              ? (selectedFilterItemIds?.filter(
                                  (selectedId) => selectedId !== id,
                                ) ?? [])
                              : [...(selectedFilterItemIds ?? []), id],
                          )
                        }
                        sx={{
                          justifyContent: "space-between",
                          py: 0.6,
                          "&:hover > button": { visibility: "visible" },
                          "&:focus": { boxShadow: "none" },
                        }}
                      >
                        <Stack direction="row" alignItems="center">
                          <ListItemIcon>
                            <Checkbox
                              sx={{
                                svg: {
                                  width: 18,
                                  height: 18,
                                },
                              }}
                              checked={checked}
                            />
                          </ListItemIcon>
                          <ListItemText primary={text} />
                        </Stack>
                        <Box
                          component="button"
                          onClick={(event) => {
                            setSelectedFilterItemIds?.([id]);
                            event.stopPropagation();
                          }}
                          sx={[blueFilterButtonSx, { visibility: "hidden" }]}
                        >
                          <Typography component="span">Only</Typography>
                        </Box>
                      </MenuItem>
                    );
                  })}
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
