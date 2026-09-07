/**
 * Run inside the selected task role and RDS network boundary.
 *
 * The result contains connection counts only. Tokens, credentials, endpoint
 * values, and database identifiers are never printed.
 */

import { loadDatabaseConfig } from "./database-config.ts";
import { probeRdsIam } from "./postgres.ts";

const config = loadDatabaseConfig();
if (config.kind !== "postgres" || config.auth.mode !== "iam") {
  throw new Error(
    "Set NODE_ENV=production and configure IAM Postgres authentication before running the probe.",
  );
}

const result = await probeRdsIam(config);
if (!result.distinctBackendConnections || result.tokenRequests < 2) {
  throw new Error(
    "RDS IAM probe did not observe two independent connections with fresh tokens.",
  );
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    connections: 2,
    tokenRequests: result.tokenRequests,
    tlsVerified: true,
  })}\n`,
);
