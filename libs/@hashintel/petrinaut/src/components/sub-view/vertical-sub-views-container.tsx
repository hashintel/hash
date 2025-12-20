import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../tooltip";
import type { SubView } from "./types";

const sectionContainerStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[8px]",
  },
  variants: {
    flexGrow: {
      true: {
        flex: "[1]",
        minHeight: "[0]",
      },
      false: {
        paddingBottom: "[16px]",
      },
    },
  },
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

const sectionToggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontWeight: 600,
  fontSize: "[13px]",
  color: "[#333]",
  cursor: "pointer",
  background: "[transparent]",
  border: "none",
  padding: "spacing.1",
  borderRadius: "radius.4",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const contentContainerStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[2px]",
    overflowY: "auto",
  },
  variants: {
    flexGrow: {
      true: {
        flex: "[1]",
      },
      false: {
        maxHeight: "[200px]",
      },
    },
  },
});

interface VerticalSubViewSectionProps {
  subView: SubView;
  defaultExpanded?: boolean;
  isLast?: boolean;
}

/**
 * A single collapsible section within the vertical container.
 */
const VerticalSubViewSection: React.FC<VerticalSubViewSectionProps> = ({
  subView,
  defaultExpanded = true,
  isLast = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const {
    id,
    title,
    tooltip,
    component: Component,
    renderHeaderAction,
    flexGrow = false,
  } = subView;

  // Last item should grow if it has flexGrow, but shouldn't have bottom border
  const effectiveFlexGrow = isLast ? flexGrow : false;

  return (
    <div
      className={sectionContainerStyle({
        flexGrow: effectiveFlexGrow || (isLast && !flexGrow),
      })}
    >
      <div className={headerRowStyle}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={sectionToggleButtonStyle}
          aria-expanded={isExpanded}
          aria-controls={`subview-content-${id}`}
        >
          {isExpanded ? (
            <FaChevronDown size={10} />
          ) : (
            <FaChevronRight size={10} />
          )}
          <span>
            {title}
            {tooltip && <InfoIconTooltip tooltip={tooltip} />}
          </span>
        </button>
        {renderHeaderAction?.()}
      </div>

      {isExpanded && (
        <div
          id={`subview-content-${id}`}
          className={contentContainerStyle({ flexGrow: effectiveFlexGrow })}
        >
          <Component />
        </div>
      )}
    </div>
  );
};

interface VerticalSubViewsContainerProps {
  /** Array of subviews to display as collapsible sections */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Container that displays subviews as vertically stacked collapsible sections.
 * Used in the LeftSideBar for Token Types, Differential Equations, and Nodes.
 */
export const VerticalSubViewsContainer: React.FC<
  VerticalSubViewsContainerProps
> = ({ subViews, defaultExpanded = true }) => {
  return (
    <>
      {subViews.map((subView, index) => (
        <VerticalSubViewSection
          key={subView.id}
          subView={subView}
          defaultExpanded={defaultExpanded}
          isLast={index === subViews.length - 1}
        />
      ))}
    </>
  );
};
