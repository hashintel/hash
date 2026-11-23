import { useRef } from "react";

import { HelpTooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useKeptScroll } from "../../../../lib/kept-state";

import type { SubView } from "../../../../sub-view/types";

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
  display: "flex",
  alignItems: "center",
  gap: "1",
  whiteSpace: "nowrap",
  overflow: "hidden",
  paddingRight: "[10px]",
  maskImage:
    "[linear-gradient(to right, black calc(100% - 10px), transparent)]",
});

type HorizontalTabView = Pick<SubView, "id" | "title" | "tooltip">;

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
  subView: HorizontalTabView;
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
      aria-label={subView.title}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      aria-controls={tabpanelId}
      role="tab"
    >
      <span className={tabButtonLabelStyle}>
        {subView.title}
        {subView.tooltip && <HelpTooltip content={subView.tooltip} />}
      </span>
    </button>
  );
};

/**
 * Renders just the tab bar portion of the horizontal tabs.
 * Useful when you need to compose the tabs header separately from the content.
 */
export const HorizontalTabsHeader: React.FC<{
  subViews: HorizontalTabView[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}> = ({ subViews, activeTabId, onTabChange }) => {
  return (
    <div
      className={tabsContainerStyle}
      role="tablist"
      tabIndex={-1}
      onKeyDown={(event) => {
        const index = subViews.findIndex((tab) => tab.id === activeTabId);
        let nextIndex: number;
        switch (event.key) {
          case "ArrowRight":
            nextIndex = (index + 1) % subViews.length;
            break;
          case "ArrowLeft":
            nextIndex = (index - 1 + subViews.length) % subViews.length;
            break;
          case "Home":
            nextIndex = 0;
            break;
          case "End":
            nextIndex = subViews.length - 1;
            break;
          default:
            return;
        }
        const next = subViews[nextIndex];
        if (!next) return;
        event.preventDefault();
        onTabChange(next.id);
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>('[role="tab"]')
          [nextIndex]?.focus();
      }}
    >
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
 * The panel a tab controls: scrolled, and padded unless told otherwise. It
 * keeps its scroll offset while it is unmounted.
 */
export const HorizontalTabPanel: React.FC<{
  tabId: string;
  padded?: boolean;
  children: React.ReactNode;
}> = ({ tabId, padded = true, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useKeptScroll(scrollRef, "scroll:tab-panel");

  return (
    <div
      ref={scrollRef}
      id={`tabpanel-${tabId}`}
      className={contentStyle({ padded })}
      role="tabpanel"
      aria-labelledby={`tab-${tabId}`}
    >
      {children}
    </div>
  );
};
