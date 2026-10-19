import { describe, expect, it } from "vitest";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { generateActionSubnet } from "./generate-action-subnet.js";
import {
  actionSubnetKey,
  gaveUpPortId,
  inputPortId,
  outputPortId,
} from "./shared/action-subnet-ids.js";
import { oneOfPayloadColorId, payloadColorId } from "./shared/colors.js";

import type {
  ActionDefinition,
  FlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/types";

describe("generateActionSubnet", () => {
  it("gives an action a port per input and output, and one it gives up through", async () => {
    const actionDefinition = actionDefinitions.persistEntities;
    const subnet = await generateActionSubnet(actionDefinition);
    const subnetKey = actionSubnetKey(actionDefinition.actionDefinitionId);

    expect(
      subnet.places
        .filter(({ isPort }) => isPort)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(
      [
        ...actionDefinition.inputs.map(({ name }) =>
          inputPortId(subnetKey, name),
        ),
        ...actionDefinition.outputs.map(({ name }) =>
          outputPortId(subnetKey, name),
        ),
        gaveUpPortId(subnetKey),
      ].sort(),
    );
  });

  it("starts once every input port has a token, and loops on failure until giving up", async () => {
    const subnet = await generateActionSubnet(
      actionDefinitions.persistEntities,
    );

    const arcsOf = (transitionId: string) => {
      const transition = subnet.transitions.find(
        ({ id }) => id === transitionId,
      );

      return {
        from: transition?.inputArcs.map(({ endpoint }) =>
          endpoint?.kind === "place" ? endpoint.placeId : null,
        ),
        to: transition?.outputArcs.map(({ endpoint }) =>
          endpoint?.kind === "place" ? endpoint.placeId : null,
        ),
      };
    };

    expect(arcsOf("t.persistEntities.startAttempt")).toEqual({
      from: [
        "p.persistEntities.in.proposedEntities",
        "p.persistEntities.in.draft",
      ],
      to: ["p.persistEntities.inProgress"],
    });
    expect(arcsOf("t.persistEntities.succeedAttempt")).toEqual({
      from: ["p.persistEntities.inProgress"],
      to: [
        "p.persistEntities.out.persistedEntities",
        "p.persistEntities.out.failedEntityProposals",
      ],
    });
    expect(arcsOf("t.persistEntities.retryAttempt")).toEqual({
      from: ["p.persistEntities.failed"],
      to: ["p.persistEntities.inProgress"],
    });
    expect(arcsOf("t.persistEntities.giveUp")).toEqual({
      from: ["p.persistEntities.failed"],
      to: [gaveUpPortId("persistEntities")],
    });
  });

  it("types the ports of an action with derived kinds by the kinds resolved for a step", async () => {
    const findAction = {
      kind: "action",
      actionDefinitionId: "find",
      name: "Find",
      description: "",
      inputs: [
        {
          name: "items",
          oneOfPayloadKinds: ["Text", "PersistedEntityMetadata"],
          array: true,
          required: true,
        },
        { name: "fallback", kindFrom: "items", array: false, required: false },
      ],
      outputs: [
        { name: "match", kindFrom: "items", array: false, required: false },
      ],
    } as unknown as ActionDefinition<FlowActionDefinitionId>;

    const resolvedKinds = { items: "PersistedEntityMetadata" } as const;
    const subnetKey = actionSubnetKey("find", resolvedKinds);

    const subnet = await generateActionSubnet(findAction, resolvedKinds);

    const portColor = (portId: string) =>
      subnet.places.find(({ id }) => id === portId)?.colorId;

    expect(subnetKey).toBe("find.PersistedEntityMetadata");
    expect(subnet.id).toBe("subnet.find.PersistedEntityMetadata");
    expect(portColor(inputPortId(subnetKey, "items"))).toBe(
      payloadColorId("PersistedEntityMetadata", true),
    );
    expect(portColor(inputPortId(subnetKey, "fallback"))).toBe(
      payloadColorId("PersistedEntityMetadata", false),
    );
    expect(portColor(outputPortId(subnetKey, "match"))).toBe(
      payloadColorId("PersistedEntityMetadata", false),
    );

    await expect(generateActionSubnet(findAction)).rejects.toThrow(
      "isn't resolved",
    );
  });
  it("types an input accepting several kinds by all of them, when no other input or output takes its kind", async () => {
    const subnetKey = actionSubnetKey("inferEntitiesFromContent");

    const subnet = await generateActionSubnet(
      actionDefinitions.inferEntitiesFromContent,
    );

    const contentColorId = subnet.places.find(
      ({ id }) => id === inputPortId(subnetKey, "content"),
    )?.colorId;

    expect(contentColorId).toBe(
      oneOfPayloadColorId(["Text", "WebPage"], false),
    );
    expect(
      subnet.types
        .find(({ id }) => id === contentColorId)
        ?.elements.map(({ name }) => name),
    ).toContain("kind");
  });
});
