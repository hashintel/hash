import { css, cva } from "@hashintel/ds-helpers/css";

import { InfoIconTooltip } from "../tooltip";
import type { SubView } from "./types";

const tabsContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
});

const tabButtonStyle = cva({
  base: {
    fontSize: "[11px]",
    fontWeight: "[500]",
    padding: "[4px 10px]",
    textTransform: "uppercase",
    borderRadius: "[3px]",
    border: "none",
    cursor: "pointer",
    transition: "[all 0.3s ease]",
    background: "[transparent]",
  },
  variants: {
    active: {
      true: {
        opacity: "[1]",
        backgroundColor: "[rgba(0, 0, 0, 0.08)]",
        color: "core.gray.90",
      },
      false: {
        opacity: "[0.6]",
        color: "core.gray.60",
        _hover: {
          opacity: "[1]",
          backgroundColor: "[rgba(0, 0, 0, 0.04)]",
          color: "core.gray.80",
        },
      },
    },
  },
});

const contentStyle = css({
  fontSize: "[12px]",
  padding: "[12px 12px]",
  flex: "[1]",
  overflowY: "auto",
});

interface TabButtonProps {
  subView: SubView;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ subView, isActive, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={tabButtonStyle({ active: isActive })}
      aria-selected={isActive}
      role="tab"
    >
      {subView.title}
      {subView.tooltip && <InfoIconTooltip tooltip={subView.tooltip} />}
    </button>
  );
};

interface HorizontalTabsContainerProps {
  /** Array of subviews to display as tabs */
  subViews: SubView[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** Callback when a tab is selected */
  onTabChange: (tabId: string) => void;
}

/**
 * Container that displays subviews as horizontal tabs.
 * Used in the BottomPanel for Diagnostics, Parameters, and Simulation Settings.
 *
 * This component returns both the tabs header and the content area as separate
 * parts that can be composed into the parent layout.
 */
export const HorizontalTabsContainer: React.FC<HorizontalTabsContainerProps> = ({
  subViews,
  activeTabId,
  onTabChange,
}) => {
  const activeSubView = subViews.find((sv) => sv.id === activeTabId) ?? subViews[0];

  if (!activeSubView) {
    return null;
  }

  const Component = activeSubView.component;

  return (
    <>
      {/* Tab Header */}
      <div className={tabsContainerStyle} role="tablist">
        {subViews.map((subView) => (
          <TabButton
            key={subView.id}
            subView={subView}
            isActive={activeTabId === subView.id}
            onClick={() => onTabChange(subView.id)}
          />
        ))}
      </div>

      {/* Content */}
      <div className={contentStyle} role="tabpanel" aria-labelledby={activeTabId}>
        <Component />
      </div>
    </>
  );
};

/**
 * Renders just the tab bar portion of the horizontal tabs.
 * Useful when you need to compose the tabs header separately from the content.
 */
export const HorizontalTabsHeader: React.FC<{
  subViews: SubView[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}> = ({ subViews, activeTabId, onTabChange }) => {
  return (
    <div className={tabsContainerStyle} role="tablist">
      {subViews.map((subView) => (
        <TabButton
          key={subView.id}
          subView={subView}
          isActive={activeTabId === subView.id}
          onClick={() => onTabChange(subView.id)}
        />
      ))}
    </div>
  );
};

/**
 * Renders just the content portion of the horizontal tabs.
 * Useful when you need to compose the content separately from the tabs header.
 */
export const HorizontalTabsContent: React.FC<{
  subViews: SubView[];
  activeTabId: string;
}> = ({ subViews, activeTabId }) => {
  const activeSubView = subViews.find((sv) => sv.id === activeTabId) ?? subViews[0];

  if (!activeSubView) {
    return null;
  }

  const Component = activeSubView.component;

  return (
    <div className={contentStyle} role="tabpanel" aria-labelledby={activeTabId}>
      <Component />
    </div>
  );
};

