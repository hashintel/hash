import { createHash, randomUUID } from "node:crypto";

import {
  parseSDCPNFile,
  type DocumentRevisionId,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createPostgresWorkedModelStore as createPostgresStore } from "./worked-model-store/postgres.ts";

import type { PostgresRunner } from "@flue/postgres";
import type { FlueConversationSnapshot } from "@flue/sdk";

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

export interface WorkedModelCopy {
  readonly bundleKey: string;
  readonly copyId: string;
  readonly conversationId: string;
  readonly documentId: string;
  readonly incarnationId: string;
  readonly fixtureVersion: string;
  readonly principalKey: string;
  readonly title: string;
  readonly definition: SDCPN;
  readonly definitionSha256: string;
  readonly revisionId: DocumentRevisionId;
}

export interface WorkedModelStore {
  readonly seed: (fixtures: readonly WorkedModelFixture[]) => Promise<void>;
  readonly resolveCopy: (input: {
    readonly bundleKey: string;
    readonly principalKey: string;
  }) => Promise<WorkedModelCopy | undefined>;
  readonly createCleanCopy: (input: {
    readonly bundleKey: string;
    readonly principalKey: string;
  }) => Promise<WorkedModelCopy | undefined>;
  readonly updateCopyDefinition: (input: {
    readonly copyId: string;
    readonly principalKey: string;
    readonly expectedSha256: string;
    readonly expectedRevisionId: DocumentRevisionId;
    readonly definition: SDCPN;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<WorkedModelCopy | undefined>;
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
  if (
    typeof session !== "object" ||
    session === null ||
    Array.isArray(session) ||
    !("v" in session) ||
    session.v !== 1 ||
    !("conversationId" in session) ||
    typeof session.conversationId !== "string" ||
    !("messages" in session) ||
    !Array.isArray(session.messages) ||
    !("settlements" in session) ||
    !Array.isArray(session.settlements)
  )
    throw new Error("Worked-model fixture session is invalid.");
  const definitionValue = fixture.definition;
  if (
    typeof definitionValue !== "object" ||
    definitionValue === null ||
    Array.isArray(definitionValue)
  )
    throw new Error("Worked-model fixture definition is invalid.");
  const parsedDefinition = parseSDCPNFile({
    ...definitionValue,
    title: "Worked-model fixture",
  });
  if (!parsedDefinition.ok) throw new Error(parsedDefinition.error);
  const { title: _title, ...definition } = parsedDefinition.sdcpn;
  return {
    bundleKey,
    fixtureVersion: nonBlank(fixture.fixtureVersion, "fixtureVersion"),
    sourceManifestSha256,
    title: nonBlank(fixture.title, "title"),
    session: session as FlueConversationSnapshot,
    workpiece: nonBlank(fixture.workpiece, "workpiece"),
    definition,
    revisionId: nonBlank(fixture.revisionId, "revisionId"),
  };
};

const fixtureSha256 = (fixture: WorkedModelFixture): string =>
  createHash("sha256").update(JSON.stringify(fixture)).digest("hex");

const cloneCopy = (copy: WorkedModelCopy): WorkedModelCopy =>
  structuredClone(copy);

export const createInMemoryWorkedModelStore = (
  createId: () => string = randomUUID,
): WorkedModelStore => {
  const fixtures = new Map<
    string,
    { fixture: WorkedModelFixture; sha256: string }
  >();
  const copies = new Map<string, WorkedModelCopy>();
  const activeCopyIds = new Map<string, string>();

  const activeKey = (principalKey: string, bundleKey: string): string =>
    `${principalKey}\u0000${bundleKey}`;

  const instantiate = (
    principalKey: string,
    fixture: WorkedModelFixture,
  ): WorkedModelCopy => {
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
  ): WorkedModelCopy | undefined => {
    const seeded = fixtures.get(bundleKey);
    if (seeded === undefined) return undefined;
    const copy = instantiate(principalKey, seeded.fixture);
    copies.set(copy.copyId, copy);
    activeCopyIds.set(activeKey(principalKey, bundleKey), copy.copyId);
    return cloneCopy(copy);
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
    resolveCopy: async ({ principalKey, bundleKey }) => {
      const activeCopyId = activeCopyIds.get(
        activeKey(principalKey, bundleKey),
      );
      const activeCopy =
        activeCopyId === undefined ? undefined : copies.get(activeCopyId);
      return activeCopy === undefined
        ? createFromSeed(principalKey, bundleKey)
        : cloneCopy(activeCopy);
    },
    createCleanCopy: async ({ principalKey, bundleKey }) =>
      createFromSeed(principalKey, bundleKey),
    updateCopyDefinition: async ({
      copyId,
      principalKey,
      expectedSha256,
      expectedRevisionId,
      definition,
      revisionId,
    }) => {
      const current = copies.get(copyId);
      if (current === undefined || current.principalKey !== principalKey)
        return undefined;
      if (revisionId === expectedRevisionId)
        throw new Error("Worked-model copy revision did not advance.");
      if (
        current.definitionSha256 !== expectedSha256 ||
        current.revisionId !== expectedRevisionId
      )
        throw new Error("Worked-model copy changed before this update.");
      const updated: WorkedModelCopy = {
        ...current,
        definition: structuredClone(definition),
        definitionSha256: definitionSha256(definition),
        revisionId,
      };
      copies.set(copyId, updated);
      return cloneCopy(updated);
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
