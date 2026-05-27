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

import { isBaseUrl } from "@blockprotocol/type-system";

import { ArrowDownAZRegularIcon } from "../../../../shared/icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../../shared/icons/arrow-up-a-z-regular-icon";
import { ChevronDownRegularIcon } from "../../../../shared/icons/chevron-down-regular-icon";
import { MenuItem } from "../../../../shared/ui";

import type { GridSort } from "../../../../components/grid/grid";
import type { SortableEntitiesTableColumnKey } from "../types";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

const baseColumnLabels: Partial<
  Record<Exclude<SortableEntitiesTableColumnKey, BaseUrl>, string>
> = {
  entityLabel: "Name",
  entityTypes: "Type",
  lastEdited: "Last edited",
  created: "Created",
  archived: "Archived",
};

const labelFor = (
  key: SortableEntitiesTableColumnKey,
  propertyLabels: Record<BaseUrl, string>,
): string => {
  if (isBaseUrl(key)) {
    return propertyLabels[key] ?? key;
  }
  return baseColumnLabels[key] ?? key;
};

export const SortControl: FunctionComponent<{
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
  sortableKeys: SortableEntitiesTableColumnKey[];
  propertyLabels: Record<BaseUrl, string>;
}> = ({ sort, setSort, sortableKeys, propertyLabels }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const currentLabel = labelFor(sort.columnKey, propertyLabels);

  const DirectionIcon =
    sort.direction === "asc" ? ArrowDownAZRegularIcon : ArrowUpZARegularIcon;

  const toggleDirection = (event: React.MouseEvent) => {
    event.stopPropagation();
    setSort({
      columnKey: sort.columnKey,
      direction: sort.direction === "asc" ? "desc" : "asc",
    });
  };

  return (
    <>
      <Box
        component="button"
        type="button"
        ref={anchorRef}
        onClick={() => setOpen((prev) => !prev)}
        sx={({ palette }) => ({
          alignItems: "center",
          background: palette.common.white,
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 1.5,
          color: palette.gray[80],
          cursor: "pointer",
          display: "inline-flex",
          fontSize: 13,
          gap: 0.75,
          height: 28,
          px: 1.25,
        })}
      >
        <Typography
          component="span"
          sx={{
            color: ({ palette }) => palette.gray[60],
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Sort by
        </Typography>
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
          {currentLabel}
        </Typography>
        <Box
          component="span"
          onClick={toggleDirection}
          sx={({ palette }) => ({
            alignItems: "center",
            borderRadius: "50%",
            cursor: "pointer",
            display: "inline-flex",
            height: 18,
            justifyContent: "center",
            width: 18,
            "&:hover": { background: palette.gray[20] },
          })}
        >
          <DirectionIcon sx={{ fontSize: 12 }} />
        </Box>
        <ChevronDownRegularIcon sx={{ fontSize: 12 }} />
      </Box>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
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
                    minWidth: 200,
                  })}
                >
                  <Stack sx={{ py: 0.5, maxHeight: 320, overflowY: "auto" }}>
                    {sortableKeys.map((key) => (
                      <MenuItem
                        key={key}
                        selected={key === sort.columnKey}
                        onClick={() => {
                          setSort({
                            columnKey: key,
                            direction: sort.direction,
                          });
                          setOpen(false);
                        }}
                        sx={{ fontSize: 13, py: 0.5 }}
                      >
                        {labelFor(key, propertyLabels)}
                      </MenuItem>
                    ))}
                  </Stack>
                </Paper>
              </ClickAwayListener>
            </Box>
          </Fade>
        )}
      </Popper>
    </>
  );
};
