import { useCallback, useRef, useState } from "react";

import { useResizeDrag } from "../../../resize/use-resize-drag";
import type { SubView } from "../types";
import {
  contentInnerStyle,
  HEADER_HEIGHT,
  MIN_SECTION_HEIGHT,
  proportionalContainerStyle,
  proportionalContentAnimationWrapperStyle,
  proportionalContentStyle,
  proportionalSectionWrapperStyle,
  sashStyle,
} from "./proportional-sub-views-container.styles";
import { SubViewHeader } from "./sub-view-header";

interface ProportionalSubViewsContainerProps {
  /** Array of subviews to display */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Proportional container that fills available space.
 *
 * Each section's size is defined by a "split ratio": the fraction of
 * (this section + all sections below) that goes to this section.
 * This means collapsing a section only affects sections below it —
 * sections above keep their absolute height unchanged.
 *
 * When all sections below a given section are collapsed, the remaining
 * space is left empty (spacer) rather than expanding the section.
 */
export const ProportionalSubViewsContainer: React.FC<
  ProportionalSubViewsContainerProps
> = ({ subViews, defaultExpanded = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(subViews.map((sv) => [sv.id, defaultExpanded])),
  );

  // Split ratio per section: fraction of "this + everything below" that this section gets.
  // Default: 1/(N-i) gives equal distribution (e.g. 1/3, 1/2, 1 for three sections).
  const [ratios, setRatios] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      subViews.map((sv, i) => [sv.id, 1 / (subViews.length - i)]),
    ),
  );

  // Resize state — tracks which section's sash is being dragged
  const [resizingSectionId, setResizingSectionId] = useState<string | null>(
    null,
  );
  const resizingSectionIdRef = useRef<string | null>(null);
  /** Pixel height of this section + all expanded sections below at resize start */
  const resizeGroupHeight = useRef(0);
  /** Pixel height of the section being resized at resize start */
  const resizeSectionHeight = useRef(0);

  const onDrag = useCallback((delta: number) => {
    const sectionId = resizingSectionIdRef.current;
    if (sectionId === null) {
      return;
    }

    const groupHeight = resizeGroupHeight.current;
    if (groupHeight <= 0) {
      return;
    }

    const newSectionHeight = resizeSectionHeight.current + delta;
    let newRatio = newSectionHeight / groupHeight;

    // Clamp so both the section and the below group keep minimum size
    const minSize = MIN_SECTION_HEIGHT + HEADER_HEIGHT;
    newRatio = Math.max(
      minSize / groupHeight,
      Math.min(1 - minSize / groupHeight, newRatio),
    );

    setRatios((prev) => ({ ...prev, [sectionId]: newRatio }));
  }, []);

  const onDragEnd = useCallback(() => {
    resizingSectionIdRef.current = null;
    setResizingSectionId(null);
  }, []);

  const { isResizing, handleMouseDown } = useResizeDrag({
    onDrag,
    onDragEnd,
    direction: "vertical",
  });

  const handleSashMouseDown = useCallback(
    (sectionId: string) => (event: React.MouseEvent) => {
      const sectionIndex = subViews.findIndex((sv) => sv.id === sectionId);
      if (sectionIndex === -1) {
        return;
      }

      // Measure this section's pixel height
      const sectionEl = document.getElementById(`subview-section-${sectionId}`);
      const sectionHeight = sectionEl?.getBoundingClientRect().height ?? 200;

      // Sum pixel heights of all expanded sections below
      let belowHeight = 0;
      for (let i = sectionIndex + 1; i < subViews.length; i++) {
        const sv = subViews[i]!;
        if (expandedState[sv.id] ?? defaultExpanded) {
          const el = document.getElementById(`subview-section-${sv.id}`);
          belowHeight += el?.getBoundingClientRect().height ?? 0;
        }
      }

      resizingSectionIdRef.current = sectionId;
      setResizingSectionId(sectionId);
      resizeGroupHeight.current = sectionHeight + belowHeight;
      resizeSectionHeight.current = sectionHeight;

      handleMouseDown(event);
    },
    [subViews, expandedState, defaultExpanded, handleMouseDown],
  );

  const toggleSection = useCallback((id: string) => {
    setExpandedState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Compute flex values from ratios.
  // Each expanded section takes ratio * remaining; collapsed sections are skipped
  // (their share passes through to sections below).
  const flexValues: Record<string, number> = {};
  let remaining = 1.0;
  for (const sv of subViews) {
    if (expandedState[sv.id] ?? defaultExpanded) {
      const ratio = ratios[sv.id] ?? 0.5;
      flexValues[sv.id] = remaining * ratio;
      remaining *= 1 - ratio;
    }
  }
  const spacerFlex = remaining;

  const isCurrentlyResizing = isResizing;

  const expandedIds = subViews
    .filter((sv) => expandedState[sv.id] ?? defaultExpanded)
    .map((sv) => sv.id);

  return (
    <div ref={containerRef} className={proportionalContainerStyle}>
      {subViews.map((subView) => {
        const isExpanded = expandedState[subView.id] ?? defaultExpanded;
        const flexValue = flexValues[subView.id] ?? 0;
        const Component = subView.component;

        const expandedIdx = expandedIds.indexOf(subView.id);
        const isLastExpanded = expandedIdx === expandedIds.length - 1;
        const showSash = isExpanded && !isLastExpanded;

        return (
          <div
            key={subView.id}
            id={`subview-section-${subView.id}`}
            className={proportionalSectionWrapperStyle({
              isExpanded,
              isResizing: isCurrentlyResizing,
            })}
            style={
              isExpanded
                ? {
                    flex: `${flexValue} 1 0%`,
                    minHeight: `${MIN_SECTION_HEIGHT + HEADER_HEIGHT}px`,
                  }
                : undefined
            }
          >
            <SubViewHeader
              id={subView.id}
              title={subView.title}
              tooltip={subView.tooltip}
              isExpanded={isExpanded}
              onToggle={() => toggleSection(subView.id)}
              renderHeaderAction={subView.renderHeaderAction}
            />

            <div
              className={proportionalContentAnimationWrapperStyle({
                isExpanded,
                isResizing: isCurrentlyResizing,
              })}
            >
              <div className={contentInnerStyle}>
                <div
                  id={`subview-content-${subView.id}`}
                  className={proportionalContentStyle}
                >
                  <Component />
                </div>
              </div>
            </div>

            {showSash && (
              <button
                type="button"
                aria-label="Resize sections"
                className={sashStyle({
                  isResizing: resizingSectionId === subView.id,
                })}
                onMouseDown={handleSashMouseDown(subView.id)}
              />
            )}
          </div>
        );
      })}

      {/* Spacer absorbs remaining flex when trailing sections are collapsed */}
      <div style={{ flex: spacerFlex, minHeight: 0 }} />
    </div>
  );
};
