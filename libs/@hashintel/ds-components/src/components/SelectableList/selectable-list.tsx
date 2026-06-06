/* eslint-disable @typescript-eslint/no-use-before-define */

import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { isEmptyString } from "../../util/string";
import { ItemBody } from "./selectable-list-item";
import { styles as itemStyles } from "./selectable-list-item.recipe";
import { type Item, type ItemOrGroup, isGroup } from "./selectable-list-types";
import { styles } from "./selectable-list.recipe";

import type { FormInputSize } from "../../util/form-shared";

export { isGroup, type Item, type ItemOrGroup };

type RenderCtx = {
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

  if ("href" in item && item.href) {
    return (
      <Menu.Item value={item.id} disabled={item.disabled} asChild>
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
    return (
      <Menu.ItemGroup
        key={entry.id}
        id={entry.id}
        className={groupClasses.group}
      >
        {(typeof entry.label === "string"
          ? !isEmptyString(entry.label)
          : entry.label !== undefined && entry.label !== null) && (
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

export const SelectableList = ({
  className,
  items = [],
  selected,
  size = "md",
  onHighlight,
  emptyState,
}: {
  className?: string;
  items?: Array<ItemOrGroup<Item>>;
  size?: FormInputSize;
  selected?: string[] | Set<string>;
  onHighlight?: (id: string) => void;
  emptyState?: React.ReactNode;
}) => {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const classes = styles({ size });

  const isEmpty = items.length === 0;
  if (isEmpty && !emptyState) {
    return null;
  }

  const ctx = {
    size,
    selectedSet,
    contentClassName: classes.content,
  };

  return (
    <Menu.Root
      open
      closeOnSelect={false}
      composite
      onHighlightChange={(details) => {
        if (details.highlightedValue) {
          onHighlight?.(details.highlightedValue);
        }
      }}
    >
      <Menu.Content className={cx(classes.content, className)}>
        {isEmpty ? emptyState : items.map((item) => renderEntry(item, ctx))}
      </Menu.Content>
    </Menu.Root>
  );
};
