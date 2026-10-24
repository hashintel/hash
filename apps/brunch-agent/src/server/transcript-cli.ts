/**
 * Print a human-readable transcript from Flue `history()` for one conversation.
 *
 * Usage, with the Brunch server already running (`yarn dev:brunch`):
 *
 *   yarn workspace @apps/brunch-agent transcript -- --owner-key <key> --id <conversationId>
 *
 * Identity matches the mounted Flue route: owner key + conversation id hash
 * to the Flue instance, with those values also sent as ownership headers.
 * This is a read of canonical Flue history, not a second log.
 */

import { createFlueClient } from "@flue/sdk";

import { agentOwnershipHeaders, brunchRoutes } from "@hashintel/brunch-agent";

import { flueConversationId } from "../shared/conversation/identity.ts";
import { formatFlueTranscript } from "../shared/conversation/transcript.ts";
import { defaultChatOrigin } from "./http/local-origins.ts";

const readFlag = (
  argv: readonly string[],
  name: string,
): string | undefined => {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.length === 0 ? undefined : value;
};

const argv = process.argv.slice(2);
const ownerKey = readFlag(argv, "--owner-key");
const conversationId = readFlag(argv, "--id");
const origin = readFlag(argv, "--origin") ?? defaultChatOrigin;

if (ownerKey === undefined || conversationId === undefined) {
  process.stderr.write(
    "usage: transcript -- --owner-key <key> --id <conversationId> [--origin <url>]\n",
  );
  process.exit(1);
}

const identity = { ownerKey, conversationId };
const instanceId = flueConversationId(identity);
const snapshot = await createFlueClient({
  url: `${origin}${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/${instanceId}`,
  headers: agentOwnershipHeaders(identity),
}).history();

process.stdout.write(`${formatFlueTranscript(snapshot)}\n`);
