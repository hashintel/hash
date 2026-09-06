import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const replies = [
  "Last Tuesday Line 1 stopped milling because the holding tank before filling was full.",
];

let replyIndex = 0;
let sabotaged = false;

const applyRequestedRetentionSabotage = (): void => {
  if (sabotaged) return;
  const databasePath = process.env["BRUNCH_DEV_DB_PATH"];
  const outputDirectory = process.env["BRUNCH_RUNBOOK_OUTPUT_DIR"];
  if (databasePath === undefined || outputDirectory === undefined) return;
  if (process.env["BRUNCH_RUNBOOK_FAUX_ARTIFACT_COLLISION"] === "1") {
    const runId = basename(databasePath, ".db");
    writeFileSync(
      join(outputDirectory, `${runId}.json`),
      "collision sentinel\n",
      {
        flag: "wx",
      },
    );
    sabotaged = true;
  }
  if (process.env["BRUNCH_RUNBOOK_FAUX_CLEANUP_FAIL"] === "1") {
    renameSync(databasePath, `${databasePath}.retained`);
    mkdirSync(databasePath);
    writeFileSync(join(databasePath, "cleanup-blocker"), "retained\n");
    sabotaged = true;
  }
};

export default {
  messages: {
    create: () => {
      if (process.env["BRUNCH_RUNBOOK_FAUX_EXPERT_FAIL"] === "1") {
        throw new Error("Deliberate faux expert failure");
      }
      applyRequestedRetentionSabotage();
      return Promise.resolve({
        content:
          process.env["BRUNCH_RUNBOOK_EMPTY_EXPERT"] === "1"
            ? []
            : [
                {
                  type: "text",
                  text:
                    replies[replyIndex++] ??
                    "I don't know anything more about that.",
                },
              ],
        model: "faux-vestera-expert",
        usage: {
          input_tokens: 10,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      });
    },
  },
};
