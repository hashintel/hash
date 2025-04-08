import { Autocomplete } from "@hashintel/design-system";
import { Box, outlinedInputClasses } from "@mui/material";
import type { CSSProperties, ReactElement, ReactNode, RefObject } from "react";
import { createContext, forwardRef, useContext, useMemo } from "react";
import { VariableSizeList } from "react-window";

import { MenuItem } from "../../../../../shared/ui/menu-item";
import { useGraphContext } from "./graph-context";
import { GraphVizTooltip } from "./graph-viz-tooltip";

const Row = ({
  data,
  index,
  style,
}: {
  data: ReactNode[];
  index: number;
  style: CSSProperties;
}) => {
  const elem = data[index];
  return <Box style={style}>{elem}</Box>;
};

const OuterElementContext = createContext({});
const OuterElementType = forwardRef<HTMLDivElement>((props, ref) => {
  const outerProps = useContext(OuterElementContext);
  return <div ref={ref} {...props} {...outerProps} />;
});

export const VirtualizedList = forwardRef<
  HTMLDivElement,
  { children: ReactElement[]; rowheight: number }
>((props, ref) => {
  const itemCount = props.children.length;

  const outerProps = useMemo(() => {
    const { children: _children, ...rest } = props;
    return rest;
  }, [props]);

  return (
    <div ref={ref}>
      <OuterElementContext.Provider value={outerProps}>
        <VariableSizeList
          outerElementType={OuterElementType}
          className="List"
          height={400}
          itemCount={itemCount}
          itemSize={() => props.rowheight}
          overscanCount={5}
          itemData={{ ...props.children }}
          width={800}
        >
          {Row}
        </VariableSizeList>
      </OuterElementContext.Provider>
    </div>
  );
});

const VirtualizedListComp = forwardRef<
  HTMLDivElement,
  { children: ReactElement[] }
>((defaultProps, ref) => {
  return <VirtualizedList ref={ref} {...defaultProps} rowheight={36} />;
});

export const SimpleAutocomplete = <
  T extends {
    disabled?: boolean;
    label: string;
    valueForSelector: string;
  } & { [key: string]: string | number | boolean | string[] },
>({
  autoFocus,
  disabled,
  endAdornment,
  inputRef,
  placeholder,
  options,
  setValue,
  sortAlphabetically = true,
  suffixKey,
  value,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  endAdornment?: ReactNode;
  inputRef?: RefObject<HTMLDivElement | null>;
  placeholder: string;
  options: T[];
  sortAlphabetically?: boolean;
  suffixKey?: keyof T;
  setValue: (value: T | null) => void;
  value: T | null;
}) => {
  const listComponent = options.length > 200 ? VirtualizedListComp : undefined;

  const { graphContainerRef } = useGraphContext();

  return (
    <Autocomplete<T, false, false, false>
      autoFocus={!!autoFocus}
      componentsProps={{
        paper: {
          sx: {
            p: 0,
            maxWidth: "90vw",
            minWidth: "100%",
            width: "fit-content",
          },
        },
        popper: {
          container: graphContainerRef.current,
          sx: {
            "& > div:first-of-type": {
              boxShadow: "none",
            },
          },
        },
      }}
      disabled={!!disabled || options.length === 0}
      getOptionDisabled={(option) => !!option.disabled}
      inputHeight="auto"
      inputProps={{
        endAdornment: endAdornment ?? <div />,
        placeholder,
        sx: () => ({
          height: "auto",
          [`&.${outlinedInputClasses.root}`]: {
            py: 0.3,
            px: "8px !important",

            input: {
              fontSize: 14,
            },
          },
        }),
      }}
      inputRef={inputRef}
      isOptionEqualToValue={(option, selectedValue) =>
        option.valueForSelector === selectedValue.valueForSelector
      }
      // @ts-expect-error -- mismatch with expected children.
      ListboxComponent={listComponent}
      ListboxProps={{
        sx: {
          maxHeight: 240,
        },
      }}
      onChange={(_event, option) => {
        setValue(option);
      }}
      options={
        sortAlphabetically
          ? options.sort((a, b) => a.label.localeCompare(b.label))
          : options
      }
      renderOption={({ key: _, ...props }, option) => {
        const label =
          option.label +
          (suffixKey && option[suffixKey] ? ` ${option[suffixKey]}` : "");

        const regex = /(\[[0-9]+]|\([0-9]+\)|\(None\)|\[None]|[^[\]()]+)/g;

        const parts = label.match(regex);

        const structuredParts = (parts ?? [label]).map((part) => {
          if (
            (part.startsWith("[") && part.endsWith("]")) ||
            (part.startsWith("(") && part.endsWith(")"))
          ) {
            return {
              part,
              isCount: true,
            };
          }
          return {
            part,
            isCount: false,
          };
        });

        return (
          <GraphVizTooltip
            key={option.valueForSelector}
            title={listComponent ? label : ""}
          >
            <MenuItem
              {...props}
              sx={{
                "&:active": {
                  color: "inherit",
                },
                boxShadow: "none !important",
              }}
              value={option.valueForSelector}
            >
              {structuredParts.map(({ part, isCount }, index) => (
                <Box
                  component="span"
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  sx={{
                    color: ({ palette }) =>
                      isCount ? palette.gray[50] : palette.common.black,
                    mr: isCount && index === 0 ? 0.5 : 0,
                    ml: isCount ? 0.5 : 0,
                  }}
                >
                  {part}
                </Box>
              ))}
            </MenuItem>
          </GraphVizTooltip>
        );
      }}
      value={value}
    />
  );
};
