import { css } from "@hashintel/ds-helpers/css";

import { CELL_KIND_ICONS, CELL_KIND_LABELS } from "./cell-kinds";
import { cellSummary } from "./notebook-cell";
import { cellName } from "./notebook-model";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type {
  DependentCount,
  NotebookCell as NotebookCellModel,
} from "./notebook-model";

const CARD_WIDTH = 320;
const CARD_MARGIN = 8;
/** Rough card height for the above/below flip, before it is measured. */
const CARD_ESTIMATED_HEIGHT = 96;

const cardStyle = css({
  position: "fixed",
  width: `[${CARD_WIDTH}px]`,
  zIndex: "popover",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingX: "3",
  paddingY: "2",
  backgroundColor: "neutral.s00",
  borderRadius: "md",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  boxShadow:
    "[0px 8px 24px -6px rgba(0,0,0,0.2), 0px 2px 6px rgba(0,0,0,0.08)]",
  // Never traps the pointer, so hovering towards it can't flicker it away.
  pointerEvents: "none",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const kindStyle = css({
  fontSize: "xs",
  fontFamily: "mono",
  color: "purple.s100",
});

const nameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const summaryTextStyle = css({
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.fg.subtle",
  overflowWrap: "anywhere",
});

const dependentsStyle = css({
  fontSize: "[10px]",
  fontFamily: "mono",
  color: "neutral.s90",
});

/** Where a peek card should sit relative to its anchor, clamped on-screen. */
export const peekPosition = (
  anchor: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
): { left: number; top: number } => ({
  left: Math.max(
    CARD_MARGIN,
    Math.min(anchor.left, viewport.width - CARD_WIDTH - CARD_MARGIN),
  ),
  top:
    anchor.bottom + CARD_MARGIN + CARD_ESTIMATED_HEIGHT > viewport.height
      ? Math.max(CARD_MARGIN, anchor.top - CARD_MARGIN - CARD_ESTIMATED_HEIGHT)
      : anchor.bottom + CARD_MARGIN,
});

export interface PeekCardProps {
  net: ActiveNetDefinition;
  cell: NotebookCellModel;
  dependentCount: DependentCount | undefined;
  position: { left: number; top: number };
}

/**
 * An IDE-style peek: hovering or focusing a reference (an arc's place, an
 * explorer row) previews the target cell — kind, name, summary, dependents —
 * without navigating to it.
 */
export const PeekCard: React.FC<PeekCardProps> = ({
  net,
  cell,
  dependentCount,
  position,
}) => {
  const KindIcon = CELL_KIND_ICONS[cell.kind];
  return (
    <div className={cardStyle} style={position} role="tooltip">
      <div className={headerStyle}>
        <KindIcon size={11} />
        <span className={kindStyle}>{CELL_KIND_LABELS[cell.kind]}</span>
        <span className={nameStyle}>{cellName(cell)}</span>
      </div>
      <span className={summaryTextStyle}>{cellSummary(net, cell)}</span>
      {dependentCount !== undefined && (
        <span className={dependentsStyle}>
          {dependentCount.direct} direct → {dependentCount.transitive} total
          dependents
        </span>
      )}
    </div>
  );
};
