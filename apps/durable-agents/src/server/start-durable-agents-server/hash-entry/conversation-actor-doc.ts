import { defineDoc } from "@earendil-works/pi-durable";

/**
 * Who a conversation belongs to: the HASH actor whose session created it, and
 * the web the creating request named (`brunchHeaders.web`). Written once, in
 * the commit that creates the conversation; `null` in a conversation created
 * without HASH's entry, which the entry admits nobody to.
 */
export const ConversationActorDoc = defineDoc<{
  actorKey: string | null;
  webId: string | null;
}>({
  kind: "brunch.actor",
  version: 1,
  scope: "conversation",
  history: "latest",
  // A fork belongs to the same actor.
  fork: "current",
  initial: () => ({ actorKey: null, webId: null }),
  checkpointWhen: () => false,
});
