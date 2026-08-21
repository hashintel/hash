import { describe, expect, test } from "vitest";

import {
  archiveSessionLogRead,
  createEmptySessionLogArchive,
  readArchivedEntryRange,
  resolveEvidenceQuotes,
  type SessionLogRead,
} from "../src/session-log";

const read = (
  offset: string,
  entries: SessionLogRead["entries"],
  settlements: SessionLogRead["settlements"] = [],
): SessionLogRead => ({
  sessionId: "session-1",
  offset,
  incarnation: "incarnation-1",
  entries,
  settlements,
});

const entry = (
  substrateEntryId: string,
  kind: SessionLogRead["entries"][number]["kind"],
  text: string,
  materialized: SessionLogRead["entries"][number]["materialized"] = { text },
): SessionLogRead["entries"][number] => ({
  substrateEntryId,
  kind,
  text,
  materialized,
});

describe("session-log archive", () => {
  test("identity-merges evolving entries, versions changed materializations, and skips exact duplicates", () => {
    const first = archiveSessionLogRead(
      createEmptySessionLogArchive(),
      read("0", [
        entry("message-user", "user", "Budget is twenty thousand euros."),
        entry("message-assistant", "assistant", "Let me", {
          parts: [{ type: "text", text: "Let me", state: "streaming" }],
        }),
      ]),
    );
    const repeated = archiveSessionLogRead(first, read("0", firstReadEntries));
    const evolved = archiveSessionLogRead(
      repeated,
      read(
        "1",
        [
          entry("message-user", "user", "Budget is twenty thousand euros."),
          entry("message-assistant", "assistant", "Let me confirm that.", {
            parts: [
              { type: "text", text: "Let me confirm that.", state: "done" },
            ],
          }),
        ],
        [{ submissionId: "submission-1", outcome: "completed" }],
      ),
    );

    const session = evolved.sessions[0]!;
    expect(
      session.entries.map(({ ordinal, substrateEntryId }) => ({
        ordinal,
        substrateEntryId,
      })),
    ).toEqual([
      { ordinal: 1, substrateEntryId: "message-user" },
      { ordinal: 2, substrateEntryId: "message-assistant" },
    ]);
    expect(session.entries[0]!.versions).toHaveLength(1);
    expect(session.entries[1]!.versions).toHaveLength(2);
    expect(session.reads.map(({ offset }) => offset)).toEqual(["0", "1"]);
    expect(session.reads[1]!.settlements).toEqual([
      { submissionId: "submission-1", outcome: "completed" },
    ]);
  });

  test("resolves true-user and harness-classified affordance quotes to archive ordinals", () => {
    const archive = archiveSessionLogRead(
      createEmptySessionLogArchive(),
      read("3", [
        entry("message-injected", "non-user", "Begin the interview."),
        entry("message-user-1", "user", "June works."),
        entry("message-affordance", "user-affordance-payload", "June works."),
      ]),
    );

    expect(
      resolveEvidenceQuotes(archive, "session-1", [{ excerpt: "June works." }]),
    ).toEqual({
      ok: true,
      evidence: [
        {
          excerpt: "June works.",
          pointer: { sessionId: "session-1", entryStart: 3, entryEnd: 3 },
          source: "user-affordance-payload",
        },
      ],
      advisories: [
        {
          type: "multiple-evidence-matches",
          excerpt: "June works.",
          matchCount: 2,
          message:
            "The quote matched 2 user entries; the latest match was selected.",
        },
      ],
    });
  });

  test("distinguishes no match from an injected non-user match and provides repair guidance", () => {
    const archive = archiveSessionLogRead(
      createEmptySessionLogArchive(),
      read("1", [
        entry("message-injected", "non-user", "Begin the interview."),
      ]),
    );

    expect(
      resolveEvidenceQuotes(archive, "session-1", [{ excerpt: "missing" }]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "evidence-quote-not-found",
        excerpt: "missing",
        message:
          'No user entry contains the verbatim quote "missing". Repair the quote to match the user\'s words exactly.',
      },
    });
    expect(
      resolveEvidenceQuotes(archive, "session-1", [
        { excerpt: "Begin the interview." },
      ]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "non-user-evidence",
        excerpt: "Begin the interview.",
        message:
          'The quote "Begin the interview." occurs only in injected non-user entries and cannot be cited as user evidence.',
      },
    });
  });

  test("retrieves every entry in a stored pointer range without consulting the substrate", () => {
    const archive = archiveSessionLogRead(
      createEmptySessionLogArchive(),
      read("2", [
        entry("message-1", "user", "first"),
        entry("message-2", "assistant", "second"),
      ]),
    );

    expect(
      readArchivedEntryRange(archive, {
        sessionId: "session-1",
        entryStart: 1,
        entryEnd: 2,
      }).map((archived) => archived.substrateEntryId),
    ).toEqual(["message-1", "message-2"]);
    expect(() =>
      readArchivedEntryRange(archive, {
        sessionId: "session-1",
        entryStart: 2,
        entryEnd: 3,
      }),
    ).toThrow(/not archived/i);
  });
});

const firstReadEntries: SessionLogRead["entries"] = [
  entry("message-user", "user", "Budget is twenty thousand euros."),
  entry("message-assistant", "assistant", "Let me", {
    parts: [{ type: "text", text: "Let me", state: "streaming" }],
  }),
];
