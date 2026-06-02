import { createInterface } from "node:readline/promises";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { addActorGroupMember } from "@local/hash-graph-sdk/principal/actor-group";
import {
  getInstanceAdminsTeam,
  isUserHashInstanceAdmin,
} from "@local/hash-graph-sdk/principal/hash-instance-admins";

import { createKratosIdentity, kratosIdentityApi } from "./auth/ory-kratos";
import { createUser, getUser } from "./graph/knowledge/system-types/user";
import {
  ensureHashSystemAccountExists,
  systemAccountId,
} from "./graph/system-account";
import { logger } from "./logger";

import type { ImpureGraphContext } from "./graph/context-types";

const promptVisible = async (label: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
};

/**
 * Reads a line from stdin without echoing characters, masking each typed
 * character with `*`. Falls back to a visible read if stdin isn't a TTY
 * (piped/non-interactive input).
 */
const promptHidden = (label: string): Promise<string> => {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return promptVisible(label);
  }

  return new Promise((resolve) => {
    stdout.write(`${label}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      // CR / LF / Ctrl+D — finish
      if (code === 13 || code === 10 || code === 4) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(buffer);
        return;
      }
      // Ctrl+C — abort
      if (code === 3) {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        process.exit(130);
      }
      // DEL / BS — erase last char
      if (code === 127 || code === 8) {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      buffer += char;
      stdout.write("*");
    };

    stdin.on("data", onData);
  });
};

const [, , emailArg, passwordArg] = process.argv;

const email = (emailArg ?? (await promptVisible("Email"))).trim();
if (!email) {
  logger.error("Email is required.");
  process.exit(1);
}

const context: ImpureGraphContext<false, true> = {
  provenance: {
    actorType: "machine",
    origin: { type: "migration" },
  },
  graphApi: createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  }),
  temporalClient: await createTemporalClient(),
};

await ensureHashSystemAccountExists({ logger, context });

const authentication = { actorId: systemAccountId };

const { data: identities } = await kratosIdentityApi.listIdentities({
  credentialsIdentifier: email,
});

if (identities.length > 0) {
  const kratosIdentityId = identities[0]!.id;

  const hashUser = await getUser(context, authentication, { kratosIdentityId });
  if (!hashUser) {
    logger.error(
      `Kratos identity ${kratosIdentityId} exists for ${email}, but no corresponding HASH user. Aborting.`,
    );
    process.exit(1);
  }

  const alreadyAdmin = await isUserHashInstanceAdmin(context, authentication, {
    userAccountId: hashUser.accountId,
  });

  if (alreadyAdmin) {
    logger.info(`${email} is already an instance admin. Nothing to do.`);
    process.exit(0);
  }

  const instanceAdmins = await getInstanceAdminsTeam(context, authentication);
  await addActorGroupMember(context.graphApi, authentication, {
    actorGroupId: instanceAdmins.id,
    actorId: hashUser.accountId,
  });

  logger.info(`Promoted ${email} to instance admin.`);
  process.exit(0);
}

const password = passwordArg ?? (await promptHidden("Password"));
if (!password) {
  logger.error("Password is required to create a new user.");
  process.exit(1);
}

const kratosIdentity = await createKratosIdentity({
  traits: { emails: [email] },
  credentials: {
    password: { config: { password } },
  },
  verifyEmails: true,
});

await createUser(context, authentication, {
  emails: [email],
  kratosIdentityId: kratosIdentity.id,
  isInstanceAdmin: true,
});

logger.info(`Created ${email} as instance admin.`);
process.exit(0);
