import { Children, isValidElement, useCallback, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../../util/use-isomorphic-layout-effect";
import { Icon, type IconName } from "../Icon/icon";
import { Menu, type MenuItem } from "../Menu/menu";
import { Tooltip } from "../Tooltip/tooltip";

import type { FormInputSize } from "../../util/form-shared";
import type { ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import type { styles } from "./breadcrumbs.recipe";
import type { ExclusifyUnion } from "type-fest";

export type Classes = ReturnType<typeof styles>;

/** A breadcrumb in a crumb's `subItems` dropdown, where nothing truncates. */
export type BreadcrumbSubItem = {
  children: React.ReactNode;
  iconName?: IconName;
  tooltip?: string;
  tooltipOptions?: Omit<
    React.ComponentProps<typeof Tooltip>,
    "children" | "content"
  >;
  /**
   * Accessible name for the crumb, for when the visible `children` alone are
   * not a sufficient label (e.g. icon-only or heavily abbreviated crumbs).
   */
  "aria-label"?: string;
  testId?: string;
} & ExclusifyUnion<
  | { href?: string }
  | { onClick?: () => void }
  | { subItems?: Array<ItemOrGroup<BreadcrumbSubItem>> }
>;

export type BreadcrumbItemProps = BreadcrumbSubItem & {
  /**
   * Caps the crumb's width while it is visible in the trail (it does not apply
   * inside the ellipsis menu); a longer label truncates with an ellipsis and
   * gains a tooltip showing the full label (unless `tooltip` is already set).
   */
  maxWidth?: React.CSSProperties["maxWidth"];
  /**
   * Rendered instead of `children` when the crumb is collapsed into the
   * ellipsis menu — e.g. to show a shorter or richer label there.
   */
  collapsedChildren?: React.ReactNode;
  /**
   * Keeps the crumb visible in place: it is never collapsed into the ellipsis
   * menu, even under width pressure or a `maxItems` cap.
   */
  noCollapse?: boolean;
};

/**
 * A single breadcrumb. This is a declarative marker: `BreadCrumbs` reads these
 * props to measure, collapse, and render the trail, so `Item` renders nothing on
 * its own and must be used as a direct child of `BreadCrumbs`.
 */
export const Item = (_props: BreadcrumbItemProps): null => null;
Item.displayName = "BreadCrumbs.Item";

const isItemElement = (
  child: React.ReactNode,
): child is React.ReactElement<BreadcrumbItemProps> =>
  isValidElement(child) && child.type === Item;

/**
 * A trail entry: a `BreadCrumbs.Item`'s props, or any other child (`node`)
 * rendered verbatim between separators — an escape hatch for custom crumbs.
 * Custom nodes get no crumb styling and never collapse into the ellipsis menu.
 */
export type BreadcrumbEntry =
  | { item: BreadcrumbItemProps; node?: never }
  | { item?: never; node: React.ReactNode };

export const collectEntries = (children: React.ReactNode): BreadcrumbEntry[] =>
  Children.toArray(children).map((child) =>
    isItemElement(child) ? { item: child.props } : { node: child },
  );

export const isCollapsible = (entry: BreadcrumbEntry): boolean =>
  entry.item !== undefined && !entry.item.noCollapse;

/** Converts a crumb's `subItems` (breadcrumb-shaped, possibly grouped or nested) into Menu items. */
function toMenuSubEntries(
  entries: Array<ItemOrGroup<BreadcrumbSubItem>>,
  idPrefix: string,
): Array<ItemOrGroup<MenuItem>> {
  const toEntry = (subItem: BreadcrumbSubItem, id: string): MenuItem => {
    const base = { id, text: subItem.children, icon: subItem.iconName };
    if (subItem.subItems) {
      return { ...base, subItems: toMenuSubEntries(subItem.subItems, id) };
    }
    if (subItem.href !== undefined) {
      return { ...base, href: subItem.href };
    }
    return { ...base, onClick: () => subItem.onClick?.() };
  };
  return entries.map((entry, index) => {
    if ("items" in entry) {
      return {
        ...entry,
        items: entry.items.map((subItem, subIndex) =>
          toEntry(subItem, `${entry.id}-${subIndex}`),
        ),
      };
    }
    return toEntry(entry, `${idPrefix}-${index}`);
  });
}

export const toMenuItem = (
  item: BreadcrumbItemProps,
  originalIndex: number,
): MenuItem => {
  const base = {
    id: `breadcrumb-${originalIndex}`,
    text: item.collapsedChildren ?? item.children,
    icon: item.iconName,
  };
  if (item.subItems) {
    return { ...base, subItems: toMenuSubEntries(item.subItems, base.id) };
  }
  if (item.href !== undefined) {
    return { ...base, href: item.href };
  }
  // A plain crumb still needs an action in the menu; selecting it just closes.
  return { ...base, onClick: () => item.onClick?.() };
};

export const crumbStyle = (
  item: BreadcrumbItemProps,
): React.CSSProperties | undefined =>
  item.maxWidth !== undefined ? { maxWidth: item.maxWidth } : undefined;

export const chevronIcons = (
  size: FormInputSize,
): { right: IconName; down: IconName } =>
  size === "lg"
    ? { right: "chevronRight", down: "chevronDown" }
    : { right: "chevronRightHeavy", down: "chevronDownHeavy" };

const isTextChildren = (children: React.ReactNode): boolean =>
  typeof children === "string" || typeof children === "number";

export const ItemContent = ({
  item,
  size,
  classes,
  labelRef,
}: {
  item: BreadcrumbItemProps;
  size: FormInputSize;
  classes: Classes;
  labelRef?: React.Ref<HTMLSpanElement>;
}) => (
  <>
    {item.iconName ? (
      <Icon name={item.iconName} className={classes.icon} />
    ) : null}
    <span
      ref={labelRef}
      className={isTextChildren(item.children) ? classes.label : classes.custom}
    >
      {item.children}
    </span>
    {item.subItems ? (
      <Icon name={chevronIcons(size).down} className={classes.dropdownIcon} />
    ) : null}
  </>
);

/**
 * A single visible breadcrumb — a link (`href`), button (`onClick`), dropdown
 * menu (`subItems`), or plain text (none). When its label is visually
 * truncated (by `maxWidth` or the current page being squeezed) and no explicit
 * `tooltip` is set, it gains a tooltip showing the full label.
 */
export const VisibleItem = ({
  item,
  isCurrent,
  size,
  classes,
}: {
  item: BreadcrumbItemProps;
  isCurrent: boolean;
  size: FormInputSize;
  classes: Classes;
}) => {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const label = labelRef.current;
    if (label) {
      setIsTruncated(label.scrollWidth > label.clientWidth);
    }
  }, []);

  // The label's content can change without a resize; re-check after every commit
  useIsomorphicLayoutEffect(checkTruncation);

  // And it can resize without a re-render so observe it too.
  useIsomorphicLayoutEffect(() => {
    const label = labelRef.current;
    if (!label || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(checkTruncation);
    observer.observe(label);
    return () => observer.disconnect();
  }, [checkTruncation]);

  const shared = {
    className: classes.link,
    style: crumbStyle(item),
    "data-testid": item.testId,
    "aria-current": isCurrent ? ("page" as const) : undefined,
    "aria-label": item["aria-label"],
  };

  const content = (
    <ItemContent
      item={item}
      size={size}
      classes={classes}
      labelRef={labelRef}
    />
  );

  const element =
    item.href !== undefined ? (
      <a {...shared} href={item.href} draggable={false}>
        {content}
      </a>
    ) : item.subItems ? (
      <Menu
        items={toMenuSubEntries(item.subItems, "crumb")}
        position="bottom-start"
        trigger={
          <button type="button" {...shared}>
            {content}
          </button>
        }
      />
    ) : item.onClick ? (
      <button type="button" {...shared} onClick={item.onClick}>
        {content}
      </button>
    ) : (
      <span {...shared}>{content}</span>
    );

  // A truncated crumb with no explicit tooltip shows the full label instead.
  const tooltipContent =
    item.tooltip ?? (isTruncated ? item.children : undefined);

  if (tooltipContent != null) {
    return (
      <Tooltip
        {...item.tooltipOptions}
        className={cx(classes.tooltipWrapper, item.tooltipOptions?.className)}
        content={tooltipContent}
      >
        {element}
      </Tooltip>
    );
  }

  return element;
};
