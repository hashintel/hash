import { IconButton } from "@hashintel/design-system";
import type { FormControlLabelProps, SxProps, Theme } from "@mui/material";
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { RefObject } from "react";
import { useRef, useState } from "react";

import { FilterLightIcon } from "../../../../shared/icons/filter-light-icon";

export const missingValueString = `missing-filter-property-value-${Math.random()}`;

const ellipsisOverflow = {
  display: "block",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const createLabelSlotProps = (
  valueIsMissing: boolean,
): FormControlLabelProps["slotProps"] => ({
  typography: {
    color: ({ palette }) =>
      valueIsMissing ? palette.gray[60] : palette.gray[80],
    ...ellipsisOverflow,
    fontSize: 14,
    fontWeight: valueIsMissing ? 400 : 500,
  },
});

const labelSx: FormControlLabelProps["sx"] = {
  borderRadius: 1,
  maxWidth: "calc(100% - 44px)",
  marginRight: 0,
  marginLeft: 0.3,
  py: 1,
  px: 1.4,
  "&:hover": {
    background: ({ palette }) => palette.gray[20],
  },
};

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

type VirtualizedTableFilterOption = {
  label: string;
  value: string | null;
  count: number;
};

export type VirtualizedTableFilterValue = string | Set<string>;

export type VirtualizedTableFilterDefinition = {
  header: string;
  options: {
    [value: string]: VirtualizedTableFilterOption;
  };
} & (
  | {
      type: "radio-group";
      initialValue: string;
    }
  | {
      type: "checkboxes";
      initialValue: Set<string | null>;
    }
);

const FilterPopover = <Filter extends VirtualizedTableFilterDefinition>({
  buttonRef,
  isFiltered,
  filterDefinition,
  filterValue: currentValue,
  setFilter,
  open,
  onClose,
}: {
  buttonRef: RefObject<HTMLElement>;
  isFiltered: boolean;
  filterDefinition: Filter;
  filterValue: Filter["initialValue"];
  setFilter: (filter: Filter["initialValue"]) => void;
  open: boolean;
  onClose: () => void;
}) => {
  const { header, options, type, initialValue } = filterDefinition;

  return (
    <Popover
      id={buttonRef.current?.id}
      open={open}
      anchorEl={buttonRef.current}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: 0,
      }}
      slotProps={{
        paper: {
          sx: ({ boxShadows, palette }) => ({
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 2,
            boxShadow: boxShadows.xl,
            maxHeight: 200,
            maxWidth: 500,
          }),
        },
        root: {
          sx: {
            background: "none",
          },
        },
      }}
      transitionDuration={50}
    >
      <Box
        sx={({ boxShadows, palette }) => ({
          border: `1px solid. ${palette.gray[20]}`,
          borderRadius: 2,
          boxShadow: boxShadows.xl,
          py: 1.8,
          px: 0.4,
        })}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          px={1.4}
          mb={1}
        >
          <Typography
            component="div"
            variant="smallCaps"
            sx={({ palette }) => ({
              color: palette.gray[50],
              lineHeight: 1,
            })}
          >
            {header}
          </Typography>
          {isFiltered && (
            <Box
              component="button"
              onClick={() => {
                setFilter(
                  type === "checkboxes" ? new Set(initialValue) : initialValue,
                );
                onClose();
              }}
              sx={blueFilterButtonSx}
            >
              <Typography component="span">Reset</Typography>
            </Box>
          )}
        </Stack>
        {type === "checkboxes" ? (
          <FormControl sx={{ maxWidth: "100%" }}>
            {Object.values(options)
              .sort((a, b) => a.label.localeCompare(b.label))
              .map(({ label, value, count }) => (
                <Stack
                  key={value}
                  direction="row"
                  alignItems="center"
                  sx={{ "&:hover > button": { visibility: "visible" } }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        onChange={(event) => {
                          const newValue = new Set(currentValue);
                          if (event.target.checked) {
                            newValue.add(value);
                          } else {
                            newValue.delete(value);
                          }
                          setFilter(newValue);
                        }}
                        checked={(currentValue as Set<string | null>).has(
                          value,
                        )}
                        sx={{ mr: 1.5, "& .MuiSvgIcon-root": { fontSize: 18 } }}
                      />
                    }
                    label={`${label} (${count})`}
                    slotProps={createLabelSlotProps(value === null)}
                    sx={labelSx}
                  />
                  <Box
                    component="button"
                    onClick={() => {
                      setFilter(new Set([value]));
                      onClose();
                    }}
                    sx={[blueFilterButtonSx, { visibility: "hidden" }]}
                  >
                    <Typography component="span">Only</Typography>
                  </Box>
                </Stack>
              ))}
          </FormControl>
        ) : (
          <FormControl sx={{ maxWidth: "100%" }}>
            <RadioGroup
              value={currentValue}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            >
              {Object.values(options)
                .sort((a, b) => a.label.localeCompare(b.label))
                .map(({ label, value, count }) => (
                  <FormControlLabel
                    key={value}
                    value={value}
                    control={<Radio sx={{ mr: 1.5 }} />}
                    label={`${label} (${count})`}
                    slotProps={createLabelSlotProps(value === null)}
                    sx={labelSx}
                  />
                ))}
            </RadioGroup>
          </FormControl>
        )}
      </Box>
    </Popover>
  );
};

export type VirtualizedTableFilterDefinitionsByFieldId<
  Id extends string = string,
> = Record<Id, VirtualizedTableFilterDefinition | undefined>;

export type VirtualizedTableFilterValuesByFieldId<Id extends string = string> =
  Record<Id, VirtualizedTableFilterValue>;

export type TableFilterProps<FieldId extends string> = {
  filterDefinitions: VirtualizedTableFilterDefinitionsByFieldId<FieldId>;
  filterValues: VirtualizedTableFilterValuesByFieldId<FieldId>;
  setFilterValues: (
    filters: VirtualizedTableFilterValuesByFieldId<FieldId>,
  ) => void;
};

export const isValueIncludedInFilter = ({
  valueToCheck,
  currentValue,
}: {
  valueToCheck: string | null;
  currentValue: string | Set<string | null>;
}) => {
  if (typeof currentValue === "string") {
    return currentValue === valueToCheck;
  }

  return currentValue.has(valueToCheck);
};

export const FilterButton = <ColumnId extends string>({
  columnId,
  filterDefinitions,
  filterValues,
  setFilterValues,
}: {
  columnId: ColumnId;
} & TableFilterProps<ColumnId>) => {
  const filterDefinition = filterDefinitions[columnId];

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showFilterPopover, setShowFilterPopover] = useState(false);

  if (!filterDefinition) {
    return null;
  }

  const hasOnlyOneOption = Object.keys(filterDefinition.options).length < 2;

  const { type, initialValue } = filterDefinition;

  const filterValue = filterValues[columnId];

  let isFiltered;
  if (type === "radio-group") {
    isFiltered = filterValue !== initialValue;
  } else if (typeof filterValue === "string") {
    throw new Error(
      `Got string filterValue '${filterValue}, expected Set for checkboxes`,
    );
  } else {
    isFiltered = initialValue.difference(filterValue).size > 0;
  }

  return (
    <>
      <Tooltip
        title={hasOnlyOneOption ? "Only one filter option present" : ""}
        placement="top"
      >
        <IconButton
          onClick={() => setShowFilterPopover(!showFilterPopover)}
          ref={buttonRef}
          sx={{ p: 0.6, "& svg": { fontSize: 14 } }}
        >
          <FilterLightIcon
            sx={{
              fill: ({ palette }) =>
                isFiltered ? palette.blue[70] : palette.gray[50],
              transition: ({ transitions }) => transitions.create("fill"),
            }}
          />
        </IconButton>
      </Tooltip>
      <FilterPopover
        buttonRef={buttonRef}
        filterDefinition={filterDefinition}
        filterValue={filterValue}
        isFiltered={isFiltered}
        setFilter={(newFilter) =>
          setFilterValues({ ...filterValues, [columnId]: newFilter })
        }
        open={showFilterPopover}
        onClose={() => setShowFilterPopover(false)}
      />
    </>
  );
};
