import { describe, expect, it } from "vitest";

import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { actionStep, flowWith } from "../../shared/step-fixtures";
import { getPathInSource } from "../field-problems";
import {
  getProblemRowIndex,
  readPatchesForm,
  readPropertiesForm,
  toPatchesSource,
  toPropertiesSource,
} from "./property-form";

import type { PropertyValueKind } from "../shared/condition-properties";
import type { PropertyRow, SetRow } from "./property-form";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type {
  FlowDefinition,
  PayloadKind,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

const nameUrl =
  "https://example.com/@acme/types/property-type/name/" as BaseUrl;
const statusUrl =
  "https://example.com/@acme/types/property-type/status/" as BaseUrl;
const employeesUrl =
  "https://example.com/@acme/types/property-type/employees/" as BaseUrl;
const foundedUrl =
  "https://example.com/@acme/types/property-type/founded/" as BaseUrl;

const textId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as VersionedUrl;
const statusId =
  "https://example.com/@acme/types/data-type/status/v/2" as VersionedUrl;
const integerId =
  "https://example.com/@acme/types/data-type/integer/v/1" as VersionedUrl;

const valueKinds = new Map<BaseUrl, PropertyValueKind>([
  [nameUrl, { kind: "Text" }],
  [statusUrl, { kind: "Text", options: ["Lead", "Contacted"] }],
  [employeesUrl, { kind: "Number" }],
  [foundedUrl, { kind: "Date" }],
]);
const getValueKind = (baseUrl: BaseUrl) => valueKinds.get(baseUrl);

const setRows: SetRow[] = [
  { propertyBaseUrl: nameUrl, op: "set", value: "Acme", dataTypeId: textId },
  {
    propertyBaseUrl: statusUrl,
    op: "set",
    value: "Contacted",
    dataTypeId: statusId,
  },
  { propertyBaseUrl: employeesUrl, op: "set", value: 0, dataTypeId: integerId },
];

const headcount = { kind: "flow-input", inputName: "headcount" } as const;
const foundName = {
  kind: "step-output",
  stepId: "findName",
  outputName: "explanation",
} as const;

/** Rows that type the status, and take the number of employees from a flow input and the name from an earlier step. */
const sourcedRows: SetRow[] = [
  {
    propertyBaseUrl: statusUrl,
    op: "set",
    value: "Contacted",
    dataTypeId: statusId,
  },
  {
    propertyBaseUrl: employeesUrl,
    op: "set",
    from: headcount,
    dataTypeId: integerId,
  },
  { propertyBaseUrl: nameUrl, op: "set", from: foundName, dataTypeId: textId },
];

const fixed = (kind: PayloadKind, value: unknown): StepInputSource => ({
  kind: "constant",
  payload: { kind, value },
});

const companyTypeId =
  "https://example.com/@acme/types/entity-type/company/v/1" as VersionedUrl;

/** A flow with a number and an entity as inputs and a step that gives a text, then `steps`, which can take all three. */
const flowTaking = (
  steps: FlowDefinition<string>["steps"],
): FlowDefinition<string> => ({
  ...flowWith([
    actionStep("findName", {
      actionDefinitionId: "answerQuestion",
      inputs: { question: fixed("Text", "What is the company called?") },
    }),
    ...steps,
  ]),
  inputs: [
    { name: "headcount", payloadKind: "Number", array: false, required: true },
    { name: "company", payloadKind: "EntityId", array: false, required: true },
  ],
});

const errorsOf = (flowDefinition: FlowDefinition<string>) =>
  validateFlowDefinition(flowDefinition).diagnostics.filter(
    ({ severity }) => severity === "error",
  );

const createStep = (properties: StepInputSource) =>
  actionStep("create", {
    actionDefinitionId: "createEntity",
    inputs: {
      entityTypeIds: fixed("VersionedUrl", [companyTypeId]),
      properties,
    },
  });

const updateStep = (propertyPatches: StepInputSource) =>
  actionStep("update", {
    actionDefinitionId: "updateEntity",
    inputs: {
      entityId: { kind: "flow-input", inputName: "company" },
      propertyPatches,
    },
  });

describe("toPropertiesSource", () => {
  it("gives typed values as one fixed value, each with its data type ID, as the graph takes them, and reads back as it was set", () => {
    const source = toPropertiesSource(setRows);

    expect(source).toEqual(
      fixed("PropertyObjectWithMetadata", {
        value: {
          [nameUrl]: { value: "Acme", metadata: { dataTypeId: textId } },
          [statusUrl]: {
            value: "Contacted",
            metadata: { dataTypeId: statusId },
          },
          [employeesUrl]: { value: 0, metadata: { dataTypeId: integerId } },
        },
      }),
    );
    expect(errorsOf(flowTaking([createStep(source)]))).toEqual([]);
    expect(readPropertiesForm(source, getValueKind)).toEqual(setRows);
  });

  it("gives each value a source of its own once one comes from a flow input or an earlier step, and reads back as it was set", () => {
    const source = toPropertiesSource(sourcedRows);

    expect(source).toEqual({
      kind: "properties",
      values: {
        [statusUrl]: { dataTypeId: statusId, from: fixed("Text", "Contacted") },
        [employeesUrl]: { dataTypeId: integerId, from: headcount },
        [nameUrl]: { dataTypeId: textId, from: foundName },
      },
    });
    expect(errorsOf(flowTaking([createStep(source)]))).toEqual([]);
    expect(readPropertiesForm(source, getValueKind)).toEqual(sourcedRows);
  });
});

describe("toPatchesSource", () => {
  it("adds a set property, so it doesn't matter whether the entity has it, removes a removed one, and reads back as it was set", () => {
    const rows: PropertyRow[] = [
      {
        propertyBaseUrl: statusUrl,
        op: "set",
        value: "Contacted",
        dataTypeId: statusId,
      },
      { propertyBaseUrl: foundedUrl, op: "remove" },
    ];
    const source = toPatchesSource(rows);

    expect(source).toEqual(
      fixed("PropertyPatch", [
        {
          op: "add",
          path: [statusUrl],
          property: { value: "Contacted", metadata: { dataTypeId: statusId } },
        },
        { op: "remove", path: [foundedUrl] },
      ]),
    );
    expect(errorsOf(flowTaking([updateStep(source)]))).toEqual([]);
    expect(readPatchesForm(source, getValueKind)).toEqual(rows);
  });

  it("gives each value a source of its own once one comes from a flow input or an earlier step, and reads back as it was set", () => {
    const rows: PropertyRow[] = [
      ...sourcedRows,
      { propertyBaseUrl: foundedUrl, op: "remove" },
    ];
    const source = toPatchesSource(rows);

    expect(source).toEqual({
      kind: "property-patches",
      patches: [
        {
          op: "add",
          path: [statusUrl],
          dataTypeId: statusId,
          from: fixed("Text", "Contacted"),
        },
        {
          op: "add",
          path: [employeesUrl],
          dataTypeId: integerId,
          from: headcount,
        },
        { op: "add", path: [nameUrl], dataTypeId: textId, from: foundName },
        { op: "remove", path: [foundedUrl] },
      ],
    });
    expect(errorsOf(flowTaking([updateStep(source)]))).toEqual([]);
    expect(readPatchesForm(source, getValueKind)).toEqual(rows);
  });
});

describe("readPropertiesForm", () => {
  it("can't show properties it didn't make", () => {
    const text = { dataTypeId: textId };
    const unreadable = [
      /* The graph needs every value's data type ID. */
      { value: { [nameUrl]: { value: "Acme", metadata: {} } } },
      {
        value: {
          [nameUrl]: {
            value: "Acme",
            metadata: { ...text, provenance: { sources: [] } },
          },
        },
      },
      { value: { [nameUrl]: { value: [{ value: "Acme", metadata: text }] } } },
      /* A number given as text, and a date that isn't one. */
      { value: { [employeesUrl]: { value: "12", metadata: text } } },
      { value: { [foundedUrl]: { value: "2026-13-01", metadata: text } } },
      {
        value: {
          "https://example.com/@acme/types/property-type/unknown/": {
            value: "Acme",
            metadata: text,
          },
        },
      },
      {
        value: {
          [nameUrl]: { value: "Acme", metadata: { dataTypeId: "text" } },
        },
      },
      [],
    ];

    for (const properties of unreadable) {
      expect(
        readPropertiesForm(
          fixed("PropertyObjectWithMetadata", properties),
          getValueKind,
        ),
      ).toBeNull();
    }

    /* Changes aren't properties. */
    expect(
      readPropertiesForm(fixed("PropertyPatch", []), getValueKind),
    ).toBeNull();
  });

  it("can't show values with sources that the rows never give", () => {
    const unreadable = [
      /* A value wrapped into a list. */
      { [nameUrl]: { dataTypeId: textId, from: { ...foundName, wrap: true } } },
      /* A fixed number given as text. */
      { [employeesUrl]: { dataTypeId: integerId, from: fixed("Text", "12") } },
      { [nameUrl]: { dataTypeId: "text", from: foundName } },
      {
        "https://example.com/@acme/types/property-type/unknown/": {
          dataTypeId: textId,
          from: foundName,
        },
      },
    ];

    for (const values of unreadable) {
      expect(
        readPropertiesForm(
          { kind: "properties", values } as StepInputSource,
          getValueKind,
        ),
      ).toBeNull();
    }
  });
});

describe("readPatchesForm", () => {
  it("can't show patches it didn't make", () => {
    const property = { value: "Acme", metadata: { dataTypeId: textId } };
    const unreadable = [
      /* Replacing fails when the entity doesn't have the property, so the rows never make it. */
      [{ op: "replace", path: [nameUrl], property }],
      [{ op: "add", path: [nameUrl, 0], property }],
      [
        {
          op: "add",
          path: [nameUrl],
          property: { value: "Acme", metadata: {} },
        },
      ],
      [
        { op: "add", path: [nameUrl], property },
        { op: "remove", path: [nameUrl] },
      ],
      [{ op: "remove", path: ["https://example.com/other/"] }],
      { op: "remove", path: [nameUrl] },
    ];

    for (const patches of unreadable) {
      expect(
        readPatchesForm(fixed("PropertyPatch", patches), getValueKind),
      ).toBeNull();
    }
  });

  it("can't show patches with sources that the rows never give", () => {
    const name = { path: [nameUrl], dataTypeId: textId, from: foundName };
    const unreadable = [
      [{ op: "replace", ...name }],
      [{ op: "add", ...name, path: [nameUrl, "0"] }],
      [
        { op: "add", ...name },
        { op: "remove", path: [nameUrl] },
      ],
      [{ op: "add", ...name, from: { ...foundName, wrap: true } }],
    ];

    for (const patches of unreadable) {
      expect(
        readPatchesForm(
          { kind: "property-patches", patches } as StepInputSource,
          getValueKind,
        ),
      ).toBeNull();
    }
  });
});

describe("getProblemRowIndex", () => {
  const rows: PropertyRow[] = [
    ...sourcedRows,
    { propertyBaseUrl: foundedUrl, op: "remove" },
  ];

  it("finds the row a problem with one value is about, where the validator reports it", () => {
    /* The earlier step is gone, so the value of the third property, or of the third patch, has no source. */
    for (const step of [
      createStep(toPropertiesSource(sourcedRows)),
      updateStep(toPatchesSource(rows)),
    ]) {
      const [problem, ...others] = errorsOf({
        ...flowTaking([]),
        steps: [step],
      });

      expect(others).toEqual([]);
      expect(problem?.code).toBe("unknownStep");
      expect(getProblemRowIndex(getPathInSource(problem!), rows)).toBe(2);
    }
  });

  it("gives no row for a problem with the input as a whole", () => {
    expect(getProblemRowIndex([], rows)).toBeUndefined();
    expect(getProblemRowIndex(["payload", "value"], rows)).toBeUndefined();
    expect(
      getProblemRowIndex(
        ["values", "https://example.com/other/", "from"],
        rows,
      ),
    ).toBeUndefined();
  });
});
