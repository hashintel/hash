/**
 * figma-ds Toast (`42311:29857`), its inverted type: a dark 360 px card at the bottom of the page, 16 px padding,
 * 12 px radius, a 16 px icon, the words, an optional 24 px action under them, and a 20 px × in the top corner. It
 * closes itself after six seconds.
 */
import { useEffect } from "react";

import { Button, Icon } from "@hashintel/ds-components";
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
  width: "[360px]",
  maxWidth: "[calc(100vw - 32px)]",
  padding: "4",
  paddingRight: "8",
  borderRadius: "xl",
  backgroundColor: "neutral.fg.heading",
  color: "neutral.fg.onSolid",
  textStyle: "sm",
  boxShadow:
    "[0 10px 16px -3px rgba(0, 0, 0, 0.1), 0 -4px 6px -2px rgba(0, 0, 0, 0.03)]",
});

const iconStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[14px]",
  flexShrink: 0,
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "3",
  flex: "1",
  minWidth: "[0]",
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  lineHeight: "[14px]",
});

const titleStyle = css({ fontWeight: "medium" });

const descriptionStyle = css({ opacity: "[0.9]" });

const closeStyle = css({
  all: "unset",
  position: "absolute",
  top: "[6px]",
  right: "[6px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[20px]",
  borderRadius: "[2px]",
  cursor: "pointer",
  color: "neutral.fg.muted",
  _hover: { color: "neutral.fg.onSolid" },
  _focusVisible: { color: "neutral.fg.onSolid" },
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
      <span className={iconStyle}>
        <Icon name="circleCheck" size="sm" />
      </span>
      <div className={contentStyle}>
        <div className={textStyle}>
          <span className={titleStyle}>{text}</span>
          {description ? (
            <span className={descriptionStyle}>{description}</span>
          ) : null}
        </div>
        {action ? (
          <Button
            size="xs"
            variant="subtle"
            tone="neutral"
            onClick={() => {
              onAction?.();
              onDone();
            }}
          >
            {action}
          </Button>
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
