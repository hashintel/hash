import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { filterStoredList, resolveConditionEntities } from "./filter-io.js";
import { evaluateIf, filterList } from "./filter-values.js";

import type {
  ConditionEntity,
  SingleFilterCondition,
} from "./evaluate-condition.js";
import type {
  EntityResolver,
  FilterListStorage,
  StoredFilterListResult,
} from "./filter-io.js";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

const scoreUrl = "https://example.com/types/property-type/score/" as BaseUrl;
const companyType =
  "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
const entityId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002" as EntityId;
const otherId =
  "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000003" as EntityId;
const condition: SingleFilterCondition = {
  kind: "condition",
  subject: {
    kind: "entityProperty",
    propertyTypeBaseUrl: scoreUrl,
    payloadKind: "Number",
  },
  operator: "greaterThan",
  value: { kind: "Number", value: 5 },
};

describe("resolveConditionEntities", () => {
  it("resolves each ID once and reuses the same context for If and Filter list", async () => {
    const entity: ConditionEntity = {
      properties: { [scoreUrl]: 9 },
      entityTypeIds: [companyType],
    };
    const resolveEntity = vi
      .fn<EntityResolver>()
      .mockImplementation((id) =>
        Promise.resolve(
          id === entityId ? entity : { ...entity, properties: {} },
        ),
      );
    const resolved = await resolveConditionEntities(
      condition,
      { kind: "EntityId", value: [entityId, otherId, entityId] },
      resolveEntity,
    );
    expect(resolveEntity).toHaveBeenCalledTimes(2);
    expect(resolveEntity).toHaveBeenCalledWith(entityId);
    expect(resolveEntity).toHaveBeenCalledWith(otherId);
    expect(resolved.status).toBe("success");
    if (resolved.status !== "success") {
      return;
    }
    expect(
      evaluateIf(
        { kind: "EntityId", value: entityId },
        condition,
        resolved.context,
      ),
    ).toEqual({
      status: "success",
      outputName: "true",
      payload: { kind: "EntityId", value: entityId },
    });
    expect(
      filterList(
        { kind: "EntityId", value: [entityId, otherId, entityId] },
        condition,
        resolved.context,
      ),
    ).toEqual({
      status: "success",
      matching: { kind: "EntityId", value: [entityId, entityId] },
      nonMatching: { kind: "EntityId", value: [otherId] },
    });
  });

  it("does not fetch for ID equality or an invalid condition", async () => {
    const resolveEntity = vi.fn<EntityResolver>();
    await resolveConditionEntities(
      {
        kind: "condition",
        subject: { kind: "input", payloadKind: "EntityId" },
        operator: "equals",
        value: { kind: "EntityId", value: entityId },
      },
      { kind: "EntityId", value: [entityId] },
      resolveEntity,
    );
    expect(
      await resolveConditionEntities(
        { ...condition, operator: "contains" },
        { kind: "EntityId", value: [entityId] },
        resolveEntity,
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it("does not turn inaccessible entities into false or leak the underlying error", async () => {
    const resolveEntity = vi
      .fn<EntityResolver>()
      .mockRejectedValue(new Error("private graph response"));
    const result = await resolveConditionEntities(
      condition,
      { kind: "EntityId", value: [entityId] },
      resolveEntity,
    );
    expect(result).toEqual({
      status: "error",
      code: "entityResolutionFailed",
      message: "Could not resolve entities for the condition.",
    });
    expect(result).not.toHaveProperty("context");
  });
});

// Opaque references keep the tests independent of FE-1891's reference format.
type Reference = { key: string };
const source: Reference = { key: "workflow/run/source" };
const matchingRef: Reference = { key: "workflow/run/matching" };
const nonMatchingRef: Reference = { key: "workflow/run/nonMatching" };

const makeEntity = (score: number): ProposedEntity => ({
  localEntityId: entityId,
  entityTypeIds: [companyType],
  properties: { [scoreUrl]: score },
  propertyMetadata: { value: {} },
  claims: { isSubjectOf: [], isObjectOf: [] },
  provenance: { actorType: "machine", origin: { type: "flow" } },
});

const createStorage = (values: ProposedEntity[]) => ({
  read: vi
    .fn<FilterListStorage<"ProposedEntity", Reference>["read"]>()
    .mockResolvedValue(values),
  write: vi
    .fn<FilterListStorage<"ProposedEntity", Reference>["write"]>()
    .mockImplementation((outputName) =>
      Promise.resolve(outputName === "matching" ? matchingRef : nonMatchingRef),
    ),
});

describe("filterStoredList", () => {
  it("rejects a stored non-array value before writing either output", async () => {
    const storage = createStorage([]);
    storage.read.mockResolvedValue("" as unknown as ProposedEntity[]);
    expect(
      await filterStoredList(
        { kind: "ProposedEntity", value: source },
        condition,
        storage,
      ),
    ).toMatchObject({ status: "error", code: "invalidValue" });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it("reads once and writes both partitions with their kind and original item order", async () => {
    const high = makeEntity(9);
    const low = makeEntity(1);
    const middle = makeEntity(7);
    const storage = createStorage([high, low, middle, high]);
    const result = await filterStoredList(
      { kind: "ProposedEntity", value: source },
      condition,
      storage,
    );
    expectTypeOf(result).toEqualTypeOf<
      StoredFilterListResult<"ProposedEntity", Reference>
    >();
    expect(storage.read).toHaveBeenCalledExactlyOnceWith(source);
    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(storage.write).toHaveBeenCalledWith("matching", {
      kind: "ProposedEntity",
      value: [high, middle, high],
    });
    expect(storage.write).toHaveBeenCalledWith("nonMatching", {
      kind: "ProposedEntity",
      value: [low],
    });
    expect(result).toEqual({
      status: "success",
      matching: { kind: "ProposedEntity", value: matchingRef },
      nonMatching: { kind: "ProposedEntity", value: nonMatchingRef },
    });
  });

  it.each([
    { scores: [], matching: [], nonMatching: [] },
    { scores: [9], matching: [9], nonMatching: [] },
    { scores: [1], matching: [], nonMatching: [1] },
  ])(
    "writes both outputs for scores $scores",
    async ({ scores, matching, nonMatching }) => {
      const storage = createStorage(scores.map(makeEntity));
      expect(
        (
          await filterStoredList(
            { kind: "ProposedEntity", value: source },
            condition,
            storage,
          )
        ).status,
      ).toBe("success");
      expect(storage.write).toHaveBeenCalledWith("matching", {
        kind: "ProposedEntity",
        value: matching.map(makeEntity),
      });
      expect(storage.write).toHaveBeenCalledWith("nonMatching", {
        kind: "ProposedEntity",
        value: nonMatching.map(makeEntity),
      });
    },
  );

  it("rejects invalid conditions before storage access and invalid items before writes", async () => {
    const storage = createStorage([makeEntity(9), makeEntity(Number.NaN)]);
    expect(
      await filterStoredList(
        { kind: "ProposedEntity", value: source },
        { ...condition, operator: "contains" },
        storage,
      ),
    ).toMatchObject({ status: "error", code: "invalidCondition" });
    expect(storage.read).not.toHaveBeenCalled();
    expect(
      await filterStoredList(
        { kind: "ProposedEntity", value: source },
        condition,
        storage,
      ),
    ).toMatchObject({ status: "error", code: "invalidValue" });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it.each(["read", "matching", "nonMatching"] as const)(
    "returns a typed failure when %s fails, without exposing partial outputs",
    async (operation) => {
      const storage = createStorage([makeEntity(9)]);
      const error = new Error("private S3 response");
      if (operation === "read") {
        storage.read.mockRejectedValue(error);
      } else {
        storage.write.mockImplementation((outputName) =>
          outputName === operation
            ? Promise.reject(error)
            : Promise.resolve(
                outputName === "matching" ? matchingRef : nonMatchingRef,
              ),
        );
      }
      expect(
        await filterStoredList(
          { kind: "ProposedEntity", value: source },
          condition,
          storage,
        ),
      ).toEqual({
        status: "error",
        code: "storageFailed",
        message: "Could not read or write the filter list payloads.",
      });
      if (operation === "read") {
        expect(storage.write).not.toHaveBeenCalled();
      } else {
        expect(storage.write).toHaveBeenCalledTimes(2);
      }
    },
  );
});
