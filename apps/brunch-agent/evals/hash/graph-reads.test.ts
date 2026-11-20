import { expect, test, vi } from "vitest";

import {
  browserToolEnvelopeOf,
  brunchTools,
  parseHashEntityReadInput,
  type ClientToolResult,
} from "@hashintel/brunch-agent";

import { createHashEntityReadTool } from "../../src/agents/hash/tools/hash-graph-reads.ts";

import type { BrowserToolExecutor } from "../../src/shared/conversation/browser-tool-executor.ts";
import type { FlueLogger } from "@flue/runtime";

const webId = "00000000-0000-4000-8000-000000000001";
const orderId = `${webId}~00000000-0000-4000-8000-000000000010`;
const linkId = `${webId}~00000000-0000-4000-8000-000000000011`;
const customerId =
  "00000000-0000-4000-8000-000000000002~00000000-0000-4000-8000-000000000012";
const orderTypeId = "https://example.com/types/entity-type/order/v/1";
const linkTypeId = "https://example.com/types/entity-type/has-customer/v/1";

const orderRead: ClientToolResult["output"] = {
  entityTypes: [
    {
      entityTypeId: orderTypeId,
      title: "Order",
    },
    {
      entityTypeId: linkTypeId,
      title: "Has Customer",
    },
  ],
  propertyTypes: [],
  entities: [
    {
      entityId: orderId,
      editionId: "order-edition",
      webId,
      entityTypeIds: [orderTypeId],
      properties: {},
      draft: false,
      matched: true,
    },
    {
      entityId: linkId,
      editionId: "link-edition",
      webId,
      entityTypeIds: [linkTypeId],
      properties: {},
      draft: false,
      matched: false,
      linkData: { leftEntityId: orderId, rightEntityId: customerId },
    },
  ],
};

const log = {
  info: vi.fn<FlueLogger["info"]>(),
  warn: vi.fn<FlueLogger["warn"]>(),
  error: vi.fn<FlueLogger["error"]>(),
};
const readCurrent = async (execute: BrowserToolExecutor, input: unknown) => {
  const tool = createHashEntityReadTool(execute);
  const result = await tool.run({
    data: parseHashEntityReadInput(input),
    toolCallId: "current-read",
    log,
  });
  const envelope = browserToolEnvelopeOf(
    typeof result === "object" ? result.output : undefined,
  );
  if (typeof envelope?.output !== "string") {
    throw new Error("Expected model-facing text in the browser result.");
  }
  return envelope.output;
};

test.each([true, false])(
  "the entity read describes the inventory's completeness with truncated=%s",
  async (truncated) => {
    const output = {
      entityTypes: [{ entityTypeId: orderTypeId, title: "Order" }],
      propertyTypes: [],
      entities: Array.from({ length: 1_000 }, (_, index) => ({
        entityId: `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        editionId: `order-edition-${index}`,
        webId,
        entityTypeIds: [orderTypeId],
        properties: {},
        draft: false,
        matched: true,
      })),
      ...(truncated ? { truncated: true as const } : {}),
    };
    const execute: BrowserToolExecutor = async () => ({ output });
    const current = await readCurrent(execute, {
      entityTypes: [orderTypeId],
      traversalDepth: 0,
    });

    expect(current).toContain("entities: 1000");
    expect(current.includes("More may match than shown")).toBe(truncated);
  },
);

test("the entity read preserves the link when the customer read returns no visible record", async () => {
  const execute = vi.fn<BrowserToolExecutor>(async (call) => ({
    output: parseHashEntityReadInput(call.input).entityIds?.includes(orderId)
      ? orderRead
      : { entityTypes: [], propertyTypes: [], entities: [] },
  }));

  const currentOrder = await readCurrent(execute, {
    entityIds: [orderId],
    traversalDepth: 1,
  });
  expect(currentOrder).toContain(`linksTo: ${customerId}`);
  expect(currentOrder).not.toContain(`entityId: ${customerId}`);

  const currentCustomer = await readCurrent(execute, {
    entityIds: [customerId],
    traversalDepth: 1,
  });
  expect(currentCustomer).toContain(
    "No entities matched that the signed-in user can see",
  );

  expect(
    execute.mock.calls.map(([call]) => {
      const { entityIds, traversalDepth } = parseHashEntityReadInput(
        call.input,
      );
      return { toolName: call.toolName, entityIds, traversalDepth };
    }),
  ).toEqual([
    {
      toolName: brunchTools.hashQueryEntities,
      entityIds: [orderId],
      traversalDepth: 1,
    },
    {
      toolName: brunchTools.hashQueryEntities,
      entityIds: [customerId],
      traversalDepth: 1,
    },
  ]);
});

test("the entity read recovers a summarised value from the same entity edition, whole or by path", async () => {
  const netId = `${webId}~00000000-0000-4000-8000-000000000020`;
  const definitionUrl = "https://example.com/types/property-type/definition/";
  const parameters = [{ name: "Conveyor idle rate", defaultValue: "0.037" }];
  const definition = {
    places: Array.from({ length: 100 }, (_, index) => `buffer-${index}`),
    parameters,
  };
  const execute = vi.fn<BrowserToolExecutor>(async () => ({
    output: {
      entityTypes: [],
      propertyTypes: [],
      entities: [
        {
          entityId: netId,
          editionId: "conveyor-edition",
          webId,
          entityTypeIds: [
            "https://example.com/types/entity-type/petri-net/v/1",
          ],
          properties: { [definitionUrl]: definition },
          matched: true,
          draft: false,
        },
      ],
    },
  }));

  const summary = await readCurrent(execute, { entityIds: [netId] });
  expect(summary).toContain("<object");
  expect(summary).toContain("parameters");
  expect(summary).toContain("fullValuesFor");
  expect(summary).not.toContain("0.037");

  execute.mockClear();
  const path = ["definition", "parameters"];
  const fullValue = await readCurrent(execute, {
    entityIds: [netId],
    fullValuesFor: [netId],
  });
  const byPath = await readCurrent(execute, {
    entityIds: [netId],
    fullValuesFor: [{ entityId: netId, path }],
  });
  expect(execute.mock.calls.map(([call]) => call.input)).toEqual([
    expect.objectContaining({ entityIds: [netId], fullValuesFor: [netId] }),
    expect.objectContaining({
      entityIds: [netId],
      fullValuesFor: [{ entityId: netId, path }],
    }),
  ]);
  for (const read of [fullValue, byPath]) {
    expect(read).toContain("conveyor-edition");
    expect(read).toContain("Conveyor idle rate");
    expect(read).toContain("0.037");
  }
  expect(fullValue).toContain("buffer-99");
  expect(byPath).toContain(
    `path ${JSON.stringify(path)}: ${JSON.stringify(parameters)}`,
  );
  expect(byPath).not.toContain("buffer-99");
});

test("the entity read preserves separate definitions for a property whose unit changed", async () => {
  const firstId = `${webId}~00000000-0000-4000-8000-000000000030`;
  const secondId = `${webId}~00000000-0000-4000-8000-000000000031`;
  const intervalUrl =
    "https://example.com/types/property-type/service-interval/";
  const machineUrl = "https://example.com/types/entity-type/machine/";
  const entityTypes = [
    { entityTypeId: `${machineUrl}v/1`, title: "Machine" },
    { entityTypeId: `${machineUrl}v/2`, title: "Machine" },
  ];
  const execute: BrowserToolExecutor = async (call) => {
    expect(parseHashEntityReadInput(call.input).entityIds).toEqual([
      firstId,
      secondId,
    ]);
    return {
      output: {
        entityTypes,
        propertyTypes: [
          {
            baseUrl: intervalUrl,
            propertyTypeId: `${intervalUrl}v/1`,
            title: "Service interval",
            description: "Measured in days.",
          },
          {
            baseUrl: intervalUrl,
            propertyTypeId: `${intervalUrl}v/2`,
            title: "Service interval",
            description: "Measured in weeks.",
          },
        ],
        entities: [
          {
            entityId: firstId,
            webId,
            editionId: "machine-first-edition",
            entityTypeIds: [`${machineUrl}v/1`],
            properties: { [intervalUrl]: 8 },
            draft: false,
            matched: true,
          },
          {
            entityId: secondId,
            webId,
            editionId: "machine-second-edition",
            entityTypeIds: [`${machineUrl}v/2`],
            properties: { [intervalUrl]: 4 },
            draft: false,
            matched: true,
          },
        ],
      },
    };
  };

  const current = await readCurrent(execute, {
    entityIds: [firstId, secondId],
  });
  expect(current).toMatch(/service-interval\/v\/1[^\n]*Measured in days\./u);
  expect(current).toMatch(/service-interval\/v\/2[^\n]*Measured in weeks\./u);
  expect(current).toContain(`${machineUrl}v/1`);
  expect(current).toContain(`${machineUrl}v/2`);
  expect(current).toContain("Multiple versions are alternatives");
  expect(current).toContain(
    `entityId: ${firstId}\n  editionId: machine-first-edition\n  service_interval: 8`,
  );
  expect(current).toContain(
    `entityId: ${secondId}\n  editionId: machine-second-edition\n  service_interval: 4`,
  );
});
