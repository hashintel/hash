import { css, cva } from "@hashintel/ds-helpers/css";

import { InfoIconTooltip } from "../../info-icon-tooltip";

import type { SubView } from "../types";

const tabsContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  overflow: "hidden",
});

const tabButtonStyle = cva({
  base: {
    fontSize: "[11px]",
    fontWeight: "medium",
    padding: "[4px 0 4px 10px]",
    textTransform: "uppercase",
    borderRadius: "xs",
    border: "none",
    cursor: "pointer",
    transition: "[all 0.3s ease]",
    background: "[transparent]",
    minWidth: "[0]",
  },
  variants: {
    active: {
      true: {
        opacity: "[1]",
        backgroundColor: "[rgba(0, 0, 0, 0.08)]",
        color: "neutral.s125",
      },
      false: {
        opacity: "[0.6]",
        color: "neutral.s105",
        _hover: {
          opacity: "[1]",
          backgroundColor: "[rgba(0, 0, 0, 0.04)]",
          color: "neutral.s115",
        },
      },
    },
  },
});

/**
 * When a tab is too narrow for its label, the text is clipped (no wrap, no
 * ellipsis) and fades out on the right via a mask, so it blends into whatever
 * background is behind it (panel glass or the active-tab pill). The trailing
 * padding replaces the button's own right padding: labels that fit never
 * reach the faded zone.
 */
const tabButtonLabelStyle = css({
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  paddingRight: "[10px]",
  maskImage:
    "[linear-gradient(to right, black calc(100% - 10px), transparent)]",
});

const contentStyle = cva({
  base: {
    fontSize: "xs",
    flex: "[1]",
    overflowY: "auto",
  },
  variants: {
    padded: {
      // Includes the 4px that previously came from the outer panel container,
      // so padded subviews keep the same visual inset.
      true: { padding: "[16px]" },
      false: { padding: "0" },
    },
  },
  defaultVariants: { padded: true },
});

interface TabButtonProps {
  subView: SubView;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({
  subView,
  isActive,
  onClick,
}) => {
  const tabId = `tab-${subView.id}`;
  const tabpanelId = `tabpanel-${subView.id}`;

  return (
    <button
      type="button"
      id={tabId}
      onClick={onClick}
      className={tabButtonStyle({ active: isActive })}
      aria-selected={isActive}
      aria-controls={tabpanelId}
      role="tab"
    >
      <span className={tabButtonLabelStyle}>
        {subView.title}
        {subView.tooltip && <InfoIconTooltip tooltip={subView.tooltip} />}
      </span>
    </button>
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
 * Returns the header action for the currently active tab.
 * Used to render custom actions (like add buttons) in the panel header.
 */
export const HorizontalTabsHeaderAction: React.FC<{
  subViews: SubView[];
  activeTabId: string;
}> = ({ subViews, activeTabId }) => {
  const activeSubView =
    subViews.find((sv) => sv.id === activeTabId) ?? subViews[0];

  if (!activeSubView?.renderHeaderAction) {
    return null;
  }

  return <>{activeSubView.renderHeaderAction()}</>;
};

/**
 * Renders just the content portion of the horizontal tabs.
 * Useful when you need to compose the content separately from the tabs header.
 */
export const HorizontalTabsContent: React.FC<{
  subViews: SubView[];
  activeTabId: string;
}> = ({ subViews, activeTabId }) => {
  const activeSubView =
    subViews.find((sv) => sv.id === activeTabId) ?? subViews[0];

  if (!activeSubView) {
    return null;
  }

  const Component = activeSubView.component;

  const tabpanelId = `tabpanel-${activeTabId}`;
  const tabId = `tab-${activeTabId}`;

  return (
    <div
      id={tabpanelId}
      className={contentStyle({ padded: !activeSubView.noPadding })}
      role="tabpanel"
      aria-labelledby={tabId}
    >
      <Component />
    </div>
  );
};
