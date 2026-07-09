import { sendTelemetry } from "../../../shared/telemetry-client";

import type { FrontendTrackEventName } from "@local/hash-isomorphic-utils/telemetry/types";

type SupplyChainTelemetryProperties = {
  interaction?: string;
  opportunityKind?: string;
  opportunityType?: string;
  productId?: string;
  route?: string;
  siteId?: string;
  source?: string;
  statusCategory?: string;
  stepId?: string;
};

const sendSupplyChainTrack = (
  name: FrontendTrackEventName,
  properties: SupplyChainTelemetryProperties,
): void => {
  sendTelemetry({
    events: [
      {
        type: "track",
        name,
        properties,
      },
    ],
  });
};

export const trackSupplyChainViewed = (
  properties: SupplyChainTelemetryProperties,
): void => {
  sendSupplyChainTrack("supply_chain_viewed", properties);
};

export const trackSupplyChainInteraction = (
  properties: SupplyChainTelemetryProperties & { interaction: string },
): void => {
  sendSupplyChainTrack("supply_chain_interaction", properties);
};

export const trackSupplyChainStatusReportCreated = (
  properties: SupplyChainTelemetryProperties,
): void => {
  sendSupplyChainTrack("supply_chain_status_report_created", properties);
};

export const trackSupplyChainError = (
  properties: SupplyChainTelemetryProperties,
): void => {
  sendSupplyChainTrack("supply_chain_error", properties);
};
