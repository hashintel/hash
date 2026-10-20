import { describe, expect, it } from "vitest";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import {
  generateActionSubnetName,
  generateGaveUpPortKey,
  generateInputPortKey,
  generateOneOfPayloadColorKey,
  generateOutputPortKey,
  generatePayloadColorKey,
  generateSubnetElementKey,
  generateSubnetKey,
} from "../flow-net-keys.js";
import { generateActionSubnet } from "./generate-action-subnet.js";

import type {
  ActionDefinition,
  FlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/types";

describe("generateActionSubnet", () => {
  it("gives an action a port per input and output, and one it gives up through", async () => {
    const actionDefinition = actionDefinitions.persistEntities;
    const subnet = await generateActionSubnet(actionDefinition);
    const subnetName = generateActionSubnetName(
      actionDefinition.actionDefinitionId,
    );

    expect(
      subnet.places
        .filter(({ isPort }) => isPort)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(
      [
        ...actionDefinition.inputs.map(({ name }) =>
          generateInputPortKey(subnetName, name),
        ),
        ...actionDefinition.outputs.map(({ name }) =>
          generateOutputPortKey(subnetName, name),
        ),
        generateGaveUpPortKey(subnetName),
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

    expect(
      arcsOf(generateSubnetElementKey("t", "persistEntities", "startAttempt")),
    ).toEqual({
      from: [
        generateInputPortKey("persistEntities", "proposedEntities"),
        generateInputPortKey("persistEntities", "draft"),
      ],
      to: [generateSubnetElementKey("p", "persistEntities", "inProgress")],
    });
    expect(
      arcsOf(
        generateSubnetElementKey("t", "persistEntities", "succeedAttempt"),
      ),
    ).toEqual({
      from: [generateSubnetElementKey("p", "persistEntities", "inProgress")],
      to: [
        generateOutputPortKey("persistEntities", "persistedEntities"),
        generateOutputPortKey("persistEntities", "failedEntityProposals"),
      ],
    });
    expect(
      arcsOf(generateSubnetElementKey("t", "persistEntities", "retryAttempt")),
    ).toEqual({
      from: [generateSubnetElementKey("p", "persistEntities", "failed")],
      to: [generateSubnetElementKey("p", "persistEntities", "inProgress")],
    });
    expect(
      arcsOf(generateSubnetElementKey("t", "persistEntities", "giveUp")),
    ).toEqual({
      from: [generateSubnetElementKey("p", "persistEntities", "failed")],
      to: [generateGaveUpPortKey("persistEntities")],
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
    const subnetName = generateActionSubnetName("find", resolvedKinds);

    const subnet = await generateActionSubnet(findAction, resolvedKinds);

    const portColor = (portId: string) =>
      subnet.places.find(({ id }) => id === portId)?.colorId;

    expect(subnetName).not.toBe(generateActionSubnetName("find"));
    expect(subnet.id).toBe(generateSubnetKey(subnetName));
    expect(portColor(generateInputPortKey(subnetName, "items"))).toBe(
      generatePayloadColorKey("PersistedEntityMetadata", true),
    );
    expect(portColor(generateInputPortKey(subnetName, "fallback"))).toBe(
      generatePayloadColorKey("PersistedEntityMetadata", false),
    );
    expect(portColor(generateOutputPortKey(subnetName, "match"))).toBe(
      generatePayloadColorKey("PersistedEntityMetadata", false),
    );

    await expect(generateActionSubnet(findAction)).rejects.toThrow(
      "isn't resolved",
    );
  });
  it("types an input accepting several kinds by all of them, when no other input or output takes its kind", async () => {
    const subnetName = generateActionSubnetName("inferEntitiesFromContent");

    const subnet = await generateActionSubnet(
      actionDefinitions.inferEntitiesFromContent,
    );

    const contentColorId = subnet.places.find(
      ({ id }) => id === generateInputPortKey(subnetName, "content"),
    )?.colorId;

    expect(contentColorId).toBe(
      generateOneOfPayloadColorKey(["Text", "WebPage"], false),
    );
    expect(
      subnet.types
        .find(({ id }) => id === contentColorId)
        ?.elements.map(({ name }) => name),
    ).toContain("kind");
  });
});
