import { useCallback, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../../util/use-isomorphic-layout-effect";
import { Icon, type IconName } from "../Icon/icon";
import { Menu } from "../Menu/menu";
import { Tooltip } from "../Tooltip/tooltip";
import {
  chevronIcons,
  crumbStyle,
  toMenuSubEntries,
} from "./breadcrumbs-item-util";

import type { FormInputSize } from "../../util/form-shared";
import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
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

export type BreadcrumbItem = BreadcrumbSubItem & {
  /**
   * Caps the crumb's width — hover pill included — while it is visible in the
   * trail (it does not apply inside the ellipsis menu); a longer label
   * truncates with an ellipsis and gains a tooltip showing the full label
   * (unless `tooltip` is already set).
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
export const Item = (_props: BreadcrumbItem): null => null;
Item.displayName = "BreadCrumbs.Item";

/**
 * A trail entry: a `BreadCrumbs.Item`'s props, or any other child (`node`)
 * rendered verbatim between separators — an escape hatch for custom crumbs.
 * Custom nodes get no crumb styling and never collapse into the ellipsis menu.
 */
export type BreadcrumbEntry =
  | { item: BreadcrumbItem; node?: never }
  | { item?: never; node: React.ReactNode };

/**
 * Whether `children` renders as plain text and can take the truncating
 * `label` class. Composed children like `{first} {last}` arrive as an array
 * of strings, so arrays of text count too; nullish/boolean entries render
 * nothing and don't disqualify. Anything containing elements renders via
 * `custom`, untruncated.
 */
const isTextChildren = (children: React.ReactNode): boolean => {
  if (Array.isArray(children)) {
    return children.every(isTextChildren);
  }
  return (
    typeof children === "string" ||
    typeof children === "number" ||
    children == null ||
    typeof children === "boolean"
  );
};

export const ItemContent = ({
  item,
  size,
  classes,
  labelRef,
}: {
  item: BreadcrumbItem;
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
  item: BreadcrumbItem;
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
