import { createPreparedWorkpieceDelivery } from "@hashintel/brunch-agent/workpiece";
import {
  getLatestNetDefinitionToolName,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

import type { SDCPN } from "@hashintel/petrinaut-core";

export const crewReservationFixtureId = "crew-reservation-v1";
export const crewReservationDocumentId =
  "mission-6-crew-reservation-document-v1";
export const crewReservationConversationId =
  "mission-6-crew-reservation-conversation-v1";
export const crewReservationFixtureQuery = "brunch-fixture";
export const crewReservationFixtureClientToolNames = [
  getLatestNetDefinitionToolName,
  "addArc",
] as const satisfies readonly PetrinautAiToolName[];

export const dispatchCrewPlaceId = "dispatch-crew-available";
export const startFinalInspectionTransitionId = "start-final-inspection";

export const preparedCrewReservationWorkpiece = [
  "Fixture authorship: test-authored preparation for Mission 6.",
  "Non-claims: not a Mission 4 candidate, not model-produced evidence, not capture-backed provenance, and not proof of automatic full-net projection.",
  "",
  "```runbook-ir",
  "# Final inspection and dispatch workpiece",
  "",
  "## Purpose and posture",
  "Maintain the narrow batch path from final inspection to dispatch readiness and test one evidence-backed decision against the live Petrinaut document.",
  "",
  "## Operational account",
  "- A batch that is ready enters final inspection.",
  "- The prepared topology returns the sole dispatch crew at sign-off.",
  "- Whether final inspection reserves that crew is an unconfirmed hypothesis; changing the workpiece or net requires explicit true-user confirmation.",
  "",
  "## Quantity and resource policy",
  "Exactly one dispatch crew is available in this fixture. Revision zero does not establish whether starting final inspection consumes it; the prepared topology currently returns it at sign-off.",
  "",
  "## Current Petrinaut correspondence",
  "The prepared non-empty net contains the batch path and the crew return from sign-off. The standard weight-1 input arc from `Dispatch crew available` to `Start final inspection` is absent while the reservation policy remains unconfirmed.",
  "",
  "## Explicit unknowns",
  "Crew reservation awaits true-user confirmation. Inspection and sign-off timing, failure modes, and recovery behavior remain unresolved.",
  "",
  "## Claim boundary",
  "This prepared revision is test-authored diagnostic material. It is not model-produced evidence and does not establish capture provenance, behavioral execution, or broad projection quality.",
  "```",
].join("\n");

export const preparedCrewReservationDelivery = createPreparedWorkpieceDelivery({
  body: preparedCrewReservationWorkpiece,
  fixtureId: crewReservationFixtureId,
  revision: 0,
});

export const preparedCrewReservationNet: SDCPN = {
  places: [
    {
      id: "batch-ready",
      name: "Batch ready",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 80,
      y: 100,
    },
    {
      id: "under-final-inspection",
      name: "Under final inspection",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 420,
      y: 100,
    },
    {
      id: "ready-for-dispatch",
      name: "Ready for dispatch",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 760,
      y: 100,
    },
    {
      id: dispatchCrewPlaceId,
      name: "Dispatch crew available",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 420,
      y: 360,
    },
  ],
  transitions: [
    {
      id: startFinalInspectionTransitionId,
      name: "Start final inspection",
      inputArcs: [
        {
          placeId: "batch-ready",
          type: "standard",
          weight: 1,
        },
      ],
      outputArcs: [
        {
          placeId: "under-final-inspection",
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 250,
      y: 100,
    },
    {
      id: "sign-off",
      name: "Sign-off",
      inputArcs: [
        {
          placeId: "under-final-inspection",
          type: "standard",
          weight: 1,
        },
      ],
      outputArcs: [
        {
          placeId: "ready-for-dispatch",
          weight: 1,
        },
        {
          placeId: dispatchCrewPlaceId,
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 590,
      y: 100,
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
};
