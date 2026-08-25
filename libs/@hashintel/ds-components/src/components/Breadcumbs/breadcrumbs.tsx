import { useCallback, useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../../util/use-isomorphic-layout-effect";
import { Icon } from "../Icon/icon";
import { Menu } from "../Menu/menu";
import {
  chevronIcons,
  type Classes,
  collectEntries,
  crumbStyle,
  isCollapsible,
  Item,
  ItemContent,
  toMenuItem,
  VisibleItem,
} from "./breadcrumbs-item";
import {
  computeCollapse,
  hiddenIndicesFor,
  initialCollapse,
} from "./breadcrumbs-util";
import { styles } from "./breadcrumbs.recipe";

import type { FormInputSize } from "../../util/form-shared";

export type {
  BreadcrumbEntry,
  BreadcrumbItemProps,
  BreadcrumbSubItem,
} from "./breadcrumbs-item";

const Separator = ({
  size,
  classes,
}: {
  size: FormInputSize;
  classes: Classes;
}) => <Icon name={chevronIcons(size).right} className={classes.separator} />;

/**
 * A responsive breadcrumb trail, composed from `BreadCrumbs.Item` children:
 *
 * ```tsx
 * <BreadCrumbs>
 *   <BreadCrumbs.Item href="/">Home</BreadCrumbs.Item>
 *   <BreadCrumbs.Item href="/projects">Projects</BreadCrumbs.Item>
 *   <BreadCrumbs.Item onClick={rename}>Current</BreadCrumbs.Item>
 * </BreadCrumbs>
 * ```
 *
 * Children that are not `BreadCrumbs.Item` render verbatim as trail entries
 * between separators: they get no crumb styling and, like `noCollapse` crumbs,
 * never collapse into the ellipsis menu.
 */
const BreadCrumbsRoot = ({
  className,
  children,
  size = "md",
  maxItems,
  ellipsisLabel = "Show collapsed",
  "aria-label": ariaLabel = "Breadcrumb",
}: {
  className?: string;
  children: React.ReactNode;
  size?: FormInputSize;
  maxItems?: number;
  /** The aria-label of the ellipsis menu trigger, if one is rendered. */
  ellipsisLabel?: string;
  "aria-label"?: string;
}) => {
  const classes = styles({ size });

  const entries = useMemo(() => collectEntries(children), [children]);
  const count = entries.length;
  // Encoded as a string so `measure` gets a stable, value-equal dependency.
  const collapsibleKey = useMemo(
    () => entries.map((entry) => (isCollapsible(entry) ? "1" : "0")).join(""),
    [entries],
  );

  const rootRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLOListElement>(null);
  const cellRefs = useRef<Array<HTMLLIElement | null>>([]);
  const ellipsisCellRef = useRef<HTMLLIElement | null>(null);
  const ellipsisTriggerRef = useRef<HTMLSpanElement | null>(null);

  const [collapse, setCollapse] = useState(() =>
    initialCollapse(count, maxItems),
  );

  const measure = useCallback(() => {
    const root = rootRef.current;
    const ellipsisCell = ellipsisCellRef.current;
    const ellipsisTrigger = ellipsisTriggerRef.current;
    if (!root || !ellipsisCell || !ellipsisTrigger || count === 0) {
      return;
    }

    const cellWidths: number[] = [];
    for (let index = 0; index < count; index++) {
      const cell = cellRefs.current[index];
      if (!cell) {
        return;
      }
      cellWidths.push(cell.getBoundingClientRect().width);
    }

    const rootStyle = getComputedStyle(root);
    const available =
      root.clientWidth -
      (Number.parseFloat(rootStyle.paddingLeft) || 0) -
      (Number.parseFloat(rootStyle.paddingRight) || 0);

    const next = computeCollapse({
      cellWidths,
      collapsible: [...collapsibleKey].map((flag) => flag === "1"),
      ellipsisWidth: ellipsisCell.getBoundingClientRect().width,
      bareEllipsisWidth: ellipsisTrigger.getBoundingClientRect().width,
      available,
      maxItems,
    });
    setCollapse((previous) =>
      previous.hiddenCount === next.hiddenCount &&
      previous.showFirst === next.showFirst
        ? previous
        : next,
    );
  }, [count, maxItems, collapsibleKey]);

  useIsomorphicLayoutEffect(() => {
    measure();

    // Late web-font loads reflow the text after the first measure, so a
    // root-only observer would miss it and leave a stale result — observe both.
    if (typeof document !== "undefined" && document.fonts.status !== "loaded") {
      void document.fonts.ready.then(measure);
    }

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => measure());
    if (rootRef.current) {
      observer.observe(rootRef.current);
    }
    if (measureRef.current) {
      observer.observe(measureRef.current);
    }
    return () => observer.disconnect();
  }, [measure]);

  if (count === 0) {
    return (
      <nav
        ref={rootRef}
        aria-label={ariaLabel}
        className={cx(classes.root, className)}
      />
    );
  }

  // Derived against the live entries — children can change between measures.
  const hiddenIndices = hiddenIndicesFor(entries.map(isCollapsible), collapse);
  const hiddenSet = new Set(hiddenIndices);
  const firstHidden = hiddenIndices[0];
  const hiddenMenuItems = hiddenIndices.map((index) =>
    toMenuItem(entries[index]!.item!, index),
  );

  const renderEntry = (index: number) => {
    const entry = entries[index]!;
    const isCurrent = index === count - 1 && entry.item !== undefined;
    return (
      <li
        key={`item-${index}`}
        className={classes.item}
        data-current={isCurrent || undefined}
      >
        {index > 0 ? <Separator size={size} classes={classes} /> : null}
        {entry.item ? (
          <VisibleItem
            item={entry.item}
            isCurrent={isCurrent}
            size={size}
            classes={classes}
          />
        ) : (
          entry.node
        )}
      </li>
    );
  };

  return (
    <nav
      ref={rootRef}
      aria-label={ariaLabel}
      className={cx(classes.root, className)}
    >
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol role="list" className={classes.list}>
        {entries.map((_, index) => {
          if (!hiddenSet.has(index)) {
            return renderEntry(index);
          }
          // A single ellipsis stands at the first hidden entry's position;
          // the other hidden entries render nothing.
          if (index !== firstHidden) {
            return null;
          }
          return (
            <li key="ellipsis" className={classes.item}>
              {index > 0 ? <Separator size={size} classes={classes} /> : null}
              <Menu
                items={hiddenMenuItems}
                position="bottom-start"
                trigger={
                  <button
                    type="button"
                    className={classes.ellipsisTrigger}
                    aria-label={ellipsisLabel}
                  >
                    <Icon name="ellipsis" />
                  </button>
                }
              />
            </li>
          );
        })}
      </ol>

      {/* Hidden measurement layer: the full trail at natural width. */}
      <ol ref={measureRef} className={classes.measure} aria-hidden="true">
        {entries.map((entry, index) => (
          <li
            // eslint-disable-next-line react/no-array-index-key
            key={`measure-${index}`}
            ref={(element) => {
              cellRefs.current[index] = element;
            }}
            className={classes.item}
            data-current={
              (index === count - 1 && entry.item !== undefined) || undefined
            }
          >
            {index > 0 ? <Separator size={size} classes={classes} /> : null}
            {entry.item ? (
              <span className={classes.link} style={crumbStyle(entry.item)}>
                <ItemContent item={entry.item} size={size} classes={classes} />
              </span>
            ) : (
              entry.node
            )}
          </li>
        ))}
        <li ref={ellipsisCellRef} className={classes.item}>
          <Separator size={size} classes={classes} />
          <span ref={ellipsisTriggerRef} className={classes.ellipsisTrigger}>
            <Icon name="ellipsis" />
          </span>
        </li>
      </ol>
    </nav>
  );
};

export const BreadCrumbs = Object.assign(BreadCrumbsRoot, { Item });
