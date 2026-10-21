import { describe, expect, it } from "vitest";

import { canonicalizePetrinautIds } from "@hashintel/petrinaut-core";
import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import {
  generateActionSubnetName,
  generateDonePortKey,
  generateGaveUpPortKey,
  generateInputPortKey,
  generateInstanceKey,
  generateOneOfPayloadColorKey,
  generateOutputPortKey,
  generatePayloadColorKey,
  generateStartPortKey,
  generateSubnetElementKey,
  generateSubnetKey,
} from "../flow-net-keys.js";
import { generateActionSubnet } from "./generate-action-subnet.js";

import type {
  ActionDefinition,
  FlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/types";

describe("generateActionSubnet", () => {
  /*
   * An action with derived kinds gets a subnet per combination of the kinds connected to its kind sources: each is
   * given the first kind it accepts.
   */
  const firstResolvedKinds = (
    actionDefinition: ActionDefinition<FlowActionDefinitionId>,
  ) => {
    const kindSourceNames = new Set(
      [...actionDefinition.inputs, ...actionDefinition.outputs].flatMap(
        (inputOrOutput) =>
          "kindFrom" in inputOrOutput ? [inputOrOutput.kindFrom] : [],
      ),
    );

    return Object.fromEntries(
      actionDefinition.inputs.flatMap((input) => {
        const [firstKind] =
          "oneOfPayloadKinds" in input ? input.oneOfPayloadKinds : [];

        return kindSourceNames.has(input.name) && firstKind
          ? [[input.name, firstKind] as const]
          : [];
      }),
    );
  };

  for (const actionDefinition of Object.values(actionDefinitions)) {
    describe(actionDefinition.actionDefinitionId, () => {
      const resolvedKinds = firstResolvedKinds(actionDefinition);
      const subnetName = generateActionSubnetName(
        actionDefinition.actionDefinitionId,
        resolvedKinds,
      );

      it("has a port per input and output, and one it gives up through", async () => {
        const subnet = await generateActionSubnet(
          actionDefinition,
          resolvedKinds,
        );

        expect(
          subnet.places
            .filter(({ isPort }) => isPort)
            .map(({ id }) => id)
            .sort(),
        ).toEqual(
          [
            ...(actionDefinition.inputs.length > 0
              ? actionDefinition.inputs.map(({ name }) =>
                  generateInputPortKey(subnetName, name),
                )
              : [generateStartPortKey(subnetName)]),
            ...(actionDefinition.outputs.length > 0
              ? actionDefinition.outputs.map(({ name }) =>
                  generateOutputPortKey(subnetName, name),
                )
              : [generateDonePortKey(subnetName)]),
            generateGaveUpPortKey(subnetName),
          ].sort(),
        );
      });

      it("builds in Petrinaut", async () => {
        const subnet = await generateActionSubnet(
          actionDefinition,
          resolvedKinds,
        );
        const colorIds = new Set(subnet.types.map(({ id }) => id));

        for (const place of subnet.places) {
          expect(colorIds, place.id).toContain(place.colorId);
        }

        expect(() =>
          compilePetrinautModel({
            sdcpn: canonicalizePetrinautIds({
              places: [],
              transitions: [],
              types: [],
              differentialEquations: [],
              parameters: [],
              subnets: [subnet],
              componentInstances: [
                {
                  id: generateInstanceKey("step"),
                  name: "step",
                  subnetId: subnet.id,
                  parameterValues: {},
                  x: 0,
                  y: 0,
                },
              ],
            }),
          }),
        ).not.toThrow();
      });
    });
  }

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
