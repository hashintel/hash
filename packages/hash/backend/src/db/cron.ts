import { CronJob } from "cron";
import { PRUNE_AGE_MS } from "../model/verificationCode.model";
import { Logger } from "winston";
import { DBAdapter } from "./adapter";

export const setupCronJobs = (db: DBAdapter, logger: Logger) => {
  // Once a day (at 5am) prune expired verification codes from the datastore
  new CronJob(
    "0 0 5 * * *",
    () =>
      db
        .pruneVerificationCodes({ maxAgeInMs: PRUNE_AGE_MS })
        .then((numberOfDeleted) =>
          logger.info(
            `Cron Job: pruned ${numberOfDeleted} expired verification codes from the datastore.`
          )
        ),
    null,
    true
  );
};
