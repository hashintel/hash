import { Collapsible } from "@ark-ui/react/collapsible";
import { type ReactNode, use, useState } from "react";

import { Button, HelpTooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../react/state/user-settings-context";
import { useFocusHeader } from "../worksheet/use-focus-member";
import { PointerHelpTooltip } from "./pointer-help-tooltip";
import { StackedSectionHeader, StackedSections } from "./stacked-sections";

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
  stacked?: boolean;
}

export const SectionList = ({ children, stacked }: SectionListProps) =>
  stacked ? (
    <StackedSections>{children}</StackedSections>
  ) : (
    <div className={sectionListStyle}>{children}</div>
  );

// -- Section -----------------------------------------------------------------

const stackedSectionStyle = css({
  display: "contents",
  "&[data-state=open] + [data-section] > [data-stack-anchor]": {
    marginTop: "2",
  },
});
const stackedContentStyle = css({
  paddingBottom: "2",
  borderBottom: "[1px solid {colors.neutral.a20}]",
  "&[data-part=content]": { overflow: "visible" },
});

const sectionStyle = css({
  "&:has([data-stacked-sections]) > [data-part=content]": { overflow: "clip" },
  display: "flex",
  flexDirection: "column",
  position: "relative",
  zIndex: "[0]",
  // No vertical padding here — the sticky header owns its own padding so it
  // can fully cover scrolling content underneath it.
  //
  // A focused section paints over its unfocused siblings, but never over a
  // sticky header: sections nest (a drawer section hosting the ad-hoc form,
  // which brings its own), and the host's header sits at 2 in the same
  // stacking context. Lifting a focused section above that let the nested
  // section's title and rows paint straight through the header pinned above
  // them, so 1 is the ceiling here — high enough to win against a sibling
  // at 0, low enough to stay under every header.
  "&:focus-within": {
    zIndex: "[1]",
  },
});

const sectionGapStyle = css({
  gap: "2",
});

const fillHeightSectionStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

const headerStyle = css({
  "&[data-stack-header]": { paddingY: "1" },
  "&[data-stack-header]::after": { display: "none" },
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

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

const stickyBandStyle = css({
  paddingTop: "2",
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

// only the chevron rotation — the button itself is a stock ghost Button
const triggerButtonStyle = css({
  "& svg": {
    transition: "[transform 150ms ease-out]",
  },
  "&[data-state=closed] svg": {
    transform: "[rotate(180deg)]",
  },
});

// Collapsible.Trigger injects aria-expanded, which the ds Button renders as
// pressed — strip it so the trigger keeps the resting ghost look. data-state
// still carries open/closed for the chevron rotation.
const TriggerButton = ({
  "aria-expanded": _ariaExpanded,
  ...props
}: React.ComponentProps<typeof Button>) => <Button {...props} />;

const collapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",
  paddingLeft: "2",

  "&[data-state=open]": {
    animationName: "[petrinautExpand]",
  },
  "&[data-state=closed]": {
    animationName: "[petrinautCollapse]",
  },
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const collapsibleContentInnerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  pt: "2",
});

const fillHeightContentStyle = css({
  flex: "[1]",
  minHeight: "[0]",
});

interface SectionProps {
  title: string;
  stacked?: boolean;
  tooltip?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Controls the collapsible state; leave unset for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Unmounts the content while collapsed (default keeps it mounted). */
  unmountOnCollapse?: boolean;
  fillHeight?: boolean;
  renderHeaderLeading?: () => ReactNode;
  renderHeaderAction?: () => ReactNode;
  /** Registers the collapse trigger, e.g. for keyboard navigation. */
  triggerRef?: (element: HTMLButtonElement | null) => void;
  onTriggerKeyDown?: React.KeyboardEventHandler;
  /**
   * Rendered inside the sticky header block, under the title row, so it stays
   * pinned while the section's content scrolls beneath it — a control strip
   * whose effect the user watches further down (e.g. sweep parameter
   * controls above streaming charts). Sticks with the title as one unit.
   */
  renderStickyBand?: () => ReactNode;
  children: ReactNode;
  className?: string;
}

export const Section = ({
  title,
  stacked = false,
  tooltip,
  collapsible = false,
  defaultOpen = true,
  open,
  onOpenChange,
  unmountOnCollapse = false,
  fillHeight = false,
  renderHeaderLeading,
  renderHeaderAction,
  triggerRef,
  onTriggerKeyDown,
  renderStickyBand,
  children,
  className,
}: SectionProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;
  const setExpanded = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const header = useFocusHeader({
    collapse: expanded ? () => setExpanded(false) : undefined,
    expand: expanded ? undefined : () => setExpanded(true),
  });
  const headerLeft = (
    renderTitle?: (text: string, className: string) => ReactNode,
  ) => (
    <div className={headerLeftStyle}>
      {renderHeaderLeading?.()}
      {renderTitle ? (
        renderTitle(title, titleStyle)
      ) : (
        <span className={titleStyle}>{title}</span>
      )}
      {tooltip &&
        (stacked ? (
          <PointerHelpTooltip content={tooltip} />
        ) : (
          <HelpTooltip content={tooltip} />
        ))}
    </div>
  );

  const { showAnimations } = use(UserSettingsContext);

  const renderHeaderContent = (
    renderTitle?: (text: string, className: string) => ReactNode,
  ) => (
    <>
      <div className={headerRowStyle}>
        {headerLeft(renderTitle)}
        {renderHeaderAction && <div>{renderHeaderAction()}</div>}
        <Collapsible.Trigger className={triggerButtonStyle} asChild>
          <TriggerButton
            ref={triggerRef ?? header.attach}
            size="xs"
            variant="ghost"
            aria-label={`Toggle ${title} section`}
            iconName="chevronUp"
            tooltip="Toggle section"
            onKeyDown={onTriggerKeyDown ?? header.onHeaderKeyDown}
          />
        </Collapsible.Trigger>
      </div>
      {renderStickyBand && (
        <div className={stickyBandStyle}>{renderStickyBand()}</div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <Collapsible.Root
        defaultOpen={defaultOpen}
        open={expanded}
        onOpenChange={(details) => setExpanded(details.open)}
        lazyMount={unmountOnCollapse}
        unmountOnExit={unmountOnCollapse}
        data-section
        className={cx(stacked ? stackedSectionStyle : sectionStyle, className)}
      >
        {stacked ? (
          <StackedSectionHeader className={headerStyle}>
            {renderHeaderContent}
          </StackedSectionHeader>
        ) : (
          <div className={headerStyle} data-section-header>
            {renderHeaderContent()}
          </div>
        )}
        <Collapsible.Content
          className={cx(
            showAnimations ? collapsibleContentStyle : undefined,
            contentPaddingStyle,
            stacked && stackedContentStyle,
          )}
        >
          <div className={cx(collapsibleContentInnerStyle)}>{children}</div>
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <div
      data-section
      className={cx(
        sectionStyle,
        sectionGapStyle,
        fillHeight && fillHeightSectionStyle,
        className,
      )}
    >
      <div className={headerStyle} data-section-header>
        <div className={headerRowStyle}>
          {headerLeft()}
          {renderHeaderAction && <div>{renderHeaderAction()}</div>}
        </div>
        {renderStickyBand && (
          <div className={stickyBandStyle}>{renderStickyBand()}</div>
        )}
      </div>
      {/* A section whose body lives entirely in the sticky band (the sweep
          navigator) passes null children; rendering the wrapper anyway left
          ~20px of dead space under it. */}
      {children === null ? null : (
        <div
          className={cx(
            contentStyle,
            contentPaddingStyle,
            fillHeight && fillHeightContentStyle,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};
