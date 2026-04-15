import { Collapsible } from "@ark-ui/react/collapsible";
import { css, cx } from "@hashintel/ds-helpers/css";
import { type ReactNode, use } from "react";
import { FaChevronUp } from "react-icons/fa6";

import { UserSettingsContext } from "../state/user-settings-context";
import { IconButton } from "./icon-button";
import { InfoIconTooltip } from "./tooltip";

// -- SectionList (wrapper) --------------------------------------------------

const sectionListStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  "& > *:not(:last-child)": {
    borderBottomWidth: "[1px]",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.a20",
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
  // No vertical padding here — the sticky header owns its own padding so it
  // can fully cover scrolling content underneath it.
});

const sectionGapStyle = css({
  gap: "2",
});

const fillHeightSectionStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  position: "sticky",
  top: "[0]",
  zIndex: "[2]",
  backgroundColor: "neutral.s00",
  // Extend padding so the opaque background fully covers content scrolling
  // underneath the sticky header (incl. the section's own border-bottom).
  paddingTop: "3",
  paddingBottom: "2",
  // Soft fade below the header so content scrolling under it disappears
  // smoothly instead of being cut off by a hard edge.
  "&::after": {
    content: '""',
    position: "absolute",
    top: "[100%]",
    left: "[0]",
    right: "[0]",
    height: "[12px]",
    background:
      "[linear-gradient(to bottom, var(--colors-neutral-s00), transparent)]",
    pointerEvents: "none",
  },
});

const contentPaddingStyle = css({
  paddingBottom: "3",
});

const headerLeftStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flex: "[1]",
});

const titleStyle = css({
  fontWeight: "semibold",
  fontSize: "sm",
  lineHeight: "[14px]",
  color: "neutral.fg.body",
});

const triggerButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[20px]",
  borderRadius: "md",
  cursor: "pointer",
  background: "[transparent]",
  border: "[none]",
  color: "neutral.s110",
  padding: "[0]",
  "& svg": {
    transition: "[transform 150ms ease-out]",
  },
  "&[data-state=closed] svg": {
    transform: "[rotate(180deg)]",
  },
});

const collapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",

  "&[data-state=open]": {
    animationName: "expand",
  },
  "&[data-state=closed]": {
    animationName: "collapse",
  },
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  pl: "2",
});

const collapsibleContentInnerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  pl: "2",
  pt: "2",
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
  renderHeaderLeading?: () => ReactNode;
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
  renderHeaderLeading,
  renderHeaderAction,
  children,
  className,
}: SectionProps) => {
  const headerLeft = (
    <div className={headerLeftStyle}>
      {renderHeaderLeading?.()}
      <span className={titleStyle}>{title}</span>
      {tooltip && <InfoIconTooltip tooltip={tooltip} />}
    </div>
  );

  const { showAnimations } = use(UserSettingsContext);

  if (collapsible) {
    return (
      <Collapsible.Root
        defaultOpen={defaultOpen}
        className={cx(sectionStyle, className)}
      >
        <div className={headerStyle}>
          {headerLeft}
          {renderHeaderAction && <div>{renderHeaderAction()}</div>}
          <Collapsible.Trigger className={triggerButtonStyle} asChild>
            <IconButton size="xs" variant="ghost" aria-label="Toggle section">
              <FaChevronUp size={10} />
            </IconButton>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content
          className={cx(
            showAnimations ? collapsibleContentStyle : undefined,
            contentPaddingStyle,
          )}
        >
          <div className={collapsibleContentInnerStyle}>{children}</div>
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <div
      className={cx(
        sectionStyle,
        sectionGapStyle,
        fillHeight && fillHeightSectionStyle,
        className,
      )}
    >
      <div className={headerStyle}>
        {headerLeft}
        {renderHeaderAction && <div>{renderHeaderAction()}</div>}
      </div>
      <div
        className={cx(
          contentStyle,
          contentPaddingStyle,
          fillHeight && fillHeightContentStyle,
        )}
      >
        {children}
      </div>
    </div>
  );
};
