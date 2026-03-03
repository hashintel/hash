import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { FaCheck, FaXmark } from "react-icons/fa6";

import { LanguageClientContext } from "../../../../lsp/context";
import { ToolbarButton } from "./toolbar-button";

const iconContainerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[2px]",
    borderRadius: "[6px]",
    padding: "[1px 6px]",
    height: "[25px]",
  },
  variants: {
    status: {
      error: {
        backgroundColor: "[rgba(239, 68, 68, 0.1)]",
        color: "[#dc2626]",
      },
      success: {
        backgroundColor: "[rgba(34, 197, 94, 0.1)]",
        color: "[#16a34a]",
      },
    },
  },
});

const countStyle = css({
  fontSize: "[14px]",
  fontWeight: "medium",
});

interface DiagnosticsIndicatorProps {
  onClick: () => void;
  isExpanded: boolean;
}

/**
 * DiagnosticsIndicator shows the current SDCPN validation status.
 * - Green check icon if no issues
 * - Red cross icon with count if issues found
 */
export const DiagnosticsIndicator: React.FC<DiagnosticsIndicatorProps> = ({
  onClick,
  isExpanded,
}) => {
  const { totalDiagnosticsCount } = use(LanguageClientContext);

  const hasErrors = totalDiagnosticsCount > 0;

  return (
    <ToolbarButton
      tooltip="Show Diagnostics"
      onClick={onClick}
      ariaLabel={
        hasErrors
          ? `${totalDiagnosticsCount} diagnostic issues found`
          : "No diagnostic issues"
      }
      ariaExpanded={isExpanded}
    >
      <div
        className={iconContainerStyle({
          status: hasErrors ? "error" : "success",
        })}
      >
        {hasErrors ? (
          <>
            <FaXmark size={16} />
            <span className={countStyle}>{totalDiagnosticsCount}</span>
          </>
        ) : (
          <FaCheck size={16} />
        )}
      </div>
    </ToolbarButton>
  );
};
