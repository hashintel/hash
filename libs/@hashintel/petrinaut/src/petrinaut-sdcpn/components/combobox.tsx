import { Combobox as ArkCombobox, useListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface ComboboxProps<T> {
  value: T | null;
  options: T[];
  onChange: (value: T) => void;
  getOptionLabel: (option: T) => string;
  getOptionKey: (option: T) => string;
  isOptionDisabled?: (option: T) => boolean;
  placeholder?: string;
  endAdornment?: ReactNode;
  maxWidth?: number;
}

export const Combobox = <T,>({
  value,
  options,
  onChange,
  getOptionLabel,
  getOptionKey,
  isOptionDisabled,
  placeholder,
  endAdornment,
  maxWidth = 300,
}: ComboboxProps<T>) => {
  const filterUtil = useFilter({ sensitivity: "base" });

  const { collection, filter: applyFilter } = useListCollection({
    initialItems: options,
    filter: (itemText: string, filterText: string) => filterUtil.contains(itemText, filterText),
    isItemDisabled: (item) => isOptionDisabled?.(item) ?? false,
    itemToString: getOptionLabel,
    itemToValue: (item) => getOptionKey(item),
  });

  return (
    <ArkCombobox.Root
      collection={collection}
      value={value ? [getOptionKey(value)] : []}
      onValueChange={(details) => {
        const selectedValue = details.value[0];
        if (selectedValue) {
          const selectedItem = options.find((opt) => getOptionKey(opt) === selectedValue);
          if (selectedItem) {
            onChange(selectedItem);
          }
        }
      }}
      onInputValueChange={(details) => {
        applyFilter(details.inputValue);
      }}
      positioning={{ sameWidth: true }}
    >
      <ArkCombobox.Control
        className={css({
          maxWidth: `[${maxWidth}px]`,
          position: "relative",
        })}
      >
        <ArkCombobox.Input
          placeholder={placeholder}
          className={css({
            width: "[100%]",
            padding: "spacing.3",
            paddingY: "[6px]",
            paddingRight: "spacing.8",
            borderRadius: "radius.4",
            border: "1px solid",
            borderColor: "core.gray.30",
            backgroundColor: "[white]",
            fontSize: "size.textsm",
            _focus: {
              outline: "none",
              borderColor: "core.blue.70",
            },
          })}
        />
        {endAdornment && (
          <div
            className={css({
              position: "absolute",
              right: "spacing.3",
              top: "[50%]",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              fontSize: "[14px]",
            })}
          >
            {endAdornment}
          </div>
        )}
      </ArkCombobox.Control>
      <Portal>
        <ArkCombobox.Positioner>
          <ArkCombobox.Content
            className={css({
              backgroundColor: "[white]",
              borderRadius: "radius.4",
              border: "1px solid",
              borderColor: "core.gray.30",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              maxHeight: "[240px]",
              overflowY: "auto",
              zIndex: "[1000]",
              minWidth: "[100%]",
              width: "[fit-content]",
              maxWidth: "[90vw]",
            })}
          >
            {collection.items.map((item) => (
              <ArkCombobox.Item
                key={getOptionKey(item)}
                item={item}
                className={css({
                  padding: "spacing.3",
                  cursor: collection.getItemDisabled(item) ? "not-allowed" : "pointer",
                  fontSize: "size.textsm",
                  opacity: collection.getItemDisabled(item) ? 0.5 : 1,
                  _hover: {
                    backgroundColor: collection.getItemDisabled(item)
                      ? "[transparent]"
                      : "core.gray.10",
                  },
                  _highlighted: {
                    backgroundColor: "core.blue.10",
                  },
                })}
              >
                <ArkCombobox.ItemText>{getOptionLabel(item)}</ArkCombobox.ItemText>
              </ArkCombobox.Item>
            ))}
          </ArkCombobox.Content>
        </ArkCombobox.Positioner>
      </Portal>
    </ArkCombobox.Root>
  );
};
