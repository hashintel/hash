import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import { useContext, useEffect, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../../util/use-isomorphic-layout-effect";
import { TabsRootContext } from "./tabs-context";
import { styles } from "./tabs.recipe";

import type { TabsSize } from "./tabs-context";

export type TabItem<Value extends string = string> = {
  /** Identifies the tab; the root `value` and `TabContent` item `id`s refer to it. */
  id: Value;
  className?: string;
  /** The tab's visible content. */
  children: React.ReactNode;
  /** Prevents selecting the tab. */
  disabled?: boolean;
  /** Called when the tab is clicked, in addition to the root `onChange`. */
  onClick?: () => void;
  /**
   * If defined, the tab renders as an `a` element linking to this URL.
   * Ignored while `disabled` is set.
   */
  href?: string;
  /**
   * Vertical alignment within the list when other tabs are taller. In `line`
   * and `folder` it positions the tab box itself; in `pill` the tab stays
   * full-height and it positions the label inside. In vertical orientation
   * the axis is horizontal: `top` maps to the start edge, `bottom` to the end.
   */
  align?: "top" | "center" | "bottom";
  testId?: string;
} & React.AriaAttributes;

// Docs-only marker: renders nothing, exists so react-docgen can surface the
// `items` entry shape in the docs prop table.
export const TabItemDoc = (_props: TabItem): null => null;

export type TabListProps<Value extends string = string> = {
  className?: string;
  /** The selectable tabs. */
  items: Array<TabItem<Value>>;
  /**
   * The `id` of the selected tab. Drives selection when the list is used
   * standalone (without a `Tabs` root, e.g. link tabs); inside a `Tabs` root
   * the root `value` is the source of truth and this prop is ignored.
   */
  selected?: NoInfer<Value>;
  /**
   * The visual style: `line` underlines the selected tab, `pill` fills it
   * with a rounded pill, `folder` raises it as a bordered flap that opens
   * into the panel below. Falls back to the `Tabs` root's `variant`.
   */
  variant?: "line" | "pill" | "folder";
  /**
   * How the tabs are distributed along a horizontal list: packed to the
   * left, centered, or stretched across the `fullWidth`.
   */
  align?: "center" | "left" | "fullWidth";
  /** The size (height) of the tabs. Falls back to the `Tabs` root's `size`. */
  size?: TabsSize;
  /**
   * Lays the tabs out in a row or a column. Also switches arrow-key
   * navigation and moves the hairline/flap edge beside the tabs. Falls back
   * to the `Tabs` root's `orientation`.
   */
  orientation?: "horizontal" | "vertical";
  /**
   * Content rendered at the trailing edge of the list (right in horizontal,
   * bottom in vertical), e.g. action buttons. Stays outside the tablist and
   * its arrow-key navigation, and doesn't scroll with the tabs.
   */
  actions?: React.ReactNode;
};

export const TabList = <const Value extends string = string>({
  className,
  items,
  selected,
  variant: variantProp,
  // Defaulted via ?? below: a destructuring default here would leak into
  // react-docgen's default for TabItem's same-named `align`
  align: alignProp,
  size: sizeProp,
  orientation: orientationProp,
  actions,
}: TabListProps<Value>) => {
  const rootContext = useContext(TabsRootContext);
  const hasRoot = rootContext !== null;
  const align = alignProp ?? "left";
  const variant = variantProp ?? rootContext?.variant ?? "line";
  const size = sizeProp ?? rootContext?.size ?? "md";
  const orientation =
    orientationProp ?? rootContext?.orientation ?? "horizontal";
  const classes = styles({ variant, align, size, orientation });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Layout effect so the registration flushes before paint: the machine
  // otherwise measures and paints a horizontal frame (indicator axis,
  // aria-orientation, arrow keys) before correcting
  useIsomorphicLayoutEffect(() => {
    rootContext?.registerOrientation(orientation);
  }, [rootContext, orientation]);

  // Scrubs the scroll-linked variables from the scroll position:
  // - every variant: the edge-fade mask widths on the list, which ramp in
  //   where there is more content to scroll to;
  // - folder: the panel-junction corner variables on the root, so a corner
  //   straightens exactly as the selected flap reaches it and rounds back as
  //   it leaves — every intermediate value stays connected because the
  //   hairline, arc and panel radius all derive from the same variable (see
  //   tabs.recipe.ts). The fades are additionally capped by the selected
  //   flap's distance to the edge so a sticky stuck tab is never faded.
  // The flap's zag-measured vars give the selected tab's static position; the
  // sticky trigger's own offsets shift once stuck, so they can't be used.
  useEffect(() => {
    // :scope-anchored lookups so nested tabs inside the panels (or actions)
    // can't be mistaken for this list's own parts
    const wrapper = wrapperRef.current;
    const rootEl = wrapper?.closest<HTMLElement>(
      "[data-scope='tabs'][data-part='root']",
    );
    const list = wrapper?.querySelector<HTMLElement>(
      ":scope > [data-scope='tabs'][data-part='list']",
    );
    if (!wrapper || !rootEl || !list) {
      return;
    }
    const vertical = orientation === "vertical";
    const folder = variant === "folder";
    let frame = 0;

    const sync = () => {
      frame = 0;
      const indicator = list.querySelector<HTMLElement>(
        ":scope > [data-scope='tabs'][data-part='indicator']",
      );
      const position = Number.parseFloat(
        indicator?.style.getPropertyValue(vertical ? "--top" : "--left") ?? "",
      );
      const extent = Number.parseFloat(
        indicator?.style.getPropertyValue(vertical ? "--height" : "--width") ??
          "",
      );
      const scrolled = vertical ? list.scrollTop : list.scrollLeft;
      const viewport = vertical ? list.clientHeight : list.clientWidth;
      const limit =
        (vertical ? list.scrollHeight : list.scrollWidth) - viewport;

      const selectedToStart = Number.isNaN(position)
        ? Number.POSITIVE_INFINITY
        : position - scrolled;
      const selectedToEnd = Number.isNaN(position)
        ? Number.POSITIVE_INFINITY
        : scrolled + viewport - position - extent;

      const fade = (scrollable: number, selectedDistance: number) =>
        Math.max(
          0,
          Math.min(
            scrollable,
            folder ? Math.max(0, selectedDistance) : Number.POSITIVE_INFINITY,
            48,
          ),
        );
      list.style.setProperty(
        "--tabs-fade-start",
        `${fade(scrolled, selectedToStart)}px`,
      );
      list.style.setProperty(
        "--tabs-fade-end",
        `${fade(limit - scrolled, selectedToEnd)}px`,
      );

      if (!folder) {
        return;
      }
      // A stuck trigger detaches from the flap, whose offset shape would
      // peek out around the trigger's rounded top corners — the trigger
      // carries identical visuals, so the flap hides while stuck
      wrapper.toggleAttribute(
        "data-stuck",
        selectedToStart < 0 || selectedToEnd < 0,
      );
      const panel = rootEl.querySelector<HTMLElement>(
        ":scope > [data-scope='tabs'][data-part='content']",
      );
      if (!panel) {
        return;
      }
      const radius = Number.parseFloat(
        getComputedStyle(panel).getPropertyValue(
          vertical ? "border-top-right-radius" : "border-bottom-right-radius",
        ),
      );
      if (Number.isNaN(radius)) {
        return;
      }
      const clampToRadius = (distance: number) =>
        Number.isNaN(distance)
          ? radius
          : Math.max(0, Math.min(distance, radius));
      rootEl.style.setProperty(
        "--tabs-corner-start",
        `${clampToRadius(selectedToStart)}px`,
      );
      rootEl.style.setProperty(
        "--tabs-corner-end",
        `${clampToRadius(selectedToEnd)}px`,
      );
    };

    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(sync);
      }
    };

    schedule();
    list.addEventListener("scroll", schedule, { passive: true });
    // Covers selection changes and zag re-measuring the flap (its inline
    // style vars), plus tabs being added or removed
    const mutations = new MutationObserver(schedule);
    mutations.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-selected"],
    });
    const resizes = new ResizeObserver(schedule);
    resizes.observe(list);

    return () => {
      list.removeEventListener("scroll", schedule);
      mutations.disconnect();
      resizes.disconnect();
      cancelAnimationFrame(frame);
      list.style.removeProperty("--tabs-fade-start");
      list.style.removeProperty("--tabs-fade-end");
      rootEl.style.removeProperty("--tabs-corner-start");
      rootEl.style.removeProperty("--tabs-corner-end");
      wrapper.removeAttribute("data-stuck");
    };
  }, [variant, orientation]);

  const list = (
    <ArkTabs.List className={classes.list}>
      <ArkTabs.Indicator className={classes.indicator} />
      {items.map((item) => {
        const {
          id,
          className: itemClassName,
          children,
          disabled,
          onClick,
          href,
          align: itemAlign,
          testId,
          ...ariaProps
        } = item;

        const triggerProps = {
          value: id,
          disabled,
          onClick,
          className: cx(classes.trigger, itemClassName),
          "data-align": itemAlign,
          "data-testid": testId,
          ...ariaProps,
        };

        if (href === undefined || disabled) {
          return (
            <ArkTabs.Trigger key={id} {...triggerProps}>
              {children}
            </ArkTabs.Trigger>
          );
        }

        return (
          <ArkTabs.Trigger key={id} {...triggerProps} asChild>
            <a href={href} draggable={false}>
              {children}
            </a>
          </ArkTabs.Trigger>
        );
      })}
    </ArkTabs.List>
  );

  const wrapper = (
    <div ref={wrapperRef} className={cx(classes.wrapper, className)}>
      {list}
      {actions !== undefined && (
        <div className={classes.actions}>{actions}</div>
      )}
    </div>
  );

  if (hasRoot) {
    return wrapper;
  }

  return (
    <ArkTabs.Root value={selected ?? null} orientation={orientation}>
      {wrapper}
    </ArkTabs.Root>
  );
};

// Stable name for the docs Stage code serializer under minification
TabList.displayName = "Tabs.TabList";
