import { CronJob } from "cron";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { PRUNE_AGE_MS } from "../model";
import { DbAdapter } from "./adapter";

export const setupCronJobs = (db: DbAdapter, logger: Logger) => [
  // Once a day (at 5am) prune expired verification codes from the datastore
  new CronJob(
    "0 0 5 * * *",
    () => {
      void db
        .pruneVerificationCodes({ maxAgeInMs: PRUNE_AGE_MS })
        .then((numberOfDeleted) =>
          logger.info(
            `Cron Job: pruned ${numberOfDeleted} expired verification codes from the datastore.`,
          ),
        );
    },
    null,
    true,
  ),
];
