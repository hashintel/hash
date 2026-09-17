import { Tooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { formatShortcutKeys } from "../react/commands/format-shortcut";

import type { ReactNode } from "react";

const shortcutStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "[3px]",
    flexShrink: "0",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  variants: {
    inMenu: {
      true: {
        display: "flex",
        height: "[1lh]",
        "[data-selected] & kbd": {
          backgroundColor: "[transparent]",
        },
        marginInlineEnd:
          "[calc(var(--selectable-list-item-padding-y) + (1lh - 18px) / 2 - var(--selectable-list-item-padding-x))]",
      },
    },
  },
});

const keyStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "[18px]",
    height: "[18px]",
    paddingInline: "1",
    fontFamily: "body",
    fontSize: "[10px]",
    fontWeight: "[450]",
    lineHeight: "[1]",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderRadius: "[3px]",
  },
  variants: {
    tone: {
      default: {
        color: "black/60",
        backgroundColor: "neutral.s10",
        borderColor: "black/15",
      },
      inverse: {
        color: "neutral.s10",
        backgroundColor: "white/10",
        borderColor: "white/30",
      },
    },
  },
  defaultVariants: { tone: "default" },
});

export const KeyboardShortcut = ({
  shortcut,
  tone = "default",
  inMenu = false,
}: {
  shortcut: string;
  tone?: "default" | "inverse";
  inMenu?: boolean;
}) => (
  <span className={shortcutStyle({ inMenu })} aria-hidden>
    {formatShortcutKeys(shortcut).map((key) => (
      <kbd key={key} className={keyStyle({ tone })}>
        {key}
      </kbd>
    ))}
  </span>
);

const tooltipLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  marginInlineEnd: "-1",
});

export const ShortcutTooltip = ({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
}) => (
  <Tooltip
    content={
      shortcut ? (
        <span className={tooltipLabelStyle}>
          {label}
          <KeyboardShortcut shortcut={shortcut} tone="inverse" />
        </span>
      ) : (
        label
      )
    }
  >
    {children}
  </Tooltip>
);
