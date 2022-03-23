import { createReadlineInterface } from "./createReadlineInterface";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Block, Entity, Page, User } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { inspect } from "util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "hash-singer-target",
  useStream: process.stderr,
});

const db = new PostgresAdapter(
  {
    host: "localhost",
    user: "postgres",
    port: 5432,
    database: process.env.HASH_PG_DATABASE ?? "hash_singer_target",
    password: "postgres",
    maxPoolSize: 10,
  },
  logger,
);

const waitingTasks: Promise<void>[] = [];

createReadlineInterface((line) => {
  try {
    const message = JSON.parse(line);
    if (message.stream === "issues") {
      console.error(message);

      if (message.type === "RECORD") {
        // issuesQueue.push(message.record)

        waitingTasks.push(
          Entity.create(db, {
            accountId: "0",
            createdByAccountId: "0",
            entityTypeId: "0",
            entityTypeVersionId: "0",
            properties: message.record,
            systemTypeName: "Block",
            versioned: true,
            entityId: undefined,
            entityVersionId: undefined,
          }).then((a) => {
            console.error("Look at my entity!", a);
          }),
        );
      }
    }
  } catch (err) {
    logger.error(err, { foundLen: line.length, found: line });
    process.exit(1);
  }
})
  .then(() => Promise.all(waitingTasks))
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });

function stringy(object: any): string {
  return inspect(object, {
    colors: true,
    compact: true,
    depth: 5,
    maxArrayLength: 3,
  });
}
