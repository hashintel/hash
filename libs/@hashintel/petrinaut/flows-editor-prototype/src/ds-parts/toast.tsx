/**
 * The design system's light toast, sized to its content (TOAST-DS-FIT, Paper 2BYM-0): a flat #F9F9F9 card, 1 px
 * border, 12 px padding and radius, an 8 px gap, a 16 px info icon 6 px before 14/22 semibold #404040 text, the
 * action as a 28 px white button with a border 16 px after the text, and a round 24 px × centred on the right. One
 * line; the width follows the content. It closes itself after six seconds.
 */
import { useEffect } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const toastStyle = css({
  position: "fixed",
  left: "[50%]",
  bottom: "[88px]",
  transform: "[translateX(-50%)]",
  zIndex: "[50]",
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
  width: "[fit-content]",
  maxWidth: "[calc(100vw - 32px)]",
  padding: "3",
  borderRadius: "xl",
  borderWidth: "thin",
  borderStyle: "solid",
  // token-guard: allow Paper 2BYM-0 toast surface, border and shadow (toast.recipe.ts line 88); no DS step is exact.
  backgroundColor: "[#F9F9F9]",
  borderColor: "[#00000017]",
  boxShadow:
    "[#00000008 0px 0px 0px 1px, #0000001F 0px 4px 12px -4px, #00000024 0px 12px 28px -8px]",
  color: "neutral.fg.heading",
  textStyle: "sm",
});

const bodyStyle = css({
  display: "flex",
  alignItems: "center",
  alignSelf: "center",
  flexWrap: "wrap",
  flex: "1",
  minWidth: "[0]",
  columnGap: "4",
  rowGap: "1",
});

const messageStyle = css({
  display: "flex",
  alignItems: "flex-start",
  flexGrow: 1,
  gap: "[6px]",
});

const iconStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  minHeight: "[22px]",
  color: "neutral.s110",
  "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
});

const textStyle = css({
  alignSelf: "center",
  whiteSpace: "pre",
  fontSize: "[14px]",
  lineHeight: "[22px]",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
});

const descriptionStyle = css({ fontWeight: "normal", color: "neutral.fg.muted" });

/** The action: a 28 px white button, 1 px border, 8 px radius, 14/22 medium. */
const actionStyle = css({
  all: "unset",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  height: "[28px]",
  paddingX: "[9px]",
  paddingY: "[2px]",
  borderWidth: "thin",
  borderStyle: "solid",
  // token-guard: allow Paper 2BYM-0 action border #00000026.
  borderColor: "[#00000026]",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
  color: "neutral.fg.heading",
  fontSize: "[14px]",
  lineHeight: "[22px]",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: { outline: "[2px solid var(--colors-neutral-bd-solid)]", outlineOffset: "[1px]" },
});

const closeStyle = css({
  all: "unset",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "center",
  flexShrink: 0,
  width: "[24px]",
  height: "[24px]",
  marginRight: "[-4px]",
  borderRadius: "full",
  cursor: "pointer",
  color: "neutral.fg.heading",
  "& svg": { width: "[16px]", height: "[16px]", "--icon-size": "16px" },
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: { outline: "[2px solid var(--colors-neutral-bd-solid)]", outlineOffset: "[-2px]" },
});

export const Toast = ({
  text,
  description,
  action,
  onAction,
  onDone,
}: {
  text: string;
  description?: string;
  /** The words on the one action button under the text. */
  action?: string;
  onAction?: () => void;
  onDone: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div className={toastStyle} role="status" data-toast>
      <div className={bodyStyle}>
        <div className={messageStyle}>
          <span className={iconStyle}>
            <Icon name="info" size="sm" />
          </span>
          <span className={textStyle}>
            {text}
            {description ? (
              <span className={descriptionStyle}> {description}</span>
            ) : null}
          </span>
        </div>
        {action ? (
          <button
            type="button"
            className={actionStyle}
            onClick={() => {
              onAction?.();
              onDone();
            }}
          >
            {action}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className={closeStyle}
        aria-label="Close"
        onClick={onDone}
      >
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
};
