import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { archiveThroughBinding } from "../src/archive-capability";
import { createLocalCaptureStore as createLocalCaptureStoreAdapter } from "../src/local-capture-store";

import type {
  CaptureInputProposal,
  CaptureStore,
  CaptureStoreCommand,
  EvidenceQuote,
} from "@hashintel/brunch-agent";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
  excerptsByEntry.clear();
});

const excerptsByEntry = new Map<number, Set<string>>();

const userEvidence = (excerpt: string, entry: number): EvidenceQuote => {
  const excerpts = excerptsByEntry.get(entry) ?? new Set<string>();
  excerpts.add(excerpt);
  excerptsByEntry.set(entry, excerpts);
  return { excerpt };
};

const proposal = (value: string, entry: number): CaptureInputProposal => ({
  evidence: [userEvidence(value, entry)],
  epistemicStatus: "explicit",
  confidence: "high",
  content: { value },
});

const createLocalCaptureStore = (path: string): CaptureStore => {
  const store = createLocalCaptureStoreAdapter(path);
  return {
    read: () => store.read(),
    readArchivedEntries: (pointer) => store.readArchivedEntries(pointer),
    async execute(command: CaptureStoreCommand) {
      const maxEntry = Math.max(1, ...excerptsByEntry.keys());
      await archiveThroughBinding(store, {
        sessionId: "session-1",
        offset: String(maxEntry),
        entries: Array.from({ length: maxEntry }, (_, index) => {
          const ordinal = index + 1;
          const text = [
            ...(excerptsByEntry.get(ordinal) ?? [`filler-${ordinal}`]),
          ].join("\n");
          return {
            substrateEntryId: `message-${ordinal}`,
            kind: "user" as const,
            text,
            materialized: { id: `message-${ordinal}`, text },
          };
        }),
        settlements: [],
      });
      return store.execute(command, { sessionId: "session-1" });
    },
  };
};

const storePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "brunch-captures-"));
  directories.push(directory);
  return join(directory, "captures.json");
};

describe("local capture store", () => {
  test("persists captures through JSON tmp-and-rename without stored statuses", async () => {
    const path = await storePath();
    const first = createLocalCaptureStore(path);
    const written = await first.execute({
      type: "apply-sweep",
      proposals: [proposal("alpha", 1)],
    });
    expect(written.ok).toBe(true);

    const reopened = createLocalCaptureStore(path);
    const snapshot = await reopened.read();
    expect(snapshot.captures).toHaveLength(1);
    expect(snapshot.captures[0]!.content).toEqual({ value: "alpha" });

    const persisted = JSON.parse(await readFile(path, "utf8")) as unknown;
    expect(JSON.stringify(persisted)).not.toContain('"status"');
    expect(
      (await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  test("serializes concurrent writes and never persists a refused partial sweep", async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);

    const [first, second] = await Promise.all([
      store.execute({ type: "apply-sweep", proposals: [proposal("alpha", 1)] }),
      store.execute({ type: "apply-sweep", proposals: [proposal("beta", 2)] }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const refused = await store.execute({
      type: "apply-sweep",
      proposals: [
        proposal("gamma", 3),
        {
          ...proposal("invalid", 4),
          content: { value: "invalid", absence: "deferred" },
        } as unknown as CaptureInputProposal,
      ],
    });
    expect(refused).toMatchObject({
      ok: false,
      refusal: { code: "invalid-envelope" },
    });

    const snapshot = await createLocalCaptureStore(path).read();
    expect(snapshot.captures.map((capture) => capture.content)).toEqual([
      { value: "alpha" },
      { value: "beta" },
    ]);
  });

  test("a command refused by the conflict guard leaves capture state unchanged and readable", async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    const created = await store.execute({
      type: "apply-sweep",
      proposals: [proposal("March", 1), proposal("June", 2)],
    });
    expect(created.ok).toBe(true);
    if (!created.ok)
      throw new Error(
        `The setup sweep was refused: ${created.refusal.message}`,
      );
    const captures = await store.read();
    const [marchId, juneId] = captures.captures.map((capture) => capture.id);
    if (marchId === undefined || juneId === undefined) {
      throw new Error(
        "The setup sweep did not persist both conflicting captures.",
      );
    }
    const opened = await store.execute({
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId, juneId],
      canDefault: false,
    });
    expect(opened.ok).toBe(true);

    const before = JSON.parse(await readFile(path, "utf8")) as {
      captureStore: unknown;
    };
    for (const command of [
      {
        type: "apply-sweep",
        proposals: [{ ...proposal("April", 3), supersedes: marchId }],
      },
      {
        type: "retract-capture",
        captureId: marchId,
        evidence: [userEvidence("Forget it", 4)],
      },
    ] as const) {
      const refused = await store.execute(command);
      expect(refused).toMatchObject({
        ok: false,
        refusal: { code: "blocked-by-open-conflict", captureId: marchId },
      });
    }

    // Reading the later cited quotes legitimately grows the co-located archive,
    // but neither refused command may change the capture-store half.
    const after = JSON.parse(await readFile(path, "utf8")) as {
      captureStore: unknown;
    };
    expect(after.captureStore).toEqual(before.captureStore);
    // And still readable through the parser, which is what makes it a snapshot
    // rather than surviving bytes.
    expect(
      (await createLocalCaptureStore(path).read()).captures.map(
        (c) => c.content,
      ),
    ).toEqual([{ value: "March" }, { value: "June" }]);
    expect(
      (await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  test("what a command returns is what the file gives back, even after the caller edits its arrays", async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    const created = await store.execute({
      type: "apply-sweep",
      proposals: [proposal("June", 1)],
    });
    if (!created.ok) throw new Error("the sweep was refused");
    const captureId = created.snapshot.captures[0]!.id;

    const evidence = [userEvidence("Forget the June date", 2)];
    const retracted = await store.execute({
      type: "retract-capture",
      captureId,
      evidence,
    });
    if (!retracted.ok) throw new Error("the retraction was refused");

    // The caller edits everything it still holds, after the store accepted and
    // wrote it. If the snapshot aliased any of it, the result the caller was
    // handed and the bytes on disk would now disagree.
    (evidence[0] as { excerpt: string }).excerpt = "Mutated after the write";
    evidence.push(userEvidence("Injected after the write", 3));

    expect(await createLocalCaptureStore(path).read()).toEqual(
      retracted.snapshot,
    );
  });

  test("migrates the legacy capture-only shape on the next successful archive write", async () => {
    const path = await storePath();
    const legacy = { captures: [], issues: [], events: [] };
    await writeFile(path, `${JSON.stringify(legacy)}\n`);

    const store = createLocalCaptureStoreAdapter(path);
    expect(await store.read()).toEqual(legacy);
    await archiveThroughBinding(store, {
      sessionId: "session-1",
      offset: "0",
      entries: [],
      settlements: [],
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      formatVersion: 1,
      captureStore: legacy,
      sessionLogArchive: {
        sessions: [
          {
            sessionId: "session-1",
            entries: [],
            reads: [{ offset: "0", entries: [], settlements: [] }],
          },
        ],
      },
    });
  });

  test("fails loudly when the versioned archive cannot be parsed", async () => {
    const path = await storePath();
    await writeFile(
      path,
      JSON.stringify({
        formatVersion: 1,
        captureStore: { captures: [], issues: [], events: [] },
        sessionLogArchive: {
          sessions: [
            {
              sessionId: "session-1",
              entries: [
                {
                  ordinal: 2,
                  substrateEntryId: "message-2",
                  versions: [],
                },
              ],
              reads: [],
            },
          ],
        },
      }),
    );

    await expect(createLocalCaptureStoreAdapter(path).read()).rejects.toThrow(
      Error,
    );
  });
});
