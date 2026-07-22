import { NumberInput, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { DocsIconButton } from "./action-buttons";
import { useCostParams, useOutlierSetting } from "./cost";
import { useDocs } from "./docs/use-docs";
import {
  BASE_MEASURES,
  MEASURE_LABELS,
  useBaseMeasure,
  type BaseMeasure,
} from "./measure-context";
import {
  PROCUREMENT_BASES,
  PROCUREMENT_BASIS_LABELS,
  useProcurementBasis,
  type ProcurementBasis,
} from "./procurement-basis-context";
import { SegmentedControl } from "./segmented-control";
import { trackSupplyChainInteraction } from "./telemetry";
import { TIME_RANGE_OPTIONS } from "./time-range";
import { useTimeRange } from "./time-range-context";

import type { ReactNode } from "react";

const actionRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minH: "[30px]",
});
const iconButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  h: "7",
  w: "7",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  color: "fg.subtle",
  cursor: "pointer",
  transition: "colors",
  _hover: { color: "fg.heading", bg: "bg.subtle" },
});
const iconButtonActive = css({ color: "fg.heading", bg: "bg.subtle" });
const settingsWrap = css({
  mt: "3",
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  pt: "3",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "4",
  "@media (max-width: 767px)": {
    position: "fixed",
    top: "0",
    right: "0",
    bottom: "0",
    zIndex: "modal",
    w: "[min(360px,92vw)]",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    flexDirection: "column",
    bg: "bgSolid.min",
    borderLeftWidth: "1px",
    borderTopWidth: "0",
    boxShadow: "2xl",
    p: "4",
    mt: "0",
    overflowY: "auto",
  },
});
const settingsTitleRow = css({
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
  display: "none",
  "@media (max-width: 767px)": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "3",
    w: "full",
  },
});
const sharedFields = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "3",
});
const fieldGroup = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "3",
  flexShrink: "0",
  whiteSpace: "nowrap",
});
const fieldLabel = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "xs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const measureSelect = css({
  textStyle: "xs",
  color: "fg.heading",
  fontWeight: "medium",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  px: "1.5",
  py: "0.5",
  cursor: "pointer",
});
export const HeaderActionButtons = ({
  settingsOpen,
  onSettingsToggle,
  docContext,
}: {
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  /** Which docs section the help button opens, based on the host view. */ docContext:
    | "site"
    | "product";
}) => {
  const { openDocs } = useDocs();

  return (
    <div className={actionRow}>
      <button
        type="button"
        className={cx(iconButton, settingsOpen && iconButtonActive)}
        aria-label={
          settingsOpen ? "Hide analysis settings" : "Show analysis settings"
        }
        aria-expanded={settingsOpen}
        onClick={onSettingsToggle}
      >
        <Icon name="gear" size="sm" />
      </button>
      <DocsIconButton
        onClick={() => {
          trackSupplyChainInteraction({
            interaction: "docs_opened",
            source: docContext === "site" ? "site_overview" : "product_page",
          });
          openDocs(
            docContext === "site" ? "site-overview" : "product-overview",
          );
        }}
      />
    </div>
  );
};

export const AnalysisSettingsPanel = ({
  children,
  onClose,
  className,
}: {
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}) => {
  const { currency, waccRate, setWaccRate, storageCost, setStorageCost } =
    useCostParams();
  const { excludeOutliers, setExcludeOutliers } = useOutlierSetting();
  const { measure, setMeasure } = useBaseMeasure();
  const { basis, setBasis } = useProcurementBasis();
  const { timeRange, setTimeRange } = useTimeRange();

  return (
    <div className={cx(settingsWrap, className)}>
      <div className={settingsTitleRow}>
        <h2>Analysis settings</h2>
        {onClose && (
          <button
            type="button"
            className={iconButton}
            aria-label="Close analysis settings"
            onClick={onClose}
          >
            x
          </button>
        )}
      </div>
      <div className={sharedFields}>
        <div className={fieldGroup}>
          <span className={fieldLabel}>
            WACC
            <NumberInput
              value={Math.round(waccRate * 100)}
              min={1}
              max={50}
              step={1}
              size="xs"
              align="center"
              width="fitContent"
              onChange={(value) => {
                if (value != null && value > 0 && value <= 50) {
                  setWaccRate(value / 100);
                }
              }}
              aria-label="WACC percent"
            />
            %
          </span>
          <span className={fieldLabel}>
            Storage
            <NumberInput
              value={storageCost}
              min={0.001}
              max={10}
              step={0.01}
              size="xs"
              align="center"
              width="fitContent"
              onChange={(value) => {
                if (value != null && value > 0 && value <= 10) {
                  setStorageCost(value);
                }
              }}
              aria-label="Storage cost per tonne per day"
            />
            {currency}/t/d
          </span>
        </div>
        <div className={fieldGroup}>
          <label className={fieldLabel}>
            Measure
            <select
              className={measureSelect}
              value={measure}
              onChange={(event) =>
                setMeasure(event.target.value as BaseMeasure)
              }
              aria-label="Base timing measure"
            >
              {BASE_MEASURES.map((measureOption) => (
                <option key={measureOption} value={measureOption}>
                  {MEASURE_LABELS[measureOption]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Procurement
            <select
              className={measureSelect}
              value={basis}
              onChange={(event) =>
                setBasis(event.target.value as ProcurementBasis)
              }
              aria-label="Procurement lead-time basis"
            >
              {PROCUREMENT_BASES.map((basisOption) => (
                <option key={basisOption} value={basisOption}>
                  {PROCUREMENT_BASIS_LABELS[basisOption]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SegmentedControl
          value={timeRange}
          onChange={setTimeRange}
          options={TIME_RANGE_OPTIONS}
        />

        <div className={fieldGroup}>
          <label className={fieldLabel}>
            <input
              type="checkbox"
              checked={excludeOutliers}
              onChange={(event) => setExcludeOutliers(event.target.checked)}
            />
            Exclude outliers
          </label>
          {children}
        </div>
      </div>
    </div>
  );
};
