import {
  Box,
  Checkbox,
  ClickAwayListener,
  Fade,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  PopperProps,
  Typography,
} from "@mui/material";
import { FunctionComponent, useEffect, useRef, useState } from "react";

import { MenuItem } from "../../../shared/ui";
import { ColumnFilter } from "./filtering";

export const ColumnFilterMenu: FunctionComponent<
  {
    columnFilter?: ColumnFilter<string>;
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
              <Paper ref={wrapperRef} sx={{ padding: 0.25 }}>
                <Typography
                  sx={{
                    marginTop: 1,
                    marginX: 1.5,
                    color: ({ palette }) => palette.gray[50],
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  Filter
                </Typography>
                {filterItems?.map(({ id, label }) => {
                  const checked = selectedFilterItemIds?.includes(id);

                  return (
                    <MenuItem
                      key={id}
                      onClick={() =>
                        setSelectedFilterItemIds?.(
                          checked
                            ? selectedFilterItemIds?.filter(
                                (selectedId) => selectedId !== id,
                              ) ?? []
                            : [...(selectedFilterItemIds ?? []), id],
                        )
                      }
                    >
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
                      <ListItemText primary={label} />
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
