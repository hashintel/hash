import { describe, expect, test } from "vitest";

import { linkEndsMessage, noEntityChangesMessage } from "./entity-steps.js";
import {
  baseDefinition,
  errorDiagnosticsOf,
} from "./validate-flow-definition-fixtures.js";

import type {
  Fixture,
  FixtureObject,
  FlowDefinitionFixture,
} from "./validate-flow-definition-fixtures.js";

const nameUrl = "https://example.com/types/property-type/name/";
const emailUrl = "https://example.com/types/property-type/email/";
const textMetadata = {
  dataTypeId: "https://example.com/types/data-type/text/v/1",
};

const createEntityDefinition = (
  properties: Fixture,
): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    {
      name: "properties",
      payloadKind: "PropertyObjectWithMetadata",
      array: false,
      required: true,
    },
  ],
  steps: [
    {
      kind: "action",
      stepId: "create",
      actionDefinitionId: "createEntity",
      description: "",
      inputs: {
        entityTypeIds: {
          kind: "constant",
          payload: {
            kind: "VersionedUrl",
            value: ["https://example.com/types/entity-type/person/v/1"],
          },
        },
        properties,
      },
    },
  ],
});

const constantProperties = (value: FixtureObject): FixtureObject => ({
  kind: "constant",
  payload: { kind: "PropertyObjectWithMetadata", value },
});

describe("properties of createEntity steps", () => {
  test.each([
    {
      name: "a constant with a data type ID for each value, including in a list",
      properties: constantProperties({
        value: {
          [nameUrl]: { value: "Ada", metadata: textMetadata },
          [emailUrl]: {
            value: [{ value: "ada@example.com", metadata: textMetadata }],
          },
        },
      }),
    },
    {
      name: "a constant with no properties",
      properties: constantProperties({ value: {} }),
    },
    {
      name: "a flow input, which is checked when the step runs",
      properties: { kind: "flow-input", inputName: "properties" },
    },
  ])("accepts $name", ({ properties }) => {
    expect.hasAssertions();

    expect(
      errorDiagnosticsOf(createEntityDefinition(properties)),
    ).toStrictEqual([]);
  });

  test.each([
    {
      name: "properties without metadata",
      value: { [nameUrl]: "Ada" },
      message:
        "Properties must be an object whose value is keyed by property type base URL.",
    },
    {
      name: "a property type versioned URL rather than a base URL",
      value: {
        value: { [`${nameUrl}v/1`]: { value: "Ada", metadata: textMetadata } },
      },
      message: `"${nameUrl}v/1" is not a property type base URL.`,
    },
    {
      name: "a value without a data type ID",
      value: {
        value: {
          [nameUrl]: { value: "Ada", metadata: { dataTypeId: null } },
        },
      },
      message: `Property ${nameUrl} must give the data type ID of each of its values.`,
    },
    {
      name: "an item of a list without a data type ID",
      value: {
        value: { [emailUrl]: { value: [{ value: "ada@example.com" }] } },
      },
      message: `Property ${emailUrl} must give the data type ID of each of its values.`,
    },
  ])("rejects $name", ({ value, message }) => {
    expect.hasAssertions();

    const definition = createEntityDefinition(constantProperties(value));

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "invalidInput",
        message,
        path: ["steps", 0, "inputs", "properties"],
      },
    ]);
  });
});

const createLinkEntityDefinition = (
  linkInputs: FixtureObject,
): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "company", payloadKind: "EntityId", array: false, required: true },
    { name: "person", payloadKind: "EntityId", array: false, required: true },
  ],
  steps: [
    {
      kind: "action",
      stepId: "create",
      actionDefinitionId: "createEntity",
      description: "",
      inputs: {
        entityTypeIds: {
          kind: "constant",
          payload: {
            kind: "VersionedUrl",
            value: ["https://example.com/types/entity-type/works-for/v/1"],
          },
        },
        properties: constantProperties({ value: {} }),
        ...linkInputs,
      },
    },
  ],
});

const person = { kind: "flow-input", inputName: "person" };
const company = { kind: "flow-input", inputName: "company" };

describe("link ends of createEntity steps", () => {
  test("accepts both ends", () => {
    expect.hasAssertions();

    const definition = createLinkEntityDefinition({
      leftEntityId: person,
      rightEntityId: company,
    });

    expect(errorDiagnosticsOf(definition)).toStrictEqual([]);
  });

  test.each([
    {
      name: "the entity a link links from without the one it links to",
      linkInputs: { leftEntityId: person },
      missing: "rightEntityId",
    },
    {
      name: "the entity a link links to without the one it links from",
      linkInputs: { rightEntityId: company },
      missing: "leftEntityId",
    },
  ])("rejects $name", ({ linkInputs, missing }) => {
    expect.hasAssertions();

    const definition = createLinkEntityDefinition(linkInputs);

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "invalidInput",
        message: linkEndsMessage,
        path: ["steps", 0, "inputs", missing],
      },
    ]);
  });
});

const updateEntityDefinition = (
  propertyPatches: Fixture,
  otherInputs: FixtureObject = {},
): FlowDefinitionFixture => ({
  ...baseDefinition,
  inputs: [
    { name: "person", payloadKind: "EntityId", array: false, required: true },
    {
      name: "patches",
      payloadKind: "PropertyPatch",
      array: true,
      required: true,
    },
    {
      name: "types",
      payloadKind: "VersionedUrl",
      array: true,
      required: true,
    },
  ],
  steps: [
    {
      kind: "action",
      stepId: "update",
      actionDefinitionId: "updateEntity",
      description: "",
      inputs: {
        entityId: { kind: "flow-input", inputName: "person" },
        ...(propertyPatches === undefined ? {} : { propertyPatches }),
        ...otherInputs,
      },
    },
  ],
});

const types = { kind: "flow-input", inputName: "types" };

const constantPropertyPatches = (value: Fixture[]): FixtureObject => ({
  kind: "constant",
  payload: { kind: "PropertyPatch", value },
});

describe("property patches of updateEntity steps", () => {
  test.each([
    {
      name: "constant patches that add, replace and remove whole properties",
      propertyPatches: constantPropertyPatches([
        {
          op: "add",
          path: [nameUrl],
          property: { value: "Ada", metadata: textMetadata },
        },
        {
          op: "replace",
          path: [emailUrl],
          property: {
            value: [{ value: "ada@example.com", metadata: textMetadata }],
          },
        },
        {
          op: "remove",
          path: ["https://example.com/types/property-type/age/"],
        },
      ]),
    },
    {
      name: "a flow input, which is checked when the step runs",
      propertyPatches: { kind: "flow-input", inputName: "patches" },
    },
    {
      name: "types with no patches",
      propertyPatches: constantPropertyPatches([]),
      otherInputs: { entityTypeIds: types },
    },
  ])("accepts $name", ({ propertyPatches, otherInputs }) => {
    expect.hasAssertions();

    expect(
      errorDiagnosticsOf(updateEntityDefinition(propertyPatches, otherInputs)),
    ).toStrictEqual([]);
  });

  test("rejects types without patches, so that the step is skipped when connected patches are missing", () => {
    expect.hasAssertions();

    const definition = updateEntityDefinition(undefined, {
      entityTypeIds: types,
    });

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "missingInput",
        message:
          'Required input "propertyPatches" of action "updateEntity" is not connected',
        path: ["steps", 0, "inputs"],
      },
    ]);
  });

  test.each([
    {
      name: "no patches, without types",
      value: [],
      message: noEntityChangesMessage,
    },
    {
      name: "an op the graph doesn't have",
      value: [{ op: "move", path: [nameUrl] }],
      message: "Property patch 1 must have an op of add, remove, replace.",
    },
    {
      name: "a path of a property type versioned URL",
      value: [{ op: "remove", path: [`${nameUrl}v/1`] }],
      message: "Property patch 1 must have a path of a property type base URL.",
    },
    {
      name: "a path inside a property's value",
      value: [
        { op: "remove", path: [nameUrl] },
        { op: "remove", path: [emailUrl, 0] },
      ],
      message: `Property patch 2 changes part of property ${emailUrl}, which isn't supported yet: give its whole value.`,
    },
    {
      name: "two patches to the same property, which fail if applied again",
      value: [
        {
          op: "replace",
          path: [nameUrl],
          property: { value: "Ada", metadata: textMetadata },
        },
        { op: "remove", path: [nameUrl] },
      ],
      message: `Property patch 2 changes property ${nameUrl} again: give one patch per property.`,
    },
    {
      name: "a value without a data type ID",
      value: [
        {
          op: "add",
          path: [nameUrl],
          property: { value: "Ada", metadata: { dataTypeId: null } },
        },
      ],
      message: `Property ${nameUrl} must give the data type ID of each of its values.`,
    },
  ])("rejects $name", ({ value, message }) => {
    expect.hasAssertions();

    const definition = updateEntityDefinition(constantPropertyPatches(value));

    expect(errorDiagnosticsOf(definition)).toStrictEqual([
      {
        severity: "error",
        code: "invalidInput",
        message,
        path: ["steps", 0, "inputs", "propertyPatches"],
      },
    ]);
  });
});
