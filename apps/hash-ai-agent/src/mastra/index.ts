/* eslint-disable canonical/filename-no-index */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { Observability } from "@mastra/observability";

import { genericAgent } from "./agents/generic-agent";
import { nerAgent } from "./agents/ner-agent";
import { nerPeopleScorer } from "./scorers/ner-people-scorer";
import { nerPeopleWorkflow } from "./workflows/ner-people-workflow";

const metaFilename = fileURLToPath(import.meta.url);
const metaDirname = path.dirname(metaFilename);

/**
 * Resolve the database URL for Mastra storage.
 *
 * Supports `MASTRA_DB_PATH` env var for custom paths (useful for different
 * environments or post-build layouts). Falls back to a relative path from
 * the compiled entrypoint.
 */
const resolveDbUrl = (): string => {
  const envPath = process.env.MASTRA_DB_PATH;
  if (envPath) {
    const resolved = path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
    return pathToFileURL(resolved).toString();
  }
  // Default: relative to this file (works in dev, may need adjustment post-build)
  const defaultPath = path.resolve(metaDirname, "../../data/mastra.db");
  return pathToFileURL(defaultPath).toString();
};

const dbUrl = resolveDbUrl();

export const mastra = new Mastra({
  workflows: { nerPeopleWorkflow },
  agents: {
    nerAgent,
    genericAgent,
  },
  scorers: { nerPeopleScorer },
  logger: new PinoLogger(),
  storage: new LibSQLStore({ id: "mastra-storage", url: dbUrl }),
  observability: new Observability({
    default: { enabled: true },
  }),
});
