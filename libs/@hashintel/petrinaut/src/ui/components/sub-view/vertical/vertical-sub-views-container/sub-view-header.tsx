import { Button, HelpTooltip, Icon } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { usePetrinautPresentation } from "../../../../views/shared/presentation-context";

import type { SubView } from "../../types";

/** Size of the icon in the main header */
const HEADER_ICON_SIZE = 16;

const breadcrumbStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "1",
  minWidth: "0",
  pl: "1",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s100",
  lineHeight: "[20px]",
});

const parentTitleStyle = css({
  appearance: "none",
  border: "[0]",
  backgroundColor: "[transparent]",
  padding: "0",
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "[0 1 auto]",
  minWidth: "0",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  font: "[inherit]",
  fontSize: "[13px]",
  fontWeight: "normal",
  color: "neutral.s85",
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationColor: "[transparent]",
  textUnderlineOffset: "[3px]",
  "[data-subview-animate] &": {
    transition: "[color 160ms ease-out, text-decoration-color 160ms ease-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  _hover: {
    color: "neutral.s120",
    textDecorationColor: "[currentColor]",
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[3px]",
    borderRadius: "[2px]",
  },
});

const parentTitleTextStyle = css({
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const breadcrumbSeparatorStyle = css({
  display: "flex",
  color: "neutral.s65",
  flexShrink: 0,
});

const breadcrumbCurrentStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  whiteSpace: "nowrap",
});

const headerRowStyle = cva({
  base: {
    height: "11",
    flexShrink: 0,
    pl: "0.5",
    pr: "2",

    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",

    borderBottomWidth: "thin",
    borderBottomColor: "neutral.a20",
  },
  variants: {
    isCollapsed: {
      true: {
        borderBottomColor: "[transparent]",
      },
    },
  },
});

const mainHeaderRowStyle = css({
  p: "3",
  h: "11",
  flexShrink: 0,

  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",

  borderBottomWidth: "thin",
  borderBottomColor: "neutral.a20",
});

const headerActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
});

const headerActionVisibleStyle = css({
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[44px]",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
});

const headerActionStyle = css({
  maxHeight: "[44px]",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  opacity: "[0]",
  width: "[0]",
  overflow: "hidden",
  transition: "[opacity 150ms ease-out, width 0s 150ms]",
});

const sectionToggleStyle = css({
  display: "flex",
  alignItems: "center",
  fontWeight: "medium",
  fontSize: "sm",
  color: "neutral.s100",
  cursor: "pointer",
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",

  "& [data-toggle-icon]": {
    width: "3.5",
    opacity: "[var(--petrinaut-panel-toggle-opacity, 0)]",
  },
  "&:hover [data-toggle-icon], &:focus-visible [data-toggle-icon]": {
    opacity: "[1]",
  },
});

const sectionToggleLabelStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "0",
});

const sectionToggleIconStyle = css({
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  overflow: "hidden",
  transition:
    "[width 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out]",
});

const sectionToggleIconExpandedStyle = css({
  transform: "[rotate(90deg)]",
});

const infoTooltipWrapperStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  opacity: "[0]",
  transition: "[opacity 150ms ease-out]",
});

const mainHeaderContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  pl: "1",
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
});

const headerIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "5",
  color: "neutral.s85",
});

const mainTitleStyle = cva({
  base: {
    fontWeight: "medium",
    fontSize: "sm",
    lineHeight: "[20px]",
    color: "neutral.s100",
    minWidth: "0",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  variants: {
    fadeOverflow: {
      true: {
        paddingRight: "3",
        maskImage:
          "[linear-gradient(to right, black calc(100% - 12px), transparent)]",
      },
      false: { textOverflow: "ellipsis" },
    },
  },
  defaultVariants: { fadeOverflow: false },
});

interface SubViewHeaderProps {
  subView: SubView;
  /** Whether the header is the panel's own: a larger title and no toggle. */
  main: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onExpand?: () => void;
  onRestore?: () => void;
  parentTitle: string;
  parentIcon?: SubView["icon"];
}

export const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  subView,
  main,
  isExpanded,
  onToggle,
  onExpand,
  onRestore,
  parentTitle,
  parentIcon: ParentIcon,
}) => {
  const presentation = usePetrinautPresentation();
  const {
    id,
    title,
    tooltip,
    icon: HeaderIcon,
    titleComponent: Title,
    headerAction: HeaderAction,
    alwaysShowHeaderAction,
  } = subView;
  const showsHeaderAction =
    (isExpanded || alwaysShowHeaderAction) &&
    (HeaderAction ?? subView.renderHeaderAction) !== undefined &&
    !(subView.headerActionMutates && !presentation.showMutationActions);

  return (
    <div
      data-subview-header
      className={
        main ? mainHeaderRowStyle : headerRowStyle({ isCollapsed: !isExpanded })
      }
    >
      {onRestore ? (
        <nav
          aria-label="Properties path"
          data-subview-title
          className={breadcrumbStyle}
        >
          <button
            type="button"
            data-restore-subview
            aria-label={`Back to ${parentTitle}`}
            title={parentTitle}
            className={parentTitleStyle}
            onClick={onRestore}
          >
            {ParentIcon && (
              <span aria-hidden="true" className={headerIconStyle}>
                <ParentIcon size={HEADER_ICON_SIZE} />
              </span>
            )}
            <span className={parentTitleTextStyle}>{parentTitle}</span>
          </button>
          {parentTitle !== title && (
            <>
              <span aria-hidden="true" className={breadcrumbSeparatorStyle}>
                <Icon name="chevronRight" size="xxs" />
              </span>
              <span
                aria-current="page"
                title={title}
                className={breadcrumbCurrentStyle}
              >
                {title}
                {tooltip && (
                  <span data-info-tooltip className={infoTooltipWrapperStyle}>
                    <HelpTooltip align="center" content={tooltip} />
                  </span>
                )}
              </span>
            </>
          )}
        </nav>
      ) : main ? (
        <div data-subview-title className={mainHeaderContentStyle}>
          {HeaderIcon && (
            <span aria-hidden="true" className={headerIconStyle}>
              <HeaderIcon size={HEADER_ICON_SIZE} />
            </span>
          )}
          {Title ? (
            <Title />
          ) : subView.renderTitle ? (
            subView.renderTitle()
          ) : (
            <span className={mainTitleStyle()}>{title}</span>
          )}
        </div>
      ) : (
        <div
          data-toggle-subview
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle();
            }
          }}
          className={sectionToggleStyle}
          aria-expanded={isExpanded}
          aria-controls={`subview-content-${id}`}
        >
          <div
            data-toggle-icon
            className={cx(
              sectionToggleIconStyle,
              isExpanded && sectionToggleIconExpandedStyle,
            )}
          >
            <Icon name="chevronRight" size="xxs" />
          </div>
          <span className={sectionToggleLabelStyle}>
            <span className={mainTitleStyle()}>{title}</span>
            {tooltip && (
              <span data-info-tooltip className={infoTooltipWrapperStyle}>
                <HelpTooltip align="center" content={tooltip} />
              </span>
            )}
          </span>
        </div>
      )}
      {(onExpand || showsHeaderAction) && (
        <div className={headerActionsStyle}>
          {onExpand && (
            <Button
              size="sm"
              variant="ghost"
              iconName="expand"
              data-expand-subview
              aria-label={`Expand ${title}`}
              tooltip="Fill panel"
              onClick={onExpand}
            />
          )}
          {showsHeaderAction && (
            <div
              {...(!alwaysShowHeaderAction && { "data-header-action": true })}
              className={
                alwaysShowHeaderAction
                  ? headerActionVisibleStyle
                  : headerActionStyle
              }
            >
              {HeaderAction ? <HeaderAction /> : subView.renderHeaderAction?.()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
