import { latestRunbookIrBlock } from "@hashintel/brunch-agent/workpiece";

import {
  crewReservationFixtureId,
  crewReservationFixtureQuery,
  preparedCrewReservationWorkpiece,
} from "./prepared-crew-reservation-fixture";

import type { CrewReservationSettledManifest } from "./crew-reservation-settled-manifest";
import type { CrewReservationSettlementStatus } from "./use-crew-reservation-settled-manifest";

const fixturePanelStyle = {
  background: "rgba(255, 255, 255, 0.96)",
  border: "1px solid #c9d2df",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
  left: 16,
  maxWidth: 520,
  padding: "10px 12px",
  position: "absolute",
  top: 16,
  zIndex: 20,
} as const;

export const PreparedFixtureSelector = () => (
  <aside aria-label="Prepared fixture selector" style={fixturePanelStyle}>
    <strong>Prepared Brunch fixtures</strong>
    <div>
      <a href={`?${crewReservationFixtureQuery}=${crewReservationFixtureId}`}>
        Open the labelled crew-reservation fixture
      </a>
    </div>
  </aside>
);

export const PreparedFixtureBanner = ({
  currentWorkpiece,
  settledManifest,
  settlementStatus = { state: "preparing" },
}: {
  readonly currentWorkpiece?: string;
  readonly settledManifest: CrewReservationSettledManifest | null;
  readonly settlementStatus?: CrewReservationSettlementStatus;
}) => {
  const displayedWorkpiece =
    currentWorkpiece ??
    (settledManifest === null
      ? latestRunbookIrBlock(preparedCrewReservationWorkpiece)
      : undefined);

  return (
    <aside aria-label="Prepared fixture status" style={fixturePanelStyle}>
      <strong>Test-authored prepared fixture</strong>
      <div>
        Revision zero is diagnostic preparation, not model-produced evidence.
        This fixture does not claim capture provenance, behavioral execution, or
        automatic full-net projection.
      </div>
      <div aria-live="polite">
        {settlementStatus.state === "refused"
          ? settlementStatus.reason === "bundle-snapshot-unavailable"
            ? `Settlement refused (${settlementStatus.reason}); the selected document revision is unavailable and the live mirror is shown only for diagnosis.`
            : `Settlement refused (${settlementStatus.reason}); ${
                settledManifest === null
                  ? "no coherent bundle is selected"
                  : `bundle revision ${settledManifest.revision} remains selected`
              }.${settlementStatus.detail === undefined ? "" : ` ${settlementStatus.detail}`}`
          : settlementStatus.state !== "settled" || settledManifest === null
            ? "Preparing the conversation, workpiece, and automatically mirrored document…"
            : `Settled bundle revision ${settledManifest.revision}; target crew-reservation arc ${settledManifest.document.targetArc}.`}
      </div>
      {displayedWorkpiece === undefined ? (
        <div>The selected bundle’s Markdown workpiece is unavailable.</div>
      ) : (
        <details>
          <summary>Current Markdown workpiece</summary>
          <pre
            style={{
              maxHeight: 240,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {displayedWorkpiece}
          </pre>
        </details>
      )}
    </aside>
  );
};
