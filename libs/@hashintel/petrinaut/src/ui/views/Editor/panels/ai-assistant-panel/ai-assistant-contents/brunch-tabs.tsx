import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

type BrunchTab = {
  id: string;
  title: string;
  mark: ReactNode;
  attention?: { count?: number; marker?: boolean };
};

const tabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  minWidth: "[0]",
  padding: "[4px 8px]",
  border: "none",
  borderRadius: "md",
  backgroundColor: "[transparent]",
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
  cursor: "pointer",
  whiteSpace: "nowrap",
  "& [data-mark]": { display: "inline-flex", color: "neutral.s80" },
  "&[aria-selected=true]": {
    backgroundColor: "neutral.bg.subtle",
    color: "neutral.s120",
    "& [data-mark]": { color: "neutral.s90" },
  },
  _hover: { backgroundColor: "neutral.bg.subtle" },
});

/** Conversation-only tabs; stock Petrinaut subview tabs retain their defaults. */
export const BrunchTabs = ({
  subViews,
  activeTabId,
  onTabChange,
  announcement,
}: {
  subViews: BrunchTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  announcement?: string;
}) => (
  <>
    <div
      role="tablist"
      tabIndex={-1}
      className={css({ display: "flex", gap: "1", minWidth: "[0]" })}
      onKeyDown={(event) => {
        const index = subViews.findIndex((tab) => tab.id === activeTabId);
        const nextIndex =
          event.key === "ArrowRight"
            ? (index + 1) % subViews.length
            : event.key === "ArrowLeft"
              ? (index - 1 + subViews.length) % subViews.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? subViews.length - 1
                  : undefined;
        if (nextIndex === undefined) return;
        const next = subViews[nextIndex];
        if (!next) return;
        event.preventDefault();
        onTabChange(next.id);
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>('[role="tab"]')
          [nextIndex]?.focus();
      }}
    >
      {subViews.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-controls={`tabpanel-${tab.id}`}
          aria-label={tab.title}
          aria-selected={activeTabId === tab.id}
          tabIndex={activeTabId === tab.id ? 0 : -1}
          className={tabStyle}
          onClick={() => onTabChange(tab.id)}
        >
          <span data-mark aria-hidden="true">
            {tab.mark}
          </span>
          {tab.title}
          {tab.attention?.count || tab.attention?.marker ? (
            <span
              aria-hidden="true"
              data-attention
              className={css({
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "[6px]",
                height: "[6px]",
                borderRadius: "full",
                backgroundColor: "blue.s90",
                color: "white",
                fontSize: "[9px]",
                "&[data-count=true]": {
                  minWidth: "[16px]",
                  height: "[16px]",
                  paddingX: "1",
                },
              })}
              data-count={Boolean(tab.attention.count)}
            >
              {tab.attention.count
                ? tab.attention.count > 9
                  ? "9+"
                  : tab.attention.count
                : null}
            </span>
          ) : null}
        </button>
      ))}
    </div>
    <span
      role="status"
      aria-live="polite"
      className={css({
        position: "absolute",
        width: "[1px]",
        height: "[1px]",
        overflow: "hidden",
        clipPath: "[inset(50%)]",
        whiteSpace: "nowrap",
      })}
    >
      {announcement}
    </span>
  </>
);
