import { css, cva, cx } from "@hashintel/ds-helpers/css";
import React, { Fragment, use, useEffect, useRef, useState } from "react";
import { FaChevronRight } from "react-icons/fa6";
import { Group, Panel, Separator } from "react-resizable-panels";

import { UserSettingsContext } from "../../../state/user-settings-context";
import { InfoIconTooltip } from "../../tooltip";
import type { SubView } from "../types";

/** Height of the header row in pixels */
const HEADER_HEIGHT = 44;
/** Size of the icon in the main header */
const HEADER_ICON_SIZE = 16;
/** Default minimum panel height when no per-subview minHeight is set */
const DEFAULT_MIN_PANEL_HEIGHT = 100;

const containerStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

/**
 * Animate programmatic collapse/expand via CSS transition on flex-grow.
 * Only applied after a user toggle so the initial mount doesn't animate.
 * Disabled when a separator is actively being dragged (data-separator="active")
 * so drag-to-resize stays snappy.
 */
const panelTransitionStyle = css({
  "& [data-panel]": {
    transition: "[flex-grow 200ms ease-out]",
  },
  "&:has([data-separator=active]) [data-panel]": {
    transition: "[none]",
  },
});

const sectionWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  overflow: "hidden",

  /* Reveal header actions and info tooltip on hover or focus-within */
  "&:hover [data-header-action], &:focus-within [data-header-action]": {
    opacity: "[1]",
    width: "auto",
    overflow: "visible",
    transition: "[opacity 150ms ease-out]",
  },
  "&:hover [data-info-tooltip], &:focus-within [data-info-tooltip]": {
    opacity: "[1]",
  },
});

const sectionContentStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
});

const scrollContainerStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

const panelContentStyle = css({
  overflowY: "auto",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  // No vertical padding on the scroll container — it would create a gap above
  // sticky section headers (which would pin below the gap). The first sticky
  // header owns its own top spacing.
  px: "4",
});

const SHADOW_HEIGHT = 7;

const scrollShadowStyle = cva({
  base: {
    position: "absolute",
    left: "[0]",
    right: "[0]",
    height: `[${SHADOW_HEIGHT}px]`,
    pointerEvents: "none",
    zIndex: 1,
    opacity: "[0]",
    transition: "[opacity 150ms ease]",
  },
  variants: {
    position: {
      top: {
        top: "[0]",
        background: "[linear-gradient(to bottom, #D0D0D0, #FFFFFF10)]",
      },
      bottom: {
        bottom: "[0]",
        background: "[linear-gradient(to top, #D0D0D0, #FFFFFF10)]",
      },
    },
    visible: {
      true: { opacity: "[0.2]" },
    },
  },
});

const resizeHandleStyle = css({
  borderTopWidth: "thin",
  borderTopColor: "neutral.a20",
  cursor: "ns-resize",
  backgroundColor: "[transparent]",
  transition: "[background-color 0.15s ease]",
  "&[data-separator=hover]": {
    backgroundColor: "neutral.a40",
  },
  "&[data-separator=active]": {
    backgroundColor: "blue.s60",
    outlineWidth: "[2px]",
    outlineStyle: "solid",
    outlineColor: "blue.s20",
  },
});

const headerRowStyle = cva({
  base: {
    height: "11",
    pl: "0.5",
    pr: "2",

    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",

    borderBottomWidth: "thin",
    borderBottomColor: "neutral.a20",
  },
  variants: {
    isCollapsed: {
      true: {
        borderBottomColor: "[transparent]",
      },
    },
  },
});

const mainHeaderRowStyle = css({
  p: "3",
  h: "11",

  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",

  borderBottomWidth: "thin",
  borderBottomColor: "neutral.a20",
});

const headerActionVisibleStyle = css({
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[44px]",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
});

const headerActionStyle = css({
  maxHeight: "[44px]",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  opacity: "[0]",
  width: "[0]",
  overflow: "hidden",
  transition: "[opacity 150ms ease-out, width 0s 150ms]",
});

const sectionToggleStyle = css({
  display: "flex",
  alignItems: "center",
  fontWeight: "medium",
  fontSize: "sm",
  color: "neutral.s100",
  cursor: "pointer",
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",

  /* Reveal the chevron icon on toggle section hover */
  "& [data-toggle-icon]": {
    width: "3.5",
    opacity: "[0]",
  },
  "&:hover [data-toggle-icon]": {
    opacity: "[1]",
  },
});

const sectionToggleLabelStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const sectionToggleIconStyle = css({
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  overflow: "hidden",
  transition:
    "[width 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out]",
});

const sectionToggleIconExpandedStyle = css({
  transform: "[rotate(90deg)]",
});

const infoTooltipWrapperStyle = css({
  opacity: "[0]",
  transition: "[opacity 150ms ease-out]",
});

const mainHeaderContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  pl: "1",
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
});

const headerIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "5",
  color: "neutral.s85",
});

const mainTitleStyle = css({
  fontWeight: "medium",
  fontSize: "sm",
  color: "neutral.s100",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * Temporarily enables a boolean flag for `durationMs` after each call to
 * `trigger()`. Useful for enabling CSS transitions only during programmatic
 * state changes (e.g. collapse/expand) while keeping them disabled during
 * mount, resize, or drag interactions.
 */
const useTransientTransition = (durationMs = 200) => {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const trigger = () => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), durationMs);
  };

  return { active, trigger };
};

/**
 * Wraps children in a scrollable container with top/bottom gradient shadows
 * that fade in when content overflows in that direction.
 */
const ScrollableContent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateShadows = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    updateShadows();

    const observer = new ResizeObserver(updateShadows);
    observer.observe(el);
    for (const child of el.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [updateShadows]);

  return (
    <div className={scrollContainerStyle}>
      <div
        className={scrollShadowStyle({
          position: "top",
          visible: canScrollUp,
        })}
      />
      <div
        ref={scrollRef}
        className={panelContentStyle}
        onScroll={updateShadows}
      >
        {children}
      </div>
      <div
        className={scrollShadowStyle({
          position: "bottom",
          visible: canScrollDown,
        })}
      />
    </div>
  );
};

interface SubViewHeaderProps {
  id: string;
  title: string;
  tooltip?: string;
  icon?: React.ComponentType<{ size: number }>;
  main?: boolean;
  renderTitle?: () => React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  renderHeaderAction?: () => React.ReactNode;
  alwaysShowHeaderAction?: boolean;
}

const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  id,
  title,
  tooltip,
  icon: Icon,
  main = false,
  renderTitle,
  isExpanded,
  onToggle,
  renderHeaderAction,
  alwaysShowHeaderAction,
}) => (
  <div
    className={
      main ? mainHeaderRowStyle : headerRowStyle({ isCollapsed: !isExpanded })
    }
  >
    {main ? (
      <div className={mainHeaderContentStyle}>
        {Icon && (
          <span className={headerIconStyle}>
            <Icon size={HEADER_ICON_SIZE} />
          </span>
        )}
        {renderTitle ? (
          renderTitle()
        ) : (
          <span className={mainTitleStyle}>{title}</span>
        )}
      </div>
    ) : (
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className={sectionToggleStyle}
        aria-expanded={isExpanded}
        aria-controls={`subview-content-${id}`}
      >
        <div
          data-toggle-icon
          className={cx(
            sectionToggleIconStyle,
            isExpanded && sectionToggleIconExpandedStyle,
          )}
        >
          <FaChevronRight size={9} />
        </div>
        <span className={sectionToggleLabelStyle}>
          {title}
          {tooltip && (
            <span data-info-tooltip className={infoTooltipWrapperStyle}>
              <InfoIconTooltip tooltip={tooltip} outlined />
            </span>
          )}
        </span>
      </div>
    )}
    {isExpanded && renderHeaderAction && (
      <div
        {...(!alwaysShowHeaderAction && { "data-header-action": true })}
        className={
          alwaysShowHeaderAction ? headerActionVisibleStyle : headerActionStyle
        }
      >
        {renderHeaderAction()}
      </div>
    )}
  </div>
);

interface VerticalSubViewsContainerProps {
  /** Unique name used as a key in UserSettingsContext to persist section state */
  name: string;
  /** Array of subviews to display */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Vertical container that fills available space.
 * Uses react-resizable-panels for drag-to-resize between sections.
 * Each section can be collapsed by clicking its header.
 */
export const VerticalSubViewsContainer: React.FC<
  VerticalSubViewsContainerProps
> = ({ name, subViews, defaultExpanded = true }) => {
  const { showAnimations, subViewPanels, updateSubViewSection } =
    use(UserSettingsContext);

  const containerSettings = subViewPanels[name];

  const isSectionCollapsed = (sv: SubView): boolean => {
    const saved = containerSettings?.[sv.id];
    if (saved !== undefined) {
      return saved.collapsed;
    }
    return sv.defaultCollapsed ?? !defaultExpanded;
  };

  const getSavedHeight = (id: string): number | undefined =>
    containerSettings?.[id]?.height;

  // Debounce height saves to avoid writing to context on every drag frame
  const heightTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const handleResize = (id: string) => (panelSize: { inPixels: number }) => {
    if (panelSize.inPixels <= HEADER_HEIGHT) {
      return;
    }
    clearTimeout(heightTimers.current[id]);
    heightTimers.current[id] = setTimeout(() => {
      updateSubViewSection(name, id, { height: panelSize.inPixels });
    }, 300);
  };

  const { active: isAnimating, trigger: triggerTransition } =
    useTransientTransition(200);

  const toggleSection = (sv: SubView) => {
    if (showAnimations) {
      triggerTransition();
    }
    updateSubViewSection(name, sv.id, { collapsed: !isSectionCollapsed(sv) });
  };

  const allCollapsed = subViews.every((sv) => {
    const isCollapsible = !sv.main && (sv.collapsible ?? true);
    return isCollapsible && isSectionCollapsed(sv);
  });

  return (
    <Group
      orientation="vertical"
      className={cx(containerStyle, isAnimating && panelTransitionStyle)}
    >
      {subViews.map((subView, index) => {
        const isMain = subView.main ?? false;
        const isCollapsible = !isMain && (subView.collapsible ?? true);
        const isExpanded = !isCollapsible || !isSectionCollapsed(subView);
        const Component = subView.component;
        const minSize =
          subView.resizable?.minHeight ?? DEFAULT_MIN_PANEL_HEIGHT;

        return (
          <Fragment key={subView.id}>
            <Panel
              id={subView.id}
              defaultSize={getSavedHeight(subView.id)}
              onResize={handleResize(subView.id)}
              minSize={isExpanded ? minSize : HEADER_HEIGHT}
              maxSize={isExpanded ? undefined : HEADER_HEIGHT}
            >
              <div className={sectionWrapperStyle}>
                <SubViewHeader
                  id={subView.id}
                  title={subView.title}
                  tooltip={subView.tooltip}
                  icon={subView.icon}
                  main={isMain}
                  renderTitle={subView.renderTitle}
                  isExpanded={isExpanded}
                  onToggle={() => toggleSection(subView)}
                  renderHeaderAction={subView.renderHeaderAction}
                  alwaysShowHeaderAction={subView.alwaysShowHeaderAction}
                />

                {isExpanded && (
                  <div className={sectionContentStyle}>
                    <ScrollableContent>
                      <Component />
                    </ScrollableContent>
                  </div>
                )}
              </div>
            </Panel>

            {index < subViews.length - 1 && (
              <Separator className={resizeHandleStyle} />
            )}
          </Fragment>
        );
      })}

      {/* Spacer absorbs remaining space when panels are collapsed */}
      <Panel minSize={0} maxSize={allCollapsed ? "100%" : 0} />
    </Group>
  );
};
