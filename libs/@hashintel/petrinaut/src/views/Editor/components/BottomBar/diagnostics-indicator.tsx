import { css } from "@hashintel/ds-helpers/css";
import { FaCheck, FaXmark } from "react-icons/fa6";

import { useCheckerContext } from "../../../../state/checker-provider";

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
  const { totalDiagnosticsCount } = useCheckerContext();

  const hasErrors = totalDiagnosticsCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "2px 6px",
        marginLeft: "12px",
        marginRight: "3px",
        gap: 2,
      }}
      className={css({
        display: "flex",
        alignItems: "center",
        border: "none",
        borderRadius: "[8px]",
        cursor: "pointer",
        transition: "[all 0.2s ease]",
        backgroundColor: hasErrors
          ? "[rgba(239, 68, 68, 0.1)]"
          : "[rgba(34, 197, 94, 0.1)]",
        color: hasErrors ? "[#dc2626]" : "[#16a34a]",
        "&:hover": {
          backgroundColor: hasErrors
            ? "[rgba(239, 68, 68, 0.2)]"
            : "[rgba(34, 197, 94, 0.2)]",
        },
      })}
      aria-label={
        hasErrors
          ? `${totalDiagnosticsCount} diagnostic issues found`
          : "No diagnostic issues"
      }
      aria-expanded={isExpanded}
    >
      {hasErrors ? (
        <>
          <FaXmark size={16} />
          <span className={css({ fontSize: "[14px]", fontWeight: "medium" })}>
            {totalDiagnosticsCount}
          </span>
        </>
      ) : (
        <FaCheck size={16} />
      )}
    </button>
  );
};
