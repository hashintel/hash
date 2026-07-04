import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../react/lsp/context";
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
    >
      <div
        className={iconContainerStyle({
          status: hasErrors ? "error" : hasIssues ? "warning" : "success",
        })}
      >
        {hasIssues ? (
          <>
            <Icon name="close" size="sm" />
            <span className={countStyle}>{totalDiagnosticsCount}</span>
          </>
        ) : (
          <Icon name="check" size="sm" />
        )}
      </div>
    </ToolbarButton>
  );
};
