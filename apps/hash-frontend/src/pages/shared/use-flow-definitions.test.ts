import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";
import { flowDefinitionIds } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { canEditFlowDefinition } from "./use-flow-definitions";

import type { EntityUuid, WebId } from "@blockprotocol/type-system";

const webId = "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" as WebId;
const userFlow = entityIdFromComponents(
  webId,
  "7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e2f3a4b" as EntityUuid,
);
const codeFlow = entityIdFromComponents(
  webId,
  flowDefinitionIds.historicalFlights,
);

describe("canEditFlowDefinition", () => {
  it.each([
    { flowDefinitionEntityId: userFlow, userCanUpdate: true, editable: true },
    { flowDefinitionEntityId: userFlow, userCanUpdate: false, editable: false },
    { flowDefinitionEntityId: codeFlow, userCanUpdate: true, editable: false },
  ])(
    "is $editable for $flowDefinitionEntityId when the user can update it is $userCanUpdate",
    ({ editable, ...flow }) => {
      expect(canEditFlowDefinition(flow)).toBe(editable);
    },
  );
});
