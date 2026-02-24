import { css } from "@hashintel/ds-helpers/css";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../../tooltip";

const headerRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
});

const headerActionStyle = css({
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[20px]",
  overflow: "hidden",
});

const sectionToggleStyle = css({
  display: "flex",
  alignItems: "center",
  fontWeight: "medium",
  fontSize: "sm",
  color: "neutral.s100",
  cursor: "pointer",
});

const sectionToggleIconStyle = css({
  w: "4",
  display: "flex",
  justifyContent: "center",
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
    <div
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
      <div className={`${sectionToggleIconStyle} toggle-icon`}>
        {isExpanded ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
      </div>
      <span>
        {title}
        {tooltip && <InfoIconTooltip tooltip={tooltip} />}
      </span>
    </div>
    {isExpanded && renderHeaderAction && (
      <div className={headerActionStyle}>{renderHeaderAction()}</div>
    )}
  </div>
);
