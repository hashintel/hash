/* eslint-disable @typescript-eslint/no-use-before-define */

import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { Select } from "@ark-ui/react/select";
import { createContext, use, useEffect, useMemo, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../../util/portal-container-context";
import { isEmptyString } from "../../../util/string";
import { ItemBody } from "./selectable-list-item";
import { styles as itemStyles } from "./selectable-list-item.recipe";
import {
  type CustomItem,
  type Item,
  type ItemOrGroup,
  footerRowId,
  getItemId,
  headerRowId,
  isCustomItem,
  isGroup,
  useCustomRowNavigation,
  useItemsWithCustomIds,
  useLoopSelection,
} from "./selectable-list-util";
import { contentPaddingPx, styles } from "./selectable-list.recipe";

import type { FormInputSize } from "../../../util/form-shared";

export { type CustomItem, isCustomItem, isGroup, type Item, type ItemOrGroup };

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
  const normalizedSubItems = useItemsWithCustomIds(subItems);
  const handleLoopKeyDown = useLoopSelection(normalizedSubItems);
  const handleCustomRowKeyDown = useCustomRowNavigation(normalizedSubItems);

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
                <Menu.Content
                  className={ctx.contentClassName}
                  onKeyDownCapture={(event) =>
                    handleCustomRowKeyDown(event, menu)
                  }
                >
                  <NestedMenuDepthContext value={depth}>
                    {normalizedSubItems.map((entry) => renderEntry(entry, ctx))}
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

/**
 * Keydown handler for presentational rows (custom rows and the header/
 * footer): stops keys from reaching the menu machine, which would otherwise
 * hijack Enter, Space, Home/End and typeahead from the focused child. In a
 * Select, arrows and Enter fall through to zag's content handler so the list
 * highlight/selection can be driven from inside the row (zag already ignores
 * typing from editable elements, but Space and Home/End would act on both the
 * caret and the list, so they stay stopped along with everything else).
 */
const handleRowKeyDown = (as: SelectableListAs, event: React.KeyboardEvent) => {
  const passThrough =
    event.key === "Tab" ||
    event.key === "Escape" ||
    (as === "Select" &&
      (event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter"));
  if (!passThrough) {
    event.stopPropagation();
  }
};

/**
 * A custom row is deliberately not selectable item so the
 * menu machine never highlights it and arrow keys skip it.
 */
const CustomRow = ({ item, ctx }: { item: CustomItem; ctx: RenderCtx }) => {
  const classes = styles({ size: ctx.size });

  return (
    <div
      role="presentation"
      className={classes.customItem}
      data-selectable-list-custom={getItemId(item)}
      onKeyDown={(event) => handleRowKeyDown(ctx.as, event)}
    >
      {item.custom}
    </div>
  );
};

const ItemRow = ({ item, ctx }: { item: Item; ctx: RenderCtx }) => {
  if (isCustomItem(item)) {
    return <CustomRow item={item} ctx={ctx} />;
  }

  const itemId = getItemId(item);
  const isSelected = ctx.selectedSet.has(itemId);
  const isInteractive = !item.disabled && !item.loading;

  const classes = itemStyles({
    as: ctx.as,
    size: ctx.size,
    tone: item.tone,
    selectedTone: item.selectedTone ?? item.tone,
    selectedStyle: item.selectedStyle ?? "highlight",
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
  header,
  footer,
  swapHeaderFooterOnFlip = false,
}: {
  /** Which ark-ui primitive set to render inside. Defaults to Menu. */
  as?: SelectableListAs;
  className?: string;
  items?: Array<ItemOrGroup<Item>>;
  size?: FormInputSize;
  selected?: string[] | Set<string>;
  emptyState?: React.ReactNode;
  /**
   * Pinned above the items, outside the scrollable area. Undecorated —
   * supply your own divider if needed.
   */
  header?: React.ReactNode;
  /**
   * Pinned below the items, outside the scrollable area. Undecorated —
   * supply your own divider if needed.
   */
  footer?: React.ReactNode;
  /**
   * Swap the header and footer when the dropdown flips to open upward
   * (placement `top*`), keeping the header on the edge nearest the trigger.
   */
  swapHeaderFooterOnFlip?: boolean;
}) => {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const normalizedItems = useItemsWithCustomIds(items);
  const hasHeader = header !== undefined && header !== null;
  const hasFooter = footer !== undefined && footer !== null;
  const handleCustomRowKeyDown = useCustomRowNavigation(normalizedItems, {
    hasHeader,
    hasFooter,
  });
  const classes = styles({
    size,
    component: as === "Menu" ? "menu" : "select",
  });

  const isEmpty = normalizedItems.length === 0;

  // The scroll area may not shrink below min(200px, the list's natural
  // height) — see the recipe. CSS cannot compare a length with an intrinsic
  // size, so measure the natural height into a variable via a sizer element.
  const scrollSizerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sizer = scrollSizerRef.current;
    const scrollArea = sizer?.parentElement;
    if (!sizer || !scrollArea) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      scrollArea.style.setProperty(
        "--selectable-list-items-height",
        `${sizer.offsetHeight}px`,
      );
    });
    observer.observe(sizer);
    return () => observer.disconnect();
  }, [hasHeader, hasFooter]);

  const ctx: RenderCtx = {
    as,
    size,
    selectedSet,
    contentClassName: classes.content,
  };

  const listBody = isEmpty ? (
    <div className={classes.emptyContainer}>{emptyState}</div>
  ) : (
    normalizedItems.map((item) => renderEntry(item, ctx))
  );

  const swapOnFlip = swapHeaderFooterOnFlip ? "" : undefined;

  // With a header/footer, scrolling moves to an inner wrapper so they stay
  // pinned while the items scroll. Both edges take part in keyboard
  // navigation as custom rows (skipped by arrows, Tab stops when focusable).
  const body =
    hasHeader || hasFooter ? (
      <>
        {hasHeader && (
          <div
            role="presentation"
            className={classes.header}
            data-selectable-list-custom={headerRowId}
            data-selectable-list-swap-on-flip={swapOnFlip}
            onKeyDown={(event) => handleRowKeyDown(as, event)}
          >
            {header}
          </div>
        )}
        <div className={classes.scrollArea} data-selectable-list-scroll="">
          <div ref={scrollSizerRef} className={classes.scrollSizer}>
            {listBody}
          </div>
        </div>
        {hasFooter && (
          <div
            role="presentation"
            className={classes.footer}
            data-selectable-list-custom={footerRowId}
            data-selectable-list-swap-on-flip={swapOnFlip}
            onKeyDown={(event) => handleRowKeyDown(as, event)}
          >
            {footer}
          </div>
        )}
      </>
    ) : (
      listBody
    );

  if (as === "Select") {
    return (
      <Select.Content className={cx(classes.content, className)}>
        {body}
      </Select.Content>
    );
  }

  return (
    <Menu.Context>
      {(menu) => (
        <Menu.Content
          className={cx(classes.content, className)}
          onKeyDownCapture={(event) => handleCustomRowKeyDown(event, menu)}
        >
          {body}
        </Menu.Content>
      )}
    </Menu.Context>
  );
};
