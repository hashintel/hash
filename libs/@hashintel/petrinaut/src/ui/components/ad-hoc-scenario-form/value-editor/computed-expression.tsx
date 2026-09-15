import { Portal } from "@ark-ui/react/portal";
import { useLayoutEffect, useState } from "react";

import { usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../overlay-scroll-area";

const expressionStyle = css({
  position: "fixed",
  zIndex: "popover",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.s00",
  color: "neutral.fg.body",
  border: "[1px solid {colors.blue.s70}]",
  borderRadius: "xs",
  boxShadow: "[0 3px 12px -4px rgba(0,0,0,0.18)]",
  pointerEvents: "auto",
});
const codeStyle = css({
  margin: "[0]",
  paddingX: "2",
  paddingY: "1",
  fontFamily: "mono",
  fontSize: "[12px]",
  lineHeight: "[18px]",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  userSelect: "text",
});

export const ComputedExpression: React.FC<{
  id: string;
  expression: string;
  anchorRef: React.RefObject<HTMLElement | null>;
}> = ({ id, expression, anchorRef }) => {
  const portalContainerRef = usePortalContainerRef();
  const [bounds, setBounds] = useState<{
    top: number;
    left: number;
    width: number;
    minHeight: number;
    maxHeight: number;
  } | null>(null);
  const [visible, setVisible] = useState(true);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const longestLine = Math.max(
        ...expression.split("\n").map((line) => line.length),
      );
      const width = Math.min(
        window.innerWidth - 16,
        Math.max(rect.width, Math.min(560, longestLine * 7.3 + 18)),
      );
      setBounds({
        top: rect.top,
        left: Math.max(
          8,
          rect.left + width <= window.innerWidth - 8
            ? rect.left
            : rect.right - width,
        ),
        width,
        minHeight: rect.height,
        maxHeight: Math.max(
          rect.height,
          Math.min(240, window.innerHeight - rect.top - 8),
        ),
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(anchor);
    const intersection = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? false),
    );
    intersection.observe(anchor);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();
    return () => {
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef, expression]);

  return bounds && visible ? (
    <Portal container={portalContainerRef}>
      <div
        data-computed-expression
        className={expressionStyle}
        onPointerDown={(event) => event.preventDefault()}
        style={bounds}
      >
        <OverlayScrollArea>
          <pre id={id} className={codeStyle}>
            {expression}
          </pre>
        </OverlayScrollArea>
      </div>
    </Portal>
  ) : null;
};
