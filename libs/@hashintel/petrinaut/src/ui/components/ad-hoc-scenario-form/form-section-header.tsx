import { css } from "@hashintel/ds-helpers/css";

import { FocusStack } from "../../worksheet/focus-stack";
import { PointerHelpTooltip } from "../pointer-help-tooltip";
import { StackedSectionHeader } from "../stacked-sections";

const headerStyle = css({
  position: "sticky",
  top: "[0]",
  zIndex: "[2]",
  display: "flex",
  alignItems: "center",
  gap: "1",
  minHeight: "[28px]",
  paddingY: "1",
  backgroundColor: "neutral.s00",
});
const titleStyle = css({
  fontSize: "[var(--form-heading-size, 12px)]",
  fontWeight: "semibold",
  color: "neutral.a100",
  textTransform: "[var(--form-heading-case, none)]",
  letterSpacing: "[var(--form-heading-spacing, normal)]",
});
const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  marginLeft: "auto",
});

export const FormSectionHeader: React.FC<{
  title: string;
  tooltip?: string;
  spaceBefore?: boolean;
  children?: React.ReactNode;
}> = ({ title, tooltip, spaceBefore, children }) => (
  <StackedSectionHeader className={headerStyle} spaceBefore={spaceBefore}>
    {(renderTitle) => (
      <>
        {renderTitle(title, titleStyle)}
        {tooltip ? <PointerHelpTooltip content={tooltip} /> : null}
        {children ? (
          <div className={actionsStyle}>
            <FocusStack axis="horizontal">{children}</FocusStack>
          </div>
        ) : null}
      </>
    )}
  </StackedSectionHeader>
);
