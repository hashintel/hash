import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import ledgerCommit from "./ledger-commit.md?raw";
import ledgerCompile from "./ledger-compile.md?raw";
import ledgerFields from "./ledger-fields.md?raw";
import {
  commitInputSchema,
  compileMap,
  ledgerCommitOutputSchema,
  prepareCommit,
  reconstructLedger,
  vocabularyDescription,
  type LedgerHistory,
} from "./ledger.ts";

/** `ledger_commit` and `ledger_compile` over this arm's own Ledger. */
export const createLedgerTools = (
  readHistory: () => Promise<LedgerHistory>,
) => [
  defineTool({
    name: brunchTools.ledgerCommit,
    description: [
      ledgerCommit.trim(),
      vocabularyDescription,
      ledgerFields.trim(),
    ].join("\n\n"),
    input: commitInputSchema,
    output: ledgerCommitOutputSchema,
    durable: true,
    async run({ data, toolCallId, signal }) {
      const history = await readHistory();
      signal?.throwIfAborted();
      return {
        output: prepareCommit({ history, toolCallId, changes: data.changes }),
        terminate: false,
      };
    },
  }),
  defineTool({
    name: brunchTools.ledgerCompile,
    description: ledgerCompile.trim(),
    input: v.strictObject({
      about: v.optional(
        v.pipe(
          v.array(v.pipe(v.string(), v.minLength(1))),
          v.minLength(1),
          v.maxLength(10),
          v.description(
            "Identity names or relationship Note ids (e.g. n12) to render in full.",
          ),
        ),
      ),
      revision: v.optional(
        v.pipe(
          v.number(),
          v.integer(),
          v.minValue(0),
          v.description(
            "A commit revision; 0 is the empty Ledger. Defaults to the latest.",
          ),
        ),
      ),
    }),
    output: v.custom<ReturnType<typeof compileMap>>(() => true),
    async run({ data }) {
      return {
        output: compileMap(reconstructLedger(await readHistory()), data),
        terminate: false,
      };
    },
  }),
];
