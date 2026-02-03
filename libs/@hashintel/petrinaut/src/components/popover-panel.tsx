import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { CSSProperties, ReactNode } from "react";

import { IconButton } from "./icon-button";

const panelContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "[100%]",
  backgroundColor: "gray.10",
  borderRadius: "md.6",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 12px 12px -6px rgba(0, 0, 0, 0.02), 0px 4px 4px -12px rgba(0, 0, 0, 0.02)]",
  overflow: "clip",
});

const headerContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  padding: "[4px 4px 4px 10px]",
});

const titleStyle = css({
  flex: "1",
  fontWeight: "medium",
  fontSize: "[12px]",
  lineHeight: "[12px]",
  letterSpacing: "[0.48px]",
  textTransform: "uppercase",
  color: "gray.50",
  minWidth: "[0px]",
});

const CloseIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9 3L3 9M3 3L9 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface PopoverPanelProps {
  /** Title displayed in the panel header */
  title: string;
  /** Callback when the close button is clicked */
  onClose?: () => void;
  /** Whether to show the close button. Defaults to true. */
  showCloseButton?: boolean;
  /** Content to render inside the panel */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

/**
 * PopoverPanel provides a container for popover content with a header and close button.
 *
 * Designed to match the Figma design for settings popovers like "Playback Controls".
 * Use PopoverSection components as children to create grouped sections.
 */
export const PopoverPanel: React.FC<PopoverPanelProps> = ({
  title,
  onClose,
  showCloseButton = true,
  children,
  className,
  style,
}) => {
  return (
    <div className={cx(panelContainerStyle, className)} style={style}>
      <div className={headerContainerStyle}>
        <span className={titleStyle}>{title}</span>
        {showCloseButton && (
          <IconButton
            aria-label="Close"
            onClick={onClose}
            size="md"
            variant="default"
          >
            <CloseIcon />
          </IconButton>
        )}
      </div>
      {children}
    </div>
  );
};

// ============================================================================
// PopoverSection
// ============================================================================

const sectionContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  padding: "[2px 4px 4px 4px]",
  width: "[100%]",
  _first: {
    paddingTop: "[0px]",
  },
});

const sectionContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  backgroundColor: "neutral.white",
  borderRadius: "md.4",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 12px 12px -6px rgba(0, 0, 0, 0.02), 0px 4px 4px -12px rgba(0, 0, 0, 0.02)]",
  overflow: "clip",
  width: "[100%]",
});

const sectionInnerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  padding: "[4px]",
  width: "[100%]",
});

const sectionTitleStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    fontWeight: "medium",
    fontSize: "[12px]",
    lineHeight: "[1]",
    color: "gray.50",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  variants: {
    hasPadding: {
      true: {
        padding: "[8px 8px 6px 8px]",
      },
      false: {
        padding: "[0px]",
      },
    },
  },
  defaultVariants: {
    hasPadding: true,
  },
});

const sectionDividerStyle = css({
  width: "[100%]",
  height: "[1px]",
  backgroundColor: "gray.10",
});

interface PopoverSectionProps {
  /** Optional title for the section */
  title?: string;
  /** Content to render inside the section */
  children: ReactNode;
  /** Whether to show a divider at the bottom. Defaults to true. */
  showDivider?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

/**
 * PopoverSection provides a grouped section within a PopoverPanel.
 *
 * Designed to match the Figma design for settings sections like
 * "When pressing play", "Playback speed", etc.
 */
export const PopoverSection: React.FC<PopoverSectionProps> = ({
  title,
  children,
  showDivider = true,
  className,
  style,
}) => {
  return (
    <div className={cx(sectionContainerStyle, className)} style={style}>
      <div className={sectionContentStyle}>
        <div className={sectionInnerStyle}>
          {title && <span className={sectionTitleStyle()}>{title}</span>}
          {children}
        </div>
        {showDivider && <div className={sectionDividerStyle} />}
      </div>
    </div>
  );
};
