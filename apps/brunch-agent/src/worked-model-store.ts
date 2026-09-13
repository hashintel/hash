import { createHash, randomUUID } from "node:crypto";

import {
  parseWorkedModelDefinition,
  type WorkedModelNetProjection,
  type WorkedModelNetProjectionDefinitionUpdate,
  type WorkedModelNetProjectionLookup,
} from "@hashintel/brunch-agent-plugin-sdcpn/worked-model";

import { createPostgresWorkedModelStore as createPostgresStore } from "./worked-model-store/postgres.ts";
import { isRetainedFixtureSession } from "./worked-model-store/retained-fixture-session.ts";

import type { PostgresRunner } from "@flue/postgres";
import type { FlueConversationSnapshot } from "@flue/sdk";
import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

export type {
  WorkedModelNetProjection,
  WorkedModelNetProjectionDefinitionUpdate,
  WorkedModelNetProjectionLookup,
};

export interface WorkedModelFixture {
  readonly bundleKey: string;
  readonly fixtureVersion: string;
  /** SHA-256 of the reviewed persona evidence manifest that produced it. */
  readonly sourceManifestSha256: string;
  readonly title: string;
  /** The accepted local session retained as immutable fixture input. */
  readonly session: FlueConversationSnapshot;
  /** The accepted current workpiece retained beside its canonical session. */
  readonly workpiece: string;
  readonly definition: SDCPN;
  /** Petrinaut revision of the accepted fixture document. */
  readonly revisionId: DocumentRevisionId;
}

export interface WorkedModelStore {
  readonly seed: (fixtures: readonly WorkedModelFixture[]) => Promise<void>;
  readonly resolveNetProjection: (
    input: WorkedModelNetProjectionLookup,
  ) => Promise<WorkedModelNetProjection | undefined>;
  readonly createCleanNetProjection: (
    input: WorkedModelNetProjectionLookup,
  ) => Promise<WorkedModelNetProjection | undefined>;
  readonly updateNetProjectionDefinition: (
    input: WorkedModelNetProjectionDefinitionUpdate,
  ) => Promise<WorkedModelNetProjection | undefined>;
}

export const definitionSha256 = (definition: SDCPN): string =>
  createHash("sha256").update(JSON.stringify(definition)).digest("hex");

const nonBlank = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Worked-model fixture has no ${name}.`);
  return value;
};

export const parseWorkedModelFixture = (value: unknown): WorkedModelFixture => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model fixture is not an object.");
  const fixture = value as Record<string, unknown>;
  const bundleKey = nonBlank(fixture.bundleKey, "bundleKey");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(bundleKey))
    throw new Error(
      "Worked-model fixture bundleKey is not lowercase kebab-case.",
    );
  const sourceManifestSha256 = nonBlank(
    fixture.sourceManifestSha256,
    "sourceManifestSha256",
  );
  if (!/^[0-9a-f]{64}$/u.test(sourceManifestSha256))
    throw new Error("Worked-model fixture sourceManifestSha256 is invalid.");
  const session = fixture.session;
  if (!isRetainedFixtureSession(session))
    throw new Error("Worked-model fixture session is invalid.");
  return {
    bundleKey,
    fixtureVersion: nonBlank(fixture.fixtureVersion, "fixtureVersion"),
    sourceManifestSha256,
    title: nonBlank(fixture.title, "title"),
    session,
    workpiece: nonBlank(fixture.workpiece, "workpiece"),
    definition: parseWorkedModelDefinition(fixture.definition),
    revisionId: nonBlank(fixture.revisionId, "revisionId"),
  };
};

const fixtureSha256 = (fixture: WorkedModelFixture): string =>
  createHash("sha256").update(JSON.stringify(fixture)).digest("hex");

const cloneNetProjection = (
  netProjection: WorkedModelNetProjection,
): WorkedModelNetProjection => structuredClone(netProjection);

export const createInMemoryWorkedModelStore = (
  createId: () => string = randomUUID,
): WorkedModelStore => {
  const fixtures = new Map<
    string,
    { fixture: WorkedModelFixture; sha256: string }
  >();
  const netProjections = new Map<string, WorkedModelNetProjection>();
  const activeNetProjectionIds = new Map<string, string>();

  const activeKey = (principalKey: string, bundleKey: string): string =>
    `${principalKey}\u0000${bundleKey}`;

  const instantiate = (
    principalKey: string,
    fixture: WorkedModelFixture,
  ): WorkedModelNetProjection => {
    const copyId = createId();
    const definition = structuredClone(fixture.definition);
    return {
      bundleKey: fixture.bundleKey,
      copyId,
      conversationId: createId(),
      documentId: createId(),
      incarnationId: createId(),
      fixtureVersion: fixture.fixtureVersion,
      principalKey,
      title: fixture.title,
      definition,
      definitionSha256: definitionSha256(definition),
      revisionId: fixture.revisionId,
    };
  };

  const createFromSeed = (
    principalKey: string,
    bundleKey: string,
  ): WorkedModelNetProjection | undefined => {
    const seeded = fixtures.get(bundleKey);
    if (seeded === undefined) return undefined;
    const netProjection = instantiate(principalKey, seeded.fixture);
    netProjections.set(netProjection.copyId, netProjection);
    activeNetProjectionIds.set(
      activeKey(principalKey, bundleKey),
      netProjection.copyId,
    );
    return cloneNetProjection(netProjection);
  };

  return {
    seed: async (nextFixtures) => {
      for (const nextFixture of nextFixtures) {
        const fixture = parseWorkedModelFixture(nextFixture);
        const sha256 = fixtureSha256(fixture);
        const existing = fixtures.get(fixture.bundleKey);
        if (
          existing?.fixture.fixtureVersion === fixture.fixtureVersion &&
          existing.sha256 !== sha256
        )
          throw new Error(
            `Worked-model fixture ${fixture.bundleKey}@${fixture.fixtureVersion} changed without a version change.`,
          );
        if (
          existing === undefined ||
          existing.fixture.fixtureVersion !== fixture.fixtureVersion
        )
          fixtures.set(fixture.bundleKey, {
            fixture: structuredClone(fixture),
            sha256,
          });
      }
    },
    resolveNetProjection: async ({ principalKey, bundleKey }) => {
      const activeNetProjectionId = activeNetProjectionIds.get(
        activeKey(principalKey, bundleKey),
      );
      const activeNetProjection =
        activeNetProjectionId === undefined
          ? undefined
          : netProjections.get(activeNetProjectionId);
      return activeNetProjection === undefined
        ? createFromSeed(principalKey, bundleKey)
        : cloneNetProjection(activeNetProjection);
    },
    createCleanNetProjection: async ({ principalKey, bundleKey }) =>
      createFromSeed(principalKey, bundleKey),
    updateNetProjectionDefinition: async ({
      copyId,
      principalKey,
      expectedSha256,
      expectedRevisionId,
      definition,
      revisionId,
    }) => {
      const current = netProjections.get(copyId);
      if (current === undefined || current.principalKey !== principalKey)
        return undefined;
      if (revisionId === expectedRevisionId)
        throw new Error(
          "Worked-model net projection revision did not advance.",
        );
      if (
        current.definitionSha256 !== expectedSha256 ||
        current.revisionId !== expectedRevisionId
      )
        throw new Error(
          "Worked-model net projection changed before this update.",
        );
      const updated: WorkedModelNetProjection = {
        ...current,
        definition: structuredClone(definition),
        definitionSha256: definitionSha256(definition),
        revisionId,
      };
      netProjections.set(copyId, updated);
      return cloneNetProjection(updated);
    },
  };
};

export const createPostgresWorkedModelStore = (
  runner: PostgresRunner,
  createId: () => string = randomUUID,
): WorkedModelStore => {
  const store = createPostgresStore(
    runner,
    fixtureSha256,
    definitionSha256,
    createId,
  );
  return {
    ...store,
    seed: (fixtures) => store.seed(fixtures.map(parseWorkedModelFixture)),
  };
};
