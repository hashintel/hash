import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { CodeViewTarget } from "../views/shared/code-view/context";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "0",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
  paddingX: "2",
  paddingY: "2",
  borderBottomWidth: "thin",
  borderColor: "neutral.a20",
  backgroundColor: "neutral.s00",
});

const titleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
});

const codeStyle = css({
  flex: "1",
  minWidth: "0",
  minHeight: "0",
  overflow: "auto",
  margin: "0",
  padding: "3",
  fontFamily: "mono",
  fontSize: "[12px]",
  lineHeight: "[1.6]",
  color: "neutral.fg.body",
  tabSize: "2",
  // Wrapped, not scrolled sideways: the panel is narrow and a reader should
  // not have to drag to reach the end of a comment. Indentation is preserved.
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  // Code is the one thing in an embed a reader wants to take away, so it
  // opts back out of the embed's blanket `user-select: none`.
  userSelect: "text",
});

const emptyStyle = css({
  padding: "3",
  fontSize: "sm",
  color: "neutral.s95",
});

/**
 * One piece of the model's code, as it is written.
 *
 * Deliberately a `pre` and nothing more: no editing, no highlighting, no
 * language tooling. The preview mounts none of that, and the point here is to
 * let a reader see what drives the net.
 */
export const PreviewCodeView = ({
  target: { title, code },
  onBack,
}: {
  target: CodeViewTarget;
  onBack: () => void;
}) => (
  <div className={containerStyle}>
    <div className={headerStyle}>
      <Button
        size="xs"
        variant="ghost"
        iconName="chevronLeft"
        aria-label="Back to properties"
        tooltip="Back to properties"
        onClick={onBack}
      />
      <span className={titleStyle}>{title}</span>
    </div>
    {code.trim() ? (
      <pre className={codeStyle}>{code}</pre>
    ) : (
      <div className={emptyStyle}>This part of the model carries no code.</div>
    )}
  </div>
);
