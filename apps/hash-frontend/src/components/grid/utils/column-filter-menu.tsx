import { TextField } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import {
  Box,
  Checkbox,
  ClickAwayListener,
  Fade,
  ListItemIcon,
  ListItemText,
  outlinedInputClasses,
  Paper,
  Popper,
  type PopperProps,
  Stack,
  type SxProps,
  type Theme,
  Typography,
} from "@mui/material";
import type { CSSProperties } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList } from "react-window";

import { MenuItem } from "../../../shared/ui";
import type { GridRow } from "../grid";
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

type FilterItemData = {
  id: string;
  doesNotApplyValue?: boolean;
  label: string;
  count?: number;
  labelSuffix?: string;
  checked: boolean;
};

type FilterItemDataProp = {
  closeMenu: () => void;
  items: FilterItemData[];
  selectedFilterItemIds: Set<string> | undefined;
  setSelectedFilterItemIds:
    | ((selectedFilterItemIds: Set<string>) => void)
    | undefined;
};

const FilterItem = memo(
  ({
    data,
    index,
    style,
  }: {
    data: FilterItemDataProp;
    index: number;
    style: CSSProperties;
  }) => {
    const {
      closeMenu,
      items,
      selectedFilterItemIds,
      setSelectedFilterItemIds,
    } = data;

    const item = items[index]!;
    const { id, count, doesNotApplyValue, label, labelSuffix, checked } = item;

    return (
      <Box style={style}>
        <MenuItem
          key={id}
          onClick={() =>
            setSelectedFilterItemIds?.(
              checked
                ? new Set(
                    [...(selectedFilterItemIds ?? [])].filter(
                      (selectedId) => selectedId !== id,
                    ),
                  )
                : new Set([...(selectedFilterItemIds ?? []), id]),
            )
          }
          sx={{
            display: "flex",
            justifyContent: "space-between",
            py: 0.6,
            "&:hover > button": { visibility: "visible" },
            "&:focus": { boxShadow: "none" },
            "&:active": {
              color: "inherit",
            },
            maxWidth: "100%",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            sx={{ maxWidth: "calc(100% - 30px)" }}
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
            <ListItemText
              primary={
                <Stack direction="row" alignItems="center">
                  <Box component="span">{label}</Box>
                  {labelSuffix && (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.5,
                        color: ({ palette }) => palette.gray[40],
                      }}
                    >
                      {labelSuffix}
                    </Box>
                  )}
                  {count !== undefined && (
                    <Box
                      component="span"
                      sx={{ ml: 0.5, color: ({ palette }) => palette.gray[60] }}
                    >
                      ({formatNumber(count)})
                    </Box>
                  )}
                </Stack>
              }
              primaryTypographyProps={
                doesNotApplyValue
                  ? {
                      sx: {
                        color: ({ palette }) =>
                          `${palette.gray[60]} !important`,
                      },
                    }
                  : {}
              }
              sx={{
                "& span": {
                  display: "block",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                },
              }}
            />
          </Stack>
          <Box
            component="button"
            onClick={(event) => {
              setSelectedFilterItemIds?.(new Set([id]));
              event.stopPropagation();
              closeMenu();
            }}
            sx={[blueFilterButtonSx, { visibility: "hidden" }]}
          >
            <Typography component="span">Only</Typography>
          </Box>
        </MenuItem>
      </Box>
    );
  },
);

export const ColumnFilterMenu = <R extends GridRow>({
  columnFilter,
  onClose,
  open,
  ...popoverProps
}: {
  columnFilter?: ColumnFilter<string, R>;
  onClose: () => void;
} & PopperProps) => {
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
    useState<ColumnFilter<string, R>>();

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
    () => filterItems?.some((item) => !selectedFilterItemIds?.has(item.id)),
    [filterItems, selectedFilterItemIds],
  );

  const [searchText, setSearchText] = useState("");

  const filterItemsData = useMemo<{
    closeMenu: () => void;
    items: FilterItemData[];
    selectedFilterItemIds: Set<string> | undefined;
    setSelectedFilterItemIds:
      | ((selectedFilterItemIds: Set<string>) => void)
      | undefined;
  }>(() => {
    const filteredItems: FilterItemData[] = [];

    const lowerCasedSearchText = searchText.toLowerCase().trim();

    for (const item of filterItems ?? []) {
      if (
        searchText &&
        !item.label.toLowerCase().includes(lowerCasedSearchText)
      ) {
        continue;
      }

      const { id, doesNotApplyValue, label, count, labelSuffix } = item;

      const checked = !!selectedFilterItemIds?.has(id);

      filteredItems.push({
        id,
        doesNotApplyValue,
        label,
        count,
        labelSuffix,
        checked,
      });
    }

    const sortedItems = filteredItems.sort((a, b) => {
      if (a.doesNotApplyValue && !b.doesNotApplyValue) {
        return -1;
      }
      if (!a.doesNotApplyValue && b.doesNotApplyValue) {
        return 1;
      }

      if (
        searchText &&
        a.label.toLowerCase().startsWith(lowerCasedSearchText) &&
        !b.label.toLowerCase().startsWith(lowerCasedSearchText)
      ) {
        return -1;
      }
      if (
        searchText &&
        !a.label.toLowerCase().startsWith(lowerCasedSearchText) &&
        b.label.toLowerCase().startsWith(lowerCasedSearchText)
      ) {
        return 1;
      }

      return a.label.localeCompare(b.label);
    });

    return {
      closeMenu: onClose,
      items: sortedItems,
      selectedFilterItemIds,
      setSelectedFilterItemIds,
    };
  }, [
    filterItems,
    onClose,
    searchText,
    selectedFilterItemIds,
    setSelectedFilterItemIds,
  ]);

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
                          new Set(filterItems?.map((item) => item.id) ?? []),
                        );
                        onClose();
                      }}
                      sx={blueFilterButtonSx}
                    >
                      <Typography component="span">Reset</Typography>
                    </Box>
                  )}
                </Stack>
                {(filterItems ?? []).length > 20 && (
                  <TextField
                    autoFocus
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Find items..."
                    sx={{
                      width: "80%",
                      mx: 1.4,
                      mb: 1,
                      [`.${outlinedInputClasses.root} input`]: {
                        fontSize: 13,
                        py: 0.5,
                        px: 1.5,
                      },
                    }}
                  />
                )}
                {filterItemsData.items.length ? (
                  <FixedSizeList
                    height={
                      filterItemsData.items.length > 10
                        ? 350
                        : filterItemsData.items.length * 35 + 10
                    }
                    itemCount={filterItemsData.items.length}
                    itemData={filterItemsData}
                    itemSize={35}
                    overscanCount={10}
                    width={380}
                  >
                    {FilterItem}
                  </FixedSizeList>
                ) : (
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[70],
                      fontSize: 12,
                      px: 1.5,
                      pb: 1,
                    }}
                  >
                    No options found{searchText ? " for your search" : ""}
                  </Typography>
                )}
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
