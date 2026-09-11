import {
  deriveArcEffects,
  observedArcOutcome,
  type ConstructionMutationRequest,
} from "../src/transition-record";

import type { SDCPN } from "@hashintel/petrinaut-core";

export const emptyDefinition = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});

export const testBinding = {
  conversationId: "test-conversation",
  documentId: "test-document",
  incarnationId: "test-incarnation",
} satisfies ConstructionMutationRequest["binding"];

export const constructionRequest = (
  toolName: ConstructionMutationRequest["toolName"],
  input: ConstructionMutationRequest["input"],
): ConstructionMutationRequest => ({
  toolName,
  input,
  toolCallId: "test-call",
  requestedBaseHash: "a".repeat(64),
  binding: testBinding,
});

export const observedOutcome = (
  request: ConstructionMutationRequest,
  pre: SDCPN,
  post: SDCPN,
) =>
  observedArcOutcome({
    request,
    binding: request.binding,
    pre: { definition: pre, sha256: request.requestedBaseHash },
    post: { definition: post, sha256: "b".repeat(64) },
    effects: deriveArcEffects(request, pre, post),
  });
