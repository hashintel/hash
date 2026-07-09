import { Popover, Portal } from "@ark-ui/react";
import { useMemo, useState } from "react";

import { Icon, usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface ColumnFilter {
  /** Small-caps heading shown at the top of the popover. */
  header: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /**
   * Whether to show the search box. Defaults to `true`; disable it for small,
   * fixed option sets (e.g. type / status) where scanning is faster than typing.
   */
  searchable?: boolean;
}

const triggerButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  p: "0.5",
  borderRadius: "sm",
  color: "fg.subtle",
  cursor: "pointer",
  transition: "colors",
  _hover: { bg: "bg.subtle" },
});
const triggerActive = css({ color: "[#2563eb]" });

const content = css({
  display: "flex",
  flexDirection: "column",
  minW: "56",
  maxW: "80",
  maxH: "[260px]",
  overflowY: "auto",
  p: "1.5",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  boxShadow: "lg",
  zIndex: "dropdown",
});

const headerRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  px: "1.5",
  pb: "1",
});
const headerLabel = css({
  textStyle: "xxs",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "wider",
  color: "fg.subtle",
});
const blueButton = css({
  px: "1.5",
  py: "0.5",
  borderRadius: "sm",
  textStyle: "xxs",
  fontWeight: "medium",
  color: "[#2563eb]",
  cursor: "pointer",
  flexShrink: 0,
  _hover: { bg: "[#eff6ff]" },
});

const searchWrap = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  px: "1.5",
  py: "1",
  mb: "1",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  color: "fg.subtle",
});
const searchInput = css({
  flex: "1",
  minW: "0",
  bg: "[transparent]",
  outline: "none",
  textStyle: "xs",
  color: "fg.body",
  _placeholder: { color: "fg.subtle" },
});

const optionRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1",
  borderRadius: "sm",
  _hover: { bg: "bg.subtle", "& > button": { visibility: "visible" } },
});
const optionLabel = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "1",
  minW: "0",
  px: "1.5",
  py: "1",
  cursor: "pointer",
  textStyle: "xs",
  color: "fg.body",
});
const checkbox = css({
  accentColor: "[#2563eb]",
  cursor: "pointer",
  flexShrink: 0,
});
const labelText = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const countText = css({ color: "fg.subtle", flexShrink: 0 });
const onlyButton = css({ visibility: "hidden" });
const emptyText = css({
  px: "1.5",
  py: "2",
  textStyle: "xs",
  color: "fg.subtle",
});

/**
 * Searchable multi-select filter popover for a table column header.
 */
export const FilterMenu = ({
  header,
  options,
  selected,
  onChange,
  searchable = true,
}: ColumnFilter) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const portalRef = usePortalContainerRef();

  const allValues = useMemo(
    () => options.map((option) => option.value),
    [options],
  );

  const selectedCount = options.filter((option) =>
    selected.has(option.value),
  ).length;
  const isActive = selectedCount < options.length;

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return options;
    }
    return options.filter((option) =>
      option.label.toLowerCase().includes(trimmed),
    );
  }, [options, query]);

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
  };

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (!details.open) {
          setQuery("");
        }
      }}
      positioning={{ placement: "bottom-start" }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Filter by ${header}`}
          className={cx(triggerButton, isActive && triggerActive)}
        >
          <Icon name="filter" size="xs" />
        </button>
      </Popover.Trigger>
      <Portal container={portalRef}>
        <Popover.Positioner>
          <Popover.Content className={content}>
            <div className={headerRow}>
              <span className={headerLabel}>{header}</span>
              {isActive && (
                <button
                  type="button"
                  className={blueButton}
                  onClick={() => {
                    onChange(new Set(allValues));
                    closeMenu();
                  }}
                >
                  Reset
                </button>
              )}
            </div>
            {searchable && (
              <div className={searchWrap}>
                <Icon name="search" size="xs" />
                <input
                  type="text"
                  value={query}
                  placeholder="Search"
                  aria-label={`Search ${header}`}
                  className={searchInput}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className={emptyText}>No matches</div>
            ) : (
              filteredOptions.map((option) => (
                <div key={option.value} className={optionRow}>
                  <label className={optionLabel}>
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={selected.has(option.value)}
                      onChange={() => toggle(option.value)}
                    />
                    <span className={labelText}>{option.label}</span>
                    <span className={countText}>({option.count})</span>
                  </label>
                  <button
                    type="button"
                    className={cx(blueButton, onlyButton)}
                    aria-label={`Show only ${option.label}`}
                    onClick={() => {
                      onChange(new Set([option.value]));
                      closeMenu();
                    }}
                  >
                    Only
                  </button>
                </div>
              ))
            )}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};
