import { use, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../react/lsp/context";
import {
  DiagnosticsIcon,
  useExperimentalIconMotionAllowed,
  useExperimentalIconPackEnabled,
} from "../../../../experimental-icons";
import { ToolbarButton } from "./toolbar-button";

const iconContainerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[2px]",
    borderRadius: "md",
    padding: "[1px 5px]",
    height: "[22px]",
  },
  variants: {
    status: {
      error: {
        backgroundColor: "[rgba(239, 68, 68, 0.1)]",
        color: "[#dc2626]",
      },
      warning: {
        backgroundColor: "[rgba(245, 158, 11, 0.1)]",
        color: "[#d97706]",
      },
      success: {
        backgroundColor: "[rgba(34, 197, 94, 0.1)]",
        color: "[#16a34a]",
      },
    },
  },
});

const countStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
});

const animatedContainerStyle = css({
  display: "flex",
  alignItems: "center",
  fontSize: "sm",
  lineHeight: "[20px]",
  fontVariantNumeric: "tabular-nums",
  "& > svg": { flexShrink: "0", position: "relative", zIndex: "[1]" },
});

const countWindowStyle = css({
  flexShrink: "0",
  overflow: "hidden",
  maskImage: "[linear-gradient(to right, transparent, black 4px)]",
});

const animatedCountStyle = css({
  display: "block",
  paddingLeft: "[4px]",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const AnimatedDiagnosticsContents = ({
  count,
  status,
  motionAllowed,
}: {
  count: number;
  status: "valid" | "warning" | "error";
  motionAllowed: boolean;
}) => {
  const [displayedCount, setDisplayedCount] = useState(count);
  if (count > 0 && count !== displayedCount) {
    setDisplayedCount(count);
  }
  const hasIssues = count > 0;
  const timing = "320ms cubic-bezier(0.2, 0, 0.2, 1)";

  return (
    <div className={animatedContainerStyle}>
      <DiagnosticsIcon status={status} size={16} duration={320} />
      <span
        className={countWindowStyle}
        data-diagnostic-count=""
        aria-hidden="true"
        style={{
          width: hasIssues
            ? `calc(${String(displayedCount).length}ch + 4px)`
            : "0px",
          transition: motionAllowed ? `width ${timing}` : "none",
        }}
      >
        <span
          className={animatedCountStyle}
          style={{
            transform: hasIssues ? "translateX(0px)" : "translateX(-14px)",
            opacity: hasIssues ? 1 : 0,
            transition: motionAllowed
              ? `transform ${timing}, opacity ${timing}`
              : "none",
          }}
        >
          {displayedCount}
        </span>
      </span>
    </div>
  );
};

interface DiagnosticsIndicatorProps {
  onClick: () => void;
  isExpanded: boolean;
}

/**
 * DiagnosticsIndicator shows the current SDCPN validation status.
 * - Green check icon if no issues
 * - Amber icon with count if only warnings/hints (simulation still allowed)
 * - Red cross icon with count if errors found
 */
export const DiagnosticsIndicator: React.FC<DiagnosticsIndicatorProps> = ({
  onClick,
  isExpanded,
}) => {
  const { totalDiagnosticsCount, errorDiagnosticsCount } = use(
    LanguageClientContext,
  );

  const hasErrors = errorDiagnosticsCount > 0;
  const hasIssues = totalDiagnosticsCount > 0;
  const experimentalIcons = useExperimentalIconPackEnabled();
  const motionAllowed = useExperimentalIconMotionAllowed();
  const status = hasErrors ? "error" : hasIssues ? "warning" : "valid";

  return (
    <ToolbarButton
      tooltip="Show Diagnostics"
      onClick={onClick}
      ariaLabel={
        hasIssues
          ? `${totalDiagnosticsCount} diagnostic issues found`
          : "No diagnostic issues"
      }
      ariaExpanded={isExpanded}
      style={
        experimentalIcons
          ? {
              width: "auto",
              minWidth: 32,
              flexShrink: 0,
              transition: motionAllowed ? undefined : "none",
            }
          : undefined
      }
    >
      <div
        className={iconContainerStyle({
          status: hasErrors ? "error" : hasIssues ? "warning" : "success",
        })}
        style={
          experimentalIcons
            ? {
                transition: motionAllowed
                  ? "background-color 320ms ease, color 320ms ease"
                  : "none",
              }
            : undefined
        }
      >
        {experimentalIcons ? (
          <AnimatedDiagnosticsContents
            count={totalDiagnosticsCount}
            status={status}
            motionAllowed={motionAllowed}
          />
        ) : (
          <Icon name={hasIssues ? "close" : "check"} size="sm" />
        )}
        {!experimentalIcons && hasIssues && (
          <span className={countStyle}>{totalDiagnosticsCount}</span>
        )}
      </div>
    </ToolbarButton>
  );
};
