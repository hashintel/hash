import { Combobox, createListCollection, Portal } from "@ark-ui/react";
import { useMemo, useState } from "react";

import { Icon, usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/**
 * Local grouped, searchable select built on `@ark-ui/react/combobox` and styled
 * with ds-helpers `css()` + design-system tokens. The popover portals into the
 * supply-chain layout's token scope.
 */
export interface OptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  groups: OptionGroup[];
  className?: string;
  /** `sm` is the compact toolbar pill; `lg` renders as a display-sized page title. */
  size?: "sm" | "lg";
}

const triggerStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "7",
  maxW: "[260px]",
  paddingX: "2",
  textStyle: "xs",
  color: "fg.body",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  cursor: "pointer",
  transition: "colors",
  _hover: { borderColor: "bd.solid" },
});

const inputStyles = css({
  flex: "1",
  height: "7",
  paddingX: "2",
  textStyle: "xs",
  color: "fg.body",
  bg: "[transparent]",
  outline: "none",
  _placeholder: { color: "fg.subtle" },
});

const triggerLgStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  maxW: "[480px]",
  ml: "[-6px]",
  paddingX: "1.5",
  paddingY: "0.5",
  bg: "[transparent]",
  borderWidth: "0",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
});

const inputLgStyles = css({
  fontFamily: "display",
  textStyle: "2xl",
  fontWeight: "medium",
  color: "fg.heading",
  lineHeight: "[30px]",
  bg: "[transparent]",
  outline: "none",
  minW: "0",
});

const contentStyles = css({
  display: "flex",
  flexDirection: "column",
  width: "64",
  maxH: "[300px]",
  overflowY: "auto",
  padding: "1",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  boxShadow: "lg",
  zIndex: "dropdown",
});

const groupLabelStyles = css({
  paddingX: "3",
  paddingTop: "2",
  paddingBottom: "1",
  textStyle: "xxs",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "wider",
  color: "fg.subtle",
});

const itemStyles = css({
  paddingX: "3",
  paddingY: "1.5",
  textStyle: "xs",
  color: "fg.body",
  borderRadius: "sm",
  cursor: "pointer",
  "&[data-highlighted]": { bg: "bg.subtle" },
  "&[data-state=checked]": { color: "fg.heading", fontWeight: "medium" },
});

const emptyStyles = css({
  paddingX: "3",
  paddingY: "2",
  textStyle: "xs",
  color: "fg.subtle",
});

export const SearchableSelect = ({
  value,
  onChange,
  groups,
  className,
  size = "sm",
}: SearchableSelectProps) => {
  const allOptions = useMemo(
    () => groups.flatMap((group) => group.options),
    [groups],
  );
  const selectedLabel =
    allOptions.find((observation) => observation.value === value)?.label ??
    value;

  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const query2 = query.trim().toLowerCase();
    if (!query2) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((observation) =>
          observation.label.toLowerCase().includes(query2),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: filteredGroups.flatMap((group) => group.options),
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [filteredGroups],
  );

  const portalRef = usePortalContainerRef();

  return (
    <Combobox.Root
      collection={collection}
      value={[value]}
      inputValue={query}
      onValueChange={(details) => {
        const next = details.value[0];
        if (next !== undefined) {
          onChange(next);
        }
      }}
      onInputValueChange={(details) => setQuery(details.inputValue)}
      onOpenChange={(details) => {
        if (!details.open) {
          setQuery("");
        }
      }}
      selectionBehavior="replace"
      placeholder={selectedLabel}
      className={className}
    >
      <Combobox.Control
        className={size === "lg" ? triggerLgStyles : triggerStyles}
      >
        <Combobox.Input
          className={size === "lg" ? inputLgStyles : inputStyles}
        />
        <Combobox.Trigger>
          <Icon name="chevronDown" size="sm" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Portal container={portalRef}>
        <Combobox.Positioner>
          <Combobox.Content className={contentStyles}>
            {filteredGroups.length === 0 ? (
              <Combobox.Empty className={emptyStyles}>
                No results
              </Combobox.Empty>
            ) : (
              filteredGroups.map((group) => (
                <Combobox.ItemGroup key={group.label}>
                  <Combobox.ItemGroupLabel className={groupLabelStyles}>
                    {group.label}
                  </Combobox.ItemGroupLabel>
                  {group.options.map((option) => (
                    <Combobox.Item
                      key={option.value}
                      item={option}
                      className={itemStyles}
                    >
                      <Combobox.ItemText>{option.label}</Combobox.ItemText>
                    </Combobox.Item>
                  ))}
                </Combobox.ItemGroup>
              ))
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
};
