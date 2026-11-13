import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { useStoreSelector } from "../../../../../../../react/use-store";

import type { NetClass } from "@hashintel/petrinaut-core";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 220px))]",
  columnGap: "[24px]",
  margin: "[0]",
  marginBottom: "[12px]",
  paddingBottom: "[12px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const labelStyle = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.08em]",
  textTransform: "uppercase",
  color: "neutral.s90",
});

const valueStyle = css({
  margin: "[0]",
  marginTop: "[2px]",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const noteStyle = css({
  margin: "[0]",
  marginTop: "[2px]",
  fontSize: "[11px]",
  lineHeight: "[1.4]",
  color: "neutral.s100",
});

/** How one value of a dimension reads, and what it means for a run. */
type Reading = { value: string; note: string };

const TIME: Record<NetClass["time"], Reading> = {
  timed: { value: "Timed", note: "A run is read against time." },
  untimed: { value: "Untimed", note: "A run is a sequence of steps." },
};

const COLORING: Record<NetClass["coloring"], Reading> = {
  none: { value: "Uncoloured", note: "Tokens carry no values." },
  static: {
    value: "Statically coloured",
    note: "Token values change only at a firing.",
  },
  dynamic: {
    value: "Dynamically coloured",
    note: "Token values move between firings.",
  },
};

const CHANCE: Record<NonNullable<NetClass["chance"]>, Reading> = {
  stochastic: { value: "Stochastic", note: "Two runs can differ." },
  deterministic: { value: "Deterministic", note: "Every run is the same." },
};

const UNKNOWN_CHANCE: Reading = {
  value: "Unknown",
  note: "Fix the errors in the code to find out.",
};

const Dimension = ({ label, reading }: { label: string; reading: Reading }) => (
  <div>
    <dt className={labelStyle}>{label}</dt>
    <dd className={valueStyle}>{reading.value}</dd>
    <dd className={noteStyle}>{reading.note}</dd>
  </div>
);

/**
 * The class of the net, as the language server inferred it on its last
 * check. Draws nothing until the first check lands.
 */
export const NetClassSummary = () => {
  const { netAnalysis } = use(LanguageClientContext);
  const netClass = useStoreSelector(
    netAnalysis,
    (analysis) => analysis.netClass,
  );
  if (!netClass) {
    return null;
  }

  return (
    <dl className={gridStyle} aria-label="Class of the net">
      <Dimension label="Time" reading={TIME[netClass.time]} />
      <Dimension label="Colour" reading={COLORING[netClass.coloring]} />
      <Dimension
        label="Chance"
        reading={netClass.chance ? CHANCE[netClass.chance] : UNKNOWN_CHANCE}
      />
    </dl>
  );
};
