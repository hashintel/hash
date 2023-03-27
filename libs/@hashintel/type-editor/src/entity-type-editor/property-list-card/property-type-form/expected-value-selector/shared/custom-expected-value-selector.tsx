import { faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  fluidFontClassName,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/design-system";
import {
  Autocomplete,
  autocompleteClasses,
  AutocompleteProps,
  Box,
  inputBaseClasses,
} from "@mui/material";
import { useRef, useState } from "react";

type CustomExpectedValueSelectorProps<T> = {
  inputLabel: string;
  collapsedWidth: number;
  options: Array<T>;
  onChange: AutocompleteProps<T, false, false, false>["onChange"];
  value: T[];
} & Partial<AutocompleteProps<T, true, false, false>>;

export const CustomExpectedValueSelector = <T extends any>({
  inputLabel,
  collapsedWidth,
  options,
  onChange,
  value,
  renderOption,
  ...props
}: CustomExpectedValueSelectorProps<T>) => {
  const [autocompleteElem, setAutocompleteElem] =
    useState<HTMLDivElement | null>(null);
  const textFieldRef = useRef<HTMLInputElement>(null);

  return (
    <Autocomplete
      {...props}
      ref={(ref: HTMLDivElement) => setAutocompleteElem(ref)}
      value={value}
      multiple
      popupIcon={null}
      clearIcon={null}
      forcePopupIcon={false}
      selectOnFocus={false}
      openOnFocus
      componentsProps={{
        popper: {
          sx: {
            [`.${autocompleteClasses.paper}`]: {
              width: autocompleteElem?.getBoundingClientRect().width,
            },
          },
          className: fluidFontClassName,
        },
      }}
      clearOnBlur={false}
      onChange={onChange}
      options={options}
      renderTags={() => <Box />}
      renderOption={renderOption}
      renderInput={({ InputProps, ...otherProps }) => {
        const expanded =
          textFieldRef.current === document.activeElement ||
          textFieldRef.current?.value;

        return (
          <TextField
            {...otherProps}
            InputProps={{
              ...InputProps,
              inputRef: textFieldRef,
              sx: ({ palette, transitions }) => ({
                height: 42,
                transition: transitions.create(["width", "background-color"]),
                padding: "0 16px !important",
                fill: palette.gray[50],

                [`.${inputBaseClasses.input}`]: {
                  fontSize: "14px !important",
                  p: "0 !important",
                  ...(!expanded ? { cursor: "pointer !important" } : {}),
                },

                ...(!expanded
                  ? {
                      width: collapsedWidth,
                      cursor: "pointer !important",
                      "&:hover": {
                        background: palette.gray[20],
                        fill: palette.gray[80],
                      },
                    }
                  : {}),

                "& ::placeholder": {
                  paddingLeft: 0,
                  transition: transitions.create(["padding-left", "color"]),
                  ...(!expanded
                    ? {
                        paddingLeft: 0.5,
                        color: `${palette.gray[80]} !important`,
                        fontWeight: 500,
                      }
                    : {}),
                },
              }),
              endAdornment: (
                <FontAwesomeIcon
                  icon={expanded ? faSearch : faPlus}
                  sx={{
                    fontSize: 14,
                    marginLeft: 1,
                    marginRight: 0.5,
                    fill: "inherit",
                  }}
                />
              ),
            }}
            placeholder={
              !expanded ? inputLabel : "Start typing to see more options..."
            }
          />
        );
      }}
    />
  );
};
