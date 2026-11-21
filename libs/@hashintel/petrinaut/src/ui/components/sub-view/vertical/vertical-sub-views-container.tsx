import { Fragment } from "react";
import { Panel, Separator } from "react-resizable-panels";

import { css, cx } from "@hashintel/ds-helpers/css";

import { useUserSettings } from "../../../../react/state/user-settings-context";
import { dragStripStyle } from "../../../resize/edge-separator-style";
import { ResizeGroup } from "../../../resize/resize-group";
import { SubViewContent } from "./vertical-sub-views-container/sub-view-content";
import { SubViewHeader } from "./vertical-sub-views-container/sub-view-header";
import { useDebouncedHeightSave } from "./vertical-sub-views-container/use-debounced-height-save";
import { useHeldWhile } from "./vertical-sub-views-container/use-held-while";
import { useSubViewMaximization } from "./vertical-sub-views-container/use-sub-view-maximization";
import { useTransientTransition } from "./vertical-sub-views-container/use-transient-transition";

import type { SubViewSectionSettings } from "../../../../react/state/user-settings-context";
import type { SubView } from "../types";

/** Height of the header row in pixels */
const HEADER_HEIGHT = 44;

/** Default minimum panel height when no per-subview minHeight is set */
const DEFAULT_MIN_PANEL_HEIGHT = 100;

const fineGrabSize = 10;
const coarseGrabSize = 20;

/**
 * How tall the strip around a section's separator is that a pointer can grab,
 * in pixels: for a mouse and for a finger. The group takes this as its
 * `resizeTargetMinimumSize`, so that the library takes a press where the
 * strip shows the cursor.
 */
const grabSize = { fine: fineGrabSize, coarse: coarseGrabSize };

const containerStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
});

const expandedSectionStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "[1]",
  backgroundColor: "neutral.s00",
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

const sectionMotionStyle = css({
  transition: "[opacity 180ms ease-out]",
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

/**
 * The separator between two sections is a line: its top border. `::before` is
 * the strip a pointer grabs, around the line, which shows the cursor.
 */
const resizeHandleStyle = css({
  position: "relative",
  borderTopWidth: "thin",
  borderTopColor:
    "[var(--petrinaut-panel-divider-color, {colors.neutral.a20})]",
  cursor: "ns-resize",
  "--grab-size": `[${fineGrabSize}px]`,
  "@media (pointer: coarse)": {
    "--grab-size": `[${coarseGrabSize}px]`,
  },
  _before: {
    content: '""',
    position: "absolute",
    insetInline: "[0]",
    top: "[calc(var(--grab-size) / -2)]",
    height: "[var(--grab-size)]",
  },
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

const isCollapsedIn = (
  settings: Record<string, SubViewSectionSettings> | undefined,
  subView: SubView,
): boolean =>
  settings?.[subView.id]?.collapsed ?? subView.defaultCollapsed ?? false;

interface VerticalSubViewsContainerProps {
  /** Unique name used as a key in UserSettingsContext to persist section state */
  name: string;
  /** Array of subviews to display */
  subViews: SubView[];
}

/**
 * Vertical container that fills available space.
 * Uses react-resizable-panels for drag-to-resize between sections.
 * Each section can be collapsed by clicking its header.
 */
export const VerticalSubViewsContainer: React.FC<
  VerticalSubViewsContainerProps
> = ({ name, subViews }) => {
  // By selector: the settings are saved each time a panel opens or closes,
  // and every section of this panel renders with this component.
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const containerSettings = useUserSettings(
    (settings) => settings.subViewPanels[name],
  );
  const updateSubViewSection = useUserSettings(
    (settings) => settings.updateSubViewSection,
  );
  const {
    containerRef,
    maximizedId,
    isRestoring,
    isArriving,
    maximize,
    restore,
  } = useSubViewMaximization(name, subViews, showAnimations);
  const parentSubView = subViews.find((subView) => subView.main);
  const parentTitle = parentSubView?.title ?? "Properties";

  // What opens code in a section expands the section and fills the container
  // with it at once. The other sections show until the section covers them,
  // so the layout they are in holds still until then: expanding the section
  // would give its panel a new height and move every section below the fold.
  const shownSettings = useHeldWhile(isArriving, containerSettings);

  const saveHeight = useDebouncedHeightSave(name, updateSubViewSection);

  const { active: isAnimating, trigger: triggerTransition } =
    useTransientTransition(200);

  const toggleSection = (sv: SubView) => {
    if (showAnimations) {
      triggerTransition();
    }
    updateSubViewSection(name, sv.id, {
      collapsed: !isCollapsedIn(containerSettings, sv),
    });
  };

  const allCollapsed = subViews.every(
    (sv) => !sv.main && isCollapsedIn(shownSettings, sv),
  );

  return (
    <ResizeGroup
      elementRef={containerRef}
      orientation="vertical"
      resizeTargetMinimumSize={grabSize}
      className={cx(containerStyle, isAnimating && panelTransitionStyle)}
      onKeyDown={(event) => {
        if (
          maximizedId !== null &&
          event.key === "Escape" &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          event.stopPropagation();
          restore();
        }
      }}
    >
      {subViews.map((subView, index) => {
        const fillsContainer = maximizedId === subView.id;
        const isHidden = maximizedId !== null && !fillsContainer;
        const isMain = subView.main ?? false;
        const isExpanded = isMain || !isCollapsedIn(shownSettings, subView);
        const minSize =
          subView.resizable?.minHeight ?? DEFAULT_MIN_PANEL_HEIGHT;

        return (
          <Fragment key={subView.id}>
            <Panel
              id={subView.id}
              defaultSize={containerSettings?.[subView.id]?.height}
              onResize={({ inPixels }) => {
                // A collapsed section is as tall as its header: not a height
                // to restore.
                if (inPixels > HEADER_HEIGHT) {
                  saveHeight(subView.id, inPixels);
                }
              }}
              minSize={isExpanded ? minSize : HEADER_HEIGHT}
              maxSize={isExpanded ? undefined : HEADER_HEIGHT}
            >
              <div
                className={cx(
                  sectionWrapperStyle,
                  showAnimations && sectionMotionStyle,
                  fillsContainer && expandedSectionStyle,
                )}
                style={isHidden && !isRestoring ? { opacity: 0 } : undefined}
                data-subview-section
                data-subview-id={subView.id}
                inert={isHidden}
                aria-hidden={isHidden || undefined}
                data-expanded-subview={fillsContainer || undefined}
                data-subview-full-width-code={
                  subView.fullWidthCodeEditor ||
                  (fillsContainer && !isRestoring) ||
                  undefined
                }
                data-subview-animate={showAnimations || undefined}
              >
                <SubViewHeader
                  subView={subView}
                  main={isMain || fillsContainer}
                  isExpanded={fillsContainer || isExpanded}
                  onToggle={() => toggleSection(subView)}
                  parentTitle={parentTitle}
                  parentIcon={parentSubView?.icon}
                  onRestore={fillsContainer ? restore : undefined}
                  onExpand={
                    subView.canMaximize && !fillsContainer
                      ? () => maximize(subView.id)
                      : undefined
                  }
                />

                <SubViewContent
                  subView={subView}
                  visible={fillsContainer || isExpanded}
                />
              </div>
            </Panel>

            {index < subViews.length - 1 && (
              <Separator
                className={cx(resizeHandleStyle, dragStripStyle)}
                style={
                  maximizedId !== null ? { visibility: "hidden" } : undefined
                }
                disabled={maximizedId !== null}
              />
            )}
          </Fragment>
        );
      })}

      {/* Spacer absorbs remaining space when panels are collapsed */}
      <Panel minSize={0} maxSize={allCollapsed ? "100%" : 0} />
    </ResizeGroup>
  );
};
