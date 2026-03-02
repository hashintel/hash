import { Collapsible } from "@ark-ui/react/collapsible";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { FaChevronUp } from "react-icons/fa6";

import { InfoIconTooltip } from "./tooltip";

// -- SectionList (wrapper) --------------------------------------------------

const sectionListStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  "& > *:not(:last-child)": {
    borderBottom: "[1px solid rgba(0, 0, 0, 0.06)]",
  },
});

interface SectionListProps {
  children: ReactNode;
}

export const SectionList = ({ children }: SectionListProps) => (
  <div className={sectionListStyle}>{children}</div>
);

// -- Section -----------------------------------------------------------------

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
  py: "[12px]",
});

const fillHeightSectionStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

const headerLeftStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  flex: "[1]",
});

const titleStyle = css({
  fontWeight: "[600]",
  fontSize: "[14px]",
  lineHeight: "[14px]",
  color: "[#404040]",
});

const triggerButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[20px]",
  borderRadius: "[6px]",
  cursor: "pointer",
  background: "[transparent]",
  border: "[none]",
  color: "[#646464]",
  padding: "[0]",
  "& svg": {
    transition: "[transform 150ms ease-out]",
  },
  "&[data-state=closed] svg": {
    transform: "[rotate(180deg)]",
  },
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
  pl: "[8px]",
});

const fillHeightContentStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

interface SectionProps {
  title: string;
  tooltip?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  fillHeight?: boolean;
  renderHeaderAction?: () => ReactNode;
  children: ReactNode;
  className?: string;
}

export const Section = ({
  title,
  tooltip,
  collapsible = false,
  defaultOpen = true,
  fillHeight = false,
  renderHeaderAction,
  children,
  className,
}: SectionProps) => {
  const headerLeft = (
    <div className={headerLeftStyle}>
      <span className={titleStyle}>{title}</span>
      {tooltip && <InfoIconTooltip tooltip={tooltip} />}
    </div>
  );

  if (collapsible) {
    return (
      <Collapsible.Root
        defaultOpen={defaultOpen}
        className={cx(sectionStyle, className)}
      >
        <div className={headerStyle}>
          {headerLeft}
          <Collapsible.Trigger className={triggerButtonStyle}>
            <FaChevronUp size={10} />
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content>
          <div className={contentStyle}>{children}</div>
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <div
      className={cx(
        sectionStyle,
        fillHeight && fillHeightSectionStyle,
        className,
      )}
    >
      <div className={headerStyle}>
        {headerLeft}
        {renderHeaderAction && <div>{renderHeaderAction()}</div>}
      </div>
      <div className={cx(contentStyle, fillHeight && fillHeightContentStyle)}>
        {children}
      </div>
    </div>
  );
};
