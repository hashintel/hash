/**
 * Print a human-readable transcript from Flue `history()` for one conversation.
 *
 * Usage, with the Brunch server already running (`yarn dev:brunch`):
 *
 *   yarn workspace @apps/brunch-agent transcript -- --principal <key> --id <conversationId>
 *
 * Identity matches POST /api/chat: principal + conversation id hash to the
 * Flue instance. This is a read of canonical Flue history, not a second log.
 */

import { createFlueClient } from "@flue/sdk";

import { flueConversationId } from "./conversation-identity.ts";
import { formatFlueTranscript } from "./flue-transcript.ts";
import { defaultChatOrigin } from "./local-dev-origins.ts";
import { CHAT_AGENT_ROUTE } from "./routes.ts";

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
const principalKey = readFlag(argv, "--principal");
const conversationId = readFlag(argv, "--id");
const origin = readFlag(argv, "--origin") ?? defaultChatOrigin;

if (principalKey === undefined || conversationId === undefined) {
  process.stderr.write(
    "usage: transcript -- --principal <key> --id <conversationId> [--origin <url>]\n",
  );
  process.exit(1);
}

const instanceId = flueConversationId(principalKey, conversationId);
const snapshot = await createFlueClient({
  url: `${origin}/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
}).history();

process.stdout.write(`${formatFlueTranscript(snapshot)}\n`);
