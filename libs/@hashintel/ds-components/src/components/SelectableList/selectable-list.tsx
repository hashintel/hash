/* eslint-disable @typescript-eslint/no-use-before-define */

import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { Select } from "@ark-ui/react/select";
import { useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { isEmptyString } from "../../util/string";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { ItemBody } from "./selectable-list-item";
import { styles as itemStyles } from "./selectable-list-item.recipe";
import { type Item, type ItemOrGroup, isGroup } from "./selectable-list-util";
import { styles } from "./selectable-list.recipe";

import type { FormInputSize } from "../../util/form-shared";

export { isGroup, type Item, type ItemOrGroup };

export type SelectableListAs = "Menu" | "Select";

type RenderCtx = {
  as: SelectableListAs;
  size: FormInputSize;
  selectedSet: Set<string>;
  contentClassName: string | undefined;
};

const ItemRow = ({ item, ctx }: { item: Item; ctx: RenderCtx }) => {
  const isSelected = ctx.selectedSet.has(item.id);
  const selectedStyle = item.selectedStyle ?? "tick";
  const highlighted = isSelected && selectedStyle === "highlight";

  const classes = itemStyles({
    size: ctx.size,
    tone: item.tone,
    highlighted,
    selected: isSelected,
  });

  const body = (
    <ItemBody
      item={item}
      size={ctx.size}
      isSelected={isSelected}
      classes={classes}
    />
  );

  if (ctx.as === "Select") {
    return (
      <Select.Item
        item={item}
        className={classes.item}
        data-selected={isSelected || undefined}
      >
        {body}
      </Select.Item>
    );
  }

  if (item.nestedItems) {
    return (
      <Menu.Root closeOnSelect={false}>
        <Menu.TriggerItem
          className={classes.item}
          data-selected={isSelected || undefined}
        >
          {body}
        </Menu.TriggerItem>
        <Portal>
          <Menu.Positioner>
            <Menu.Content className={ctx.contentClassName}>
              {renderEntry(item.nestedItems, ctx)}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    );
  }

  if ("href" in item && item.href && !item.disabled) {
    return (
      <Menu.Item value={item.id} asChild>
        <a
          href={item.href}
          target={item.target}
          className={classes.item}
          data-selected={isSelected || undefined}
        >
          {body}
        </a>
      </Menu.Item>
    );
  }

  const handleSelect = () => {
    if ("onClick" in item && item.onClick) {
      item.onClick(item.id);
    }
  };

  return (
    <Menu.Item
      value={item.id}
      disabled={item.disabled}
      onSelect={handleSelect}
      className={classes.item}
      data-selected={isSelected || undefined}
    >
      {body}
    </Menu.Item>
  );
};

const renderEntry = (
  entry: ItemOrGroup<Item>,
  ctx: RenderCtx,
): React.ReactNode => {
  if (isGroup(entry)) {
    const groupClasses = styles({ size: ctx.size });
    const showLabel =
      typeof entry.label === "string"
        ? !isEmptyString(entry.label)
        : entry.label !== undefined && entry.label !== null;

    if (ctx.as === "Select") {
      return (
        <Select.ItemGroup
          key={entry.id}
          id={entry.id}
          className={groupClasses.group}
        >
          {showLabel && (
            <Select.ItemGroupLabel className={groupClasses.groupLabel}>
              {entry.label}
            </Select.ItemGroupLabel>
          )}
          {entry.items.map((child) => (
            <ItemRow key={child.id} item={child} ctx={ctx} />
          ))}
        </Select.ItemGroup>
      );
    }

    return (
      <Menu.ItemGroup
        key={entry.id}
        id={entry.id}
        className={groupClasses.group}
      >
        {showLabel && (
          <Menu.ItemGroupLabel className={groupClasses.groupLabel}>
            {entry.label}
          </Menu.ItemGroupLabel>
        )}
        {entry.items.map((child) => (
          <ItemRow key={child.id} item={child} ctx={ctx} />
        ))}
      </Menu.ItemGroup>
    );
  }

  return <ItemRow key={entry.id} item={entry} ctx={ctx} />;
};

/**
 * Renders the visual body of a selectable list — a styled content
 * container with items, groups, empty state, and loading state.
 *
 * Pass `as="Menu"` (default) to render inside an ark-ui `Menu.Root`, or
 * `as="Select"` to render inside an ark-ui `Select.Root`. The consumer
 * is responsible for setting the parent's `open` state, `closeOnSelect`,
 * `composite`, and any value/highlight callbacks. For an always-open
 * embedded menu pass `open` and `closeOnSelect={false}` to the parent
 * `Menu.Root`. For a popover-style menu use a `Menu.Trigger` /
 * `Select.Trigger` + `Positioner` (see the `Menu` / `Select` components).
 */
export const SelectableList = ({
  as = "Menu",
  className,
  items = [],
  selected,
  size = "md",
  emptyState,
  loading = false,
}: {
  /** Which ark-ui primitive set to render inside. Defaults to Menu. */
  as?: SelectableListAs;
  className?: string;
  items?: Array<ItemOrGroup<Item>>;
  size?: FormInputSize;
  selected?: string[] | Set<string>;
  emptyState?: React.ReactNode;
  loading?: boolean;
}) => {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const classes = styles({ size });

  const isEmpty = items.length === 0;
  if (isEmpty && !emptyState && !loading) {
    return null;
  }

  const ctx: RenderCtx = {
    as,
    size,
    selectedSet,
    contentClassName: classes.content,
  };

  const body = loading ? (
    <div className={classes.loadingContainer}>
      <LoadingSpinner size={size} />
    </div>
  ) : isEmpty ? (
    emptyState
  ) : (
    items.map((item) => renderEntry(item, ctx))
  );

  if (as === "Select") {
    return (
      <Select.Content className={cx(classes.content, className)}>
        {body}
      </Select.Content>
    );
  }

  return (
    <Menu.Content className={cx(classes.content, className)}>
      {body}
    </Menu.Content>
  );
};
