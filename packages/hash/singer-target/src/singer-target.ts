import { createReadlineInterface } from "./utils/createReadlineInterface";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import _ from "lodash";
import { stringy } from "./utils/stringy";
import { createTargetOrg } from "./target-org/createTargetOrg";
import { GITHUB_STREAMS } from "./GITHUB_STREAMS";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "hash-singer-target",
  useStream: process.stderr,
});

const db = new PostgresAdapter(
  {
    host: process.env.HASH_PG_HOST ?? "localhost",
    user: "postgres",
    port: 5432,
    database: process.env.HASH_PG_DATABASE ?? "hash_singer_target",
    password: "postgres",
    maxPoolSize: 10,
  },
  logger,
);

const waitingTasks: Promise<void>[] = [];
go((task) => waitingTasks.push(task))
  .then(() => Promise.all(waitingTasks))
  .then(() => {
    // TODO: Print out actual state object?
    logger.debug("Done!");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });

async function go(queueTask: (promise: Promise<void>) => void) {
  const targetOrg = await createTargetOrg(
    db,
    logger,
    getRequiredEnv("SYSTEM_ACCOUNT_SHORTNAME"),
    GITHUB_STREAMS,
  );

  await createReadlineInterface((line) => {
    try {
      const message = JSON.parse(line);
      const streamIngester = targetOrg.getStreamIngester(message.stream);
      if (streamIngester) {
        if (message.type === "RECORD") {
          // Progress -1/10: Tracking promises like this keeps things concurrent, but completely
          // ignores keeping track of what's been ingested and overall counting metrics
          // for results of ingestion.
          queueTask(
            streamIngester.upsertEntity({
              record: message.record,
            }),
          );
        }
      }
    } catch (err) {
      logger.error(`Error during read line: ${stringy(err)}`);
      process.exit(1);
    }
  });
}
