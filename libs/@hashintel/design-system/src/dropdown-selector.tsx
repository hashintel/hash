import {
  Box,
  inputBaseClasses,
  ListSubheader,
  menuItemClasses,
  outlinedInputClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import { ReactNode, useMemo, useState } from "react";

import { CaretDownIcon } from "./icons/caret-down";
import { CheckIcon } from "./icons/check";
import { MenuItem } from "./menu-item";
import { Select, SelectProps } from "./select";

export interface Option<OptionId extends string = string> {
  id: OptionId;
  icon: ReactNode;
  title: string;
  description: string;
  helperText?: string;
}

export interface OptionGroup<OptionId extends string = string> {
  name: string;
  options: Option<OptionId>[];
}

export interface GroupedOptions<OptionId extends string = string> {
  [key: string]: OptionGroup<OptionId>;
}

const getSelectorItems = (options: Option[], value: string) =>
  options.map(({ id, icon, title, helperText, description }) => {
    const active = id === value;
    return (
      <MenuItem
        key={id}
        value={id}
        sx={{
          display: "flex",
          mb: 1,
          gap: 1.5,
          [`&.${menuItemClasses.selected}`]: {
            background: "none",
          },
          [`&.${menuItemClasses.selected}:hover`]: {
            background: "rgba(7, 117, 227, 0.08)",
          },
        }}
      >
        <Box
          className="menu-item-icon"
          sx={({ palette }) => ({
            paddingX: 1.125,
            fontSize: 22,
            color: active ? palette.blue[70] : palette.gray[50],
            [`.${menuItemClasses.root}:hover &`]: {
              color: palette.blue[50],
            },
          })}
        >
          {active ? <CheckIcon /> : icon}
        </Box>

        <Box>
          <Box display="flex" gap={1} alignItems="center">
            <Typography
              className="menu-item-name"
              sx={({ palette }) => ({
                fontWeight: 500,
                fontSize: 14,
                lineHeight: "18px",
                color: active ? palette.blue[70] : palette.gray[90],
                [`.${menuItemClasses.root}:hover &`]: {
                  color: palette.blue[50],
                },
              })}
            >
              {title}
            </Typography>
            <Box
              sx={{
                width: "4px",
                height: "4px",
                background: ({ palette }) => palette.gray[30],
                borderRadius: "50%",
              }}
            />
            <Typography
              className="menu-item-id"
              sx={({ palette }) => ({
                fontWeight: 500,
                fontSize: 13,
                lineHeight: "18px",
                color: active ? palette.gray[70] : palette.gray[50],
                [`.${menuItemClasses.root}:hover &`]: {
                  color: palette.gray[70],
                },
              })}
            >
              {helperText}
            </Typography>
          </Box>
          <Typography
            className="menu-item-description"
            sx={({ palette }) => ({
              fontWeight: 500,
              fontSize: 13,
              lineHeight: "18px",
              color: active ? palette.common.black : palette.gray[70],
              whiteSpace: "break-spaces",
              [`.${menuItemClasses.root}:hover &`]: {
                color: palette.common.black,
              },
            })}
          >
            {description}
          </Typography>
        </Box>
      </MenuItem>
    );
  });

export type DropdownSelectorProps<OptionId extends string = string> = {
  value: OptionId;
  onChange?: (value: OptionId) => void;
  options: GroupedOptions | Option[];
  open: boolean;
  disabled?: boolean;
  sx?: SelectProps["sx"];
  onOpen: () => void;
  onClose: () => void;
  renderValue?: (
    selectedOption: Option,
    selectedGroup: OptionGroup | null,
  ) => JSX.Element;
};

export const DropdownSelector = <OptionId extends string = string>({
  options,
  value,
  open,
  disabled,
  onChange,
  renderValue,
  ...props
}: DropdownSelectorProps<OptionId>) => {
  const [selectRef, setSelectRef] = useState<HTMLSelectElement | null>(null);

  const [selectedModel, selectedGroup] = useMemo(() => {
    if (Array.isArray(options)) {
      const opts: Option[] = options;
      for (const option of opts) {
        if (option.id === value) {
          return [option, null];
        }
      }
    } else {
      const groups: OptionGroup[] = Object.values(options);
      for (const group of groups) {
        for (const groupOption of group.options) {
          if (groupOption.id === value) {
            return [groupOption, group];
          }
        }
      }
    }

    return [null, null];
  }, [options, value]);

  const paperProps = useMemo(() => {
    const inputWidth = selectRef?.offsetWidth ?? 0;
    const paperWidth = Math.max(inputWidth, 340);

    return {
      sx: {
        borderRadius: 1.5,
        boxSizing: "border-box",
        overflow: "hidden",
        width: paperWidth,
      },
    };
  }, [selectRef?.offsetWidth]);

  return (
    <Select
      {...props}
      open={open}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        onChange?.(event.target.value as OptionId);
      }}
      ref={(ref: HTMLSelectElement | null) => {
        if (ref) {
          setSelectRef(ref);
        }
      }}
      renderValue={() =>
        selectedModel && renderValue
          ? renderValue(selectedModel, selectedGroup)
          : selectedModel?.title
      }
      inputProps={{
        sx: {
          paddingY: 0,
          [`~.${outlinedInputClasses.notchedOutline}`]: {
            border: "none !important",
            boxShadow: "none !important",
            background: "none !important",
          },
          ...(open ? { background: "none !important" } : {}),
        },
      }}
      MenuProps={{
        PaperProps: paperProps,
        anchorOrigin: {
          vertical: "top",
          horizontal: "center",
        },
        MenuListProps: {
          sx: {
            padding: 0,
            py: 1,
          },
        },
      }}
      IconComponent={CaretDownIcon}
      sx={[
        {
          [`.${inputBaseClasses.root}`]: {
            background: "none !important",
            boxShadow: "none !important",
            [`& .${selectClasses.icon}`]: {
              fontSize: 13,
              color: ({ palette }) => palette.gray[40],
              opacity: disabled ? 0 : 1,
            },
          },
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    >
      {Array.isArray(options)
        ? getSelectorItems(options, value)
        : Object.values(options)
            .map(({ name: groupName, options: groupOptions }) => [
              <ListSubheader key={groupName}>
                <Typography
                  sx={{
                    fontWeight: 500,
                    fontSize: 12,
                    lineHeight: 1.3,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: ({ palette }) => palette.gray[50],
                    mb: 1,
                    pt: 2,
                    paddingBottom: 0,
                  }}
                >
                  {groupName}
                </Typography>
              </ListSubheader>,
              ...getSelectorItems(groupOptions, value),
            ])
            .flat()}
    </Select>
  );
};
