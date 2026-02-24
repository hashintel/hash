import { css } from "@hashintel/ds-helpers/css";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../../tooltip";

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
  padding: "[4px 0]",
});

const headerActionStyle = css({
  display: "flex",
  alignItems: "center",
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[20px]",
  overflow: "hidden",
});

const sectionToggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontWeight: "semibold",
  fontSize: "[13px]",
  color: "[#333]",
  cursor: "pointer",
  background: "[transparent]",
  border: "none",
  padding: "1",
  borderRadius: "md",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

interface SubViewHeaderProps {
  id: string;
  title: string;
  tooltip?: string;
  isExpanded: boolean;
  onToggle: () => void;
  renderHeaderAction?: () => React.ReactNode;
}

/**
 * Shared header component for subview sections.
 */
export const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  id,
  title,
  tooltip,
  isExpanded,
  onToggle,
  renderHeaderAction,
}) => (
  <div className={headerRowStyle}>
    <button
      type="button"
      onClick={onToggle}
      className={sectionToggleButtonStyle}
      aria-expanded={isExpanded}
      aria-controls={`subview-content-${id}`}
    >
      {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
      <span>
        {title}
        {tooltip && <InfoIconTooltip tooltip={tooltip} />}
      </span>
    </button>
    {isExpanded && renderHeaderAction && (
      <div className={headerActionStyle}>{renderHeaderAction()}</div>
    )}
  </div>
);
