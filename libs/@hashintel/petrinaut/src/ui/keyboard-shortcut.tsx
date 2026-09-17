import { Tooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { formatShortcutKeys } from "../react/commands/format-shortcut";

import type { ReactNode } from "react";

const shortcutStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "[3px]",
  flexShrink: "0",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
});

const keyStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "[20px]",
    height: "[20px]",
    paddingInline: "1",
    fontFamily: "mono",
    fontSize: "xs",
    fontWeight: "normal",
    lineHeight: "[1]",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderRadius: "[3px]",
  },
  variants: {
    tone: {
      default: {
        color: "neutral.s110",
        backgroundColor: "neutral.s10",
        borderColor: "neutral.s50",
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
}: {
  shortcut: string;
  tone?: "default" | "inverse";
}) => (
  <span className={shortcutStyle} aria-hidden>
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
