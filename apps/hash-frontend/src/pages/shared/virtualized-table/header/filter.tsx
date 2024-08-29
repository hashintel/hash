import { IconButton } from "@hashintel/design-system";
import type { FormControlLabelProps } from "@mui/material";
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import type { RefObject } from "react";
import { useRef, useState } from "react";

import { FilterLightIcon } from "../../../../shared/icons/filter-light-icon";

export const missingValueString = `missing-filter-property-value-${Math.random()}`;

type VirtualizedTableFilterOption = {
  label: string;
  value: string | null;
  count: number;
};

export type VirtualizedTableFilter = {
  header: string;
  options: {
    [value: string]: VirtualizedTableFilterOption;
  };
} & (
  | {
      type: "radio-group";
      initialValue: string;
      value: string;
    }
  | {
      type: "checkboxes";
      initialValue: Set<string | null>;
      value: Set<string | null>;
    }
);

const createLabelSlotProps = (
  valueIsMissing: boolean,
): FormControlLabelProps["slotProps"] => ({
  typography: {
    color: ({ palette }) =>
      valueIsMissing ? palette.gray[60] : palette.gray[80],
    fontSize: 14,
    fontWeight: valueIsMissing ? 400 : 500,
  },
});

const labelSx: FormControlLabelProps["sx"] = {
  borderRadius: 1,
  marginRight: 0,
  marginLeft: 0.3,
  py: 1,
  px: 1.4,
  "&:hover": {
    background: ({ palette }) => palette.gray[20],
  },
};

const FilterPopover = <Filter extends VirtualizedTableFilter>({
  buttonRef,
  filter,
  setFilter,
  open,
  onClose,
}: {
  buttonRef: RefObject<HTMLElement>;
  filter: Filter;
  setFilter: (filter: Filter) => void;
  open: boolean;
  onClose: () => void;
}) => {
  const { header, options, type, value: currentValue } = filter;

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
            maxWidth: 400,
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
        <Typography
          component="div"
          variant="smallCaps"
          sx={({ palette }) => ({
            color: palette.gray[50],
            mb: 1,
            lineHeight: 1,
            px: 1.4,
          })}
        >
          {header}
        </Typography>
        {/* if the filter 'type' is checkboxes, do MUI checkboxes. otherwise, do MUI radio group  */}

        {type === "checkboxes" ? (
          <Stack>
            <FormControl>
              {Object.values(options)
                .sort((a, b) => a.label.localeCompare(b.label))
                .map(({ label, value, count }) => (
                  <FormControlLabel
                    key={value}
                    control={
                      <Checkbox
                        onChange={(event) => {
                          const newValue = new Set(currentValue);
                          if (event.target.checked) {
                            newValue.add(value);
                          } else {
                            newValue.delete(value);
                          }
                          setFilter({ ...filter, value: newValue });
                        }}
                        checked={currentValue.has(value)}
                        sx={{ mr: 1.5, "& .MuiSvgIcon-root": { fontSize: 18 } }}
                      />
                    }
                    label={`${label} (${count})`}
                    slotProps={createLabelSlotProps(value === null)}
                    sx={labelSx}
                  />
                ))}
            </FormControl>
          </Stack>
        ) : (
          <Stack>
            <FormControl>
              <RadioGroup
                value={currentValue}
                onChange={(event) => {
                  setFilter({ ...filter, value: event.target.value });
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
          </Stack>
        )}
      </Box>
    </Popover>
  );
};

export type VirtualizedTableFiltersByFieldId<Id extends string = string> =
  Record<Id, VirtualizedTableFilter>;

export type TableFilterProps<
  Filters extends
    VirtualizedTableFiltersByFieldId = VirtualizedTableFiltersByFieldId,
> = {
  filters: Filters;
  setFilters: (filters: Filters) => void;
};

export const isFilterValueIncluded = (
  value: string | null,
  filter: VirtualizedTableFilter,
) => {
  if (filter.type === "radio-group") {
    return value === filter.value;
  }
  return filter.value.has(value);
};

export const FilterButton = <Filters extends VirtualizedTableFiltersByFieldId>({
  columnId,
  filters,
  setFilters,
}: {
  columnId: NonNullable<keyof Filters>;
} & TableFilterProps<Filters>) => {
  const filter = filters[columnId];

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showFilterPopover, setShowFilterPopover] = useState(false);

  if (!filter || Object.keys(filter.options).length < 2) {
    return null;
  }

  const { type, initialValue, value } = filter;

  const isFiltered =
    type === "radio-group"
      ? value !== initialValue
      : initialValue.difference(value).size > 0;

  return (
    <>
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
      <FilterPopover
        buttonRef={buttonRef}
        filter={filter}
        setFilter={(newFilter) =>
          setFilters({ ...filters, [columnId]: newFilter })
        }
        open={showFilterPopover}
        onClose={() => setShowFilterPopover(false)}
      />
    </>
  );
};
