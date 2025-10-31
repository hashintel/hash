import { createListCollection,Select as ArkSelect } from "@ark-ui/react/select";
import { css } from "@hashintel/ds-helpers/css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

export const Select = ({
  value,
  onChange,
  options,
  label,
  disabled = false,
  placeholder = "Select an option",
}: SelectProps) => {
  const collection = createListCollection({ items: options });

  return (
    <ArkSelect.Root
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        if (details.value[0]) {
          onChange(details.value[0]);
        }
      }}
      disabled={disabled}
      positioning={{ sameWidth: true }}
      className={css({
        width: "[100%]",
        display: "flex",
        flexDirection: "column",
        gap: "spacing.2",
      })}
    >
      {label && (
        <ArkSelect.Label
          className={css({
            fontSize: "size.textsm",
            color: "core.gray.80",
            fontWeight: "medium",
          })}
        >
          {label}
        </ArkSelect.Label>
      )}
      <ArkSelect.Control
        className={css({
          position: "relative",
        })}
      >
        <ArkSelect.Trigger
          className={css({
            width: "[100%]",
            paddingTop: "spacing.2",
            paddingBottom: "spacing.2",
            paddingLeft: "spacing.3",
            paddingRight: "spacing.3",
            border: "[1px solid]",
            borderColor: "core.gray.30",
            borderRadius: "radius.4",
            backgroundColor: "[white]",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "spacing.2",
            _hover: {
              borderColor: "core.gray.40",
            },
            _focus: {
              outline: "[2px solid]",
              outlineColor: "core.blue.40",
              outlineOffset: "[1px]",
            },
            _disabled: {
              cursor: "not-allowed",
              backgroundColor: "core.gray.10",
              color: "core.gray.50",
            },
          })}
        >
          <ArkSelect.ValueText
            placeholder={placeholder}
            className={css({
              fontSize: "size.textsm",
              color: "core.gray.90",
            })}
          />
          <ArkSelect.Indicator
            className={css({
              width: "[16px]",
              height: "[16px]",
              color: "core.gray.60",
            })}
          >
            ▼
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <ArkSelect.Positioner>
        <ArkSelect.Content
          className={css({
            backgroundColor: "[white]",
            border: "1px solid",
            borderColor: "core.gray.30",
            borderRadius: "radius.4",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
            maxHeight: "[300px]",
            overflowY: "auto",
            zIndex: "[1000]",
          })}
        >
          {options.map((option) => (
            <ArkSelect.Item
              key={option.value}
              item={option}
              className={css({
                paddingTop: "spacing.2",
                paddingBottom: "spacing.2",
                paddingLeft: "spacing.3",
                paddingRight: "spacing.3",
                cursor: "pointer",
                fontSize: "size.textsm",
                color: "core.gray.90",
                _hover: {
                  backgroundColor: "core.blue.10",
                },
                _selected: {
                  backgroundColor: "core.blue.20",
                  fontWeight: "medium",
                },
              })}
            >
              <ArkSelect.ItemText>{option.label}</ArkSelect.ItemText>
              <ArkSelect.ItemIndicator
                className={css({
                  marginLeft: "auto",
                  color: "core.blue.60",
                })}
              >
                ✓
              </ArkSelect.ItemIndicator>
            </ArkSelect.Item>
          ))}
        </ArkSelect.Content>
      </ArkSelect.Positioner>
    </ArkSelect.Root>
  );
};
