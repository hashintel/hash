import { css, cx } from "@hashintel/ds-helpers/css";
import { token } from "@hashintel/ds-helpers/tokens";

const INVENTORY_DWELL_COLOR = "#f3f8ff";
const USED_ELSEWHERE_HATCH =
  "repeating-linear-gradient(135deg, transparent 0, transparent 6px, rgba(100, 116, 139, 0.28) 6px, rgba(100, 116, 139, 0.28) 7px)";

const summary = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  minW: "0",
  w: "full",
  maxW: "full",
  gap: "2",
  textStyle: "xs",
  color: "fg.subtle",
});
const legend = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "3",
});
const legendItem = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});
const swatch = css({
  display: "inline-block",
  w: "4",
  h: "3",
  borderWidth: "1px",
  borderColor: "bd.strong",
  borderRadius: "xs",
});
const markerGlyph = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "[16px]",
  h: "[16px]",
  borderWidth: "1px",
  borderColor: "white",
  borderRadius: "full",
  color: "white",
  boxShadow: "sm",
});

interface ProductionScheduleSummaryProps {
  displayedUnknownOutputCount: number;
  displayedUsedElsewhereCount: number;
  hasDispatchedAsFinishedGood: boolean;
  hasOverDepletedInventory: boolean;
  hasVisibleInventoryDwell: boolean;
}

export const ProductionScheduleSummary = ({
  displayedUnknownOutputCount,
  displayedUsedElsewhereCount,
  hasDispatchedAsFinishedGood,
  hasOverDepletedInventory,
  hasVisibleInventoryDwell,
}: ProductionScheduleSummaryProps) => (
  <div className={summary}>
    <div className={legend} aria-label="Production timeline legend">
      <span className={legendItem}>
        <span className={cx(swatch, css({ bg: "[#2563eb]" }))} />
        Production window
      </span>
      {hasVisibleInventoryDwell && (
        <span className={legendItem}>
          <span
            className={swatch}
            style={{ background: INVENTORY_DWELL_COLOR }}
          />
          Inventory dwell
        </span>
      )}
      <span className={legendItem}>
        <span
          className={swatch}
          style={{
            backgroundColor: INVENTORY_DWELL_COLOR,
            backgroundImage: USED_ELSEWHERE_HATCH,
            borderColor: "#cbd5e1",
          }}
        />
        Also used for other products
      </span>
      {displayedUnknownOutputCount > 0 && (
        <span className={legendItem}>
          <span
            className={swatch}
            style={{
              background: INVENTORY_DWELL_COLOR,
              borderColor: "#d97706",
            }}
          />
          Immediate output unknown
        </span>
      )}
      <span className={legendItem}>
        <span className={markerGlyph} style={{ background: "#be123c" }}>
          1
        </span>
        Consumption
      </span>
      <span className={legendItem}>
        <span className={markerGlyph} style={{ background: "#0f766e" }}>
          1
        </span>
        Dispatch
      </span>
      {hasDispatchedAsFinishedGood && (
        <span className={legendItem}>
          <span
            className={markerGlyph}
            style={{
              background: "#ffffff",
              borderColor: "#0f766e",
              color: "#0f766e",
            }}
          >
            1
          </span>
          Dispatched as FG
        </span>
      )}
      {hasOverDepletedInventory && (
        <span className={legendItem}>
          <span
            className={swatch}
            style={{
              background: token.var("colors.bg.surface"),
              borderColor: "#dc2626",
              borderStyle: "dashed",
            }}
          />
          Over-depleted inventory
        </span>
      )}
    </div>
    <span>
      {displayedUsedElsewhereCount}{" "}
      {displayedUsedElsewhereCount === 1 ? "batch" : "batches"} also used for
      other products
      {displayedUnknownOutputCount > 0
        ? ` · ${displayedUnknownOutputCount} ${
            displayedUnknownOutputCount === 1 ? "batch" : "batches"
          } with unknown outputs`
        : ""}
    </span>
  </div>
);
