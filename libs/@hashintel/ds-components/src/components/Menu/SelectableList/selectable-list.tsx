/* eslint-disable @typescript-eslint/no-use-before-define */

import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { Select } from "@ark-ui/react/select";
import { createContext, use, useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../../util/portal-container-context";
import { isEmptyString } from "../../../util/string";
import { ItemBody } from "./selectable-list-item";
import { styles as itemStyles } from "./selectable-list-item.recipe";
import {
  type Item,
  type ItemOrGroup,
  getItemId,
  isGroup,
  useLoopSelection,
} from "./selectable-list-util";
import { contentPaddingPx, styles } from "./selectable-list.recipe";

import type { FormInputSize } from "../../../util/form-shared";

export { isGroup, type Item, type ItemOrGroup };

export type SelectableListAs = "Menu" | "Select";

type RenderCtx = {
  as: SelectableListAs;
  size: FormInputSize;
  selectedSet: Set<string>;
  contentClassName: string | undefined;
};

const NestedMenuDepthContext = createContext(0);

const NestedMenu = ({
  item,
  subItems,
  body,
  className,
  isSelected,
  ctx,
}: {
  item: Item;
  subItems: Array<ItemOrGroup<Item>>;
  body: React.ReactNode;
  className: string | undefined;
  isSelected: boolean;
  ctx: RenderCtx;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const parentDepth = use(NestedMenuDepthContext);
  const depth = parentDepth + 1;
  const handleLoopKeyDown = useLoopSelection(subItems);

  return (
    <Menu.Root
      loopFocus={false}
      ids={{ trigger: getItemId(item) }}
      positioning={{
        placement: "right-start",
        offset: { mainAxis: 0 },
        shift: -contentPaddingPx[ctx.size],
      }}
    >
      <Menu.Context>
        {(menu) => (
          <>
            <Menu.TriggerItem
              className={className}
              data-selected={isSelected || undefined}
            >
              {body}
            </Menu.TriggerItem>
            <Portal container={portalContainerRef}>
              <Menu.Positioner
                style={{
                  zIndex: `calc(var(--z-index-popover) + ${depth})`,
                }}
                onKeyDownCapture={(event) => handleLoopKeyDown(event, menu)}
              >
                <Menu.Content className={ctx.contentClassName}>
                  <NestedMenuDepthContext value={depth}>
                    {subItems.map((entry) => renderEntry(entry, ctx))}
                  </NestedMenuDepthContext>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </>
        )}
      </Menu.Context>
    </Menu.Root>
  );
};

const ItemRow = ({ item, ctx }: { item: Item; ctx: RenderCtx }) => {
  const itemId = getItemId(item);
  const isSelected = ctx.selectedSet.has(itemId);
  const selectedStyle = item.selectedStyle ?? "highlight";
  const highlighted = isSelected && selectedStyle === "highlight";
  const isInteractive = !item.disabled && !item.loading;

  const classes = itemStyles({
    as: ctx.as,
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
        data-loading={(item.loading && !item.disabled) || undefined}
      >
        {body}
      </Select.Item>
    );
  }

  if (item.subItems && item.subItems.length > 0 && isInteractive) {
    return (
      <NestedMenu
        item={item}
        subItems={item.subItems}
        body={body}
        className={classes.item}
        isSelected={isSelected}
        ctx={ctx}
      />
    );
  }

  const closeOnSelect =
    item.keepOpenOnSelect !== undefined ? !item.keepOpenOnSelect : undefined;

  if ("href" in item && item.href && isInteractive) {
    return (
      <Menu.Item value={itemId} closeOnSelect={closeOnSelect} asChild>
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
      item.onClick(itemId);
    }
  };

  return (
    <Menu.Item
      value={itemId}
      disabled={!isInteractive}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
      className={classes.item}
      data-selected={isSelected || undefined}
      data-loading={(item.loading && !item.disabled) || undefined}
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
        <Select.ItemGroup key={entry.id} className={groupClasses.group}>
          {showLabel && (
            <Select.ItemGroupLabel className={groupClasses.groupLabel}>
              {entry.label}
            </Select.ItemGroupLabel>
          )}
          {entry.items.map((child) => (
            <ItemRow key={getItemId(child)} item={child} ctx={ctx} />
          ))}
        </Select.ItemGroup>
      );
    }

    return (
      <Menu.ItemGroup key={entry.id} className={groupClasses.group}>
        {showLabel && (
          <Menu.ItemGroupLabel className={groupClasses.groupLabel}>
            {entry.label}
          </Menu.ItemGroupLabel>
        )}
        {entry.items.map((child) => (
          <ItemRow key={getItemId(child)} item={child} ctx={ctx} />
        ))}
      </Menu.ItemGroup>
    );
  }

  return <ItemRow key={getItemId(entry)} item={entry} ctx={ctx} />;
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
}: {
  /** Which ark-ui primitive set to render inside. Defaults to Menu. */
  as?: SelectableListAs;
  className?: string;
  items?: Array<ItemOrGroup<Item>>;
  size?: FormInputSize;
  selected?: string[] | Set<string>;
  emptyState?: React.ReactNode;
}) => {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const classes = styles({
    size,
    component: as === "Menu" ? "menu" : "select",
  });

  const isEmpty = items.length === 0;

  const ctx: RenderCtx = {
    as,
    size,
    selectedSet,
    contentClassName: classes.content,
  };

  const body = isEmpty ? (
    <div className={classes.emptyContainer}>{emptyState}</div>
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
