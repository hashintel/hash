import { use, useEffect, useMemo, useState } from "react";

import {
  BrunchAssistantContext,
  type BrunchOpenDocument,
  useBrunchAssistant,
} from "@hashintel/brunch-agent/ui";
import {
  ErrorTrackerContext,
  Petrinaut,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import { useAuthInfo } from "../../../shared/auth-info-context";
import { embedChromePlugin } from "./embed-chrome-plugin";

import type { EntityId, UserId } from "@blockprotocol/type-system";

const embedPlugins = [embedChromePlugin];

/** Brunch's Petrinaut agent, reached through hash-api's Brunch route. */
const brunchChatEndpoint = `${apiOrigin}/api/brunch/agents/petrinaut`;

/** Returns `{ ownerKey }` for the signed-in account. */
const brunchIdentityEndpoint = `${apiOrigin}/api/brunch/identity`;

/**
 * Carries Brunch's requests to hash-api with the session cookie, which the
 * route turns into the conversation's owner key. Module-level, so its identity
 * never changes: a new one would recreate the conversation's client.
 */
const brunchFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: "include" });

const brunchVoice = { enabled: false, realtime: false };
const brunchInterviewBudget = {
  enabled: false,
  level: "off",
  setLevel: () => {},
} as const;
const brunchWords = { enabled: false };

const noNetSwitchingError = () => {
  throw new Error(
    "Net switching from inside the Petrinaut editor is not supported; " +
      "the host (process-editor) drives all net loads via the bridge.",
  );
};

/**
 * The signed-in account's Brunch owner key, from hash-api, or `null` while
 * it loads, when nobody is signed in, or when the request failed. Requested
 * again whenever the signed-in account changes.
 */
const useBrunchOwnerKey = (): string | null => {
  const { authenticatedUser } = useAuthInfo();
  const accountId = authenticatedUser?.accountId ?? null;
  const { captureException } = use(ErrorTrackerContext);
  const [identity, setIdentity] = useState<{
    accountId: UserId;
    ownerKey: string;
  } | null>(null);

  useEffect(() => {
    if (accountId === null) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(brunchIdentityEndpoint, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `The Brunch identity request failed with status ${response.status}`,
          );
        }
        const body = (await response.json()) as { ownerKey?: unknown };
        if (typeof body.ownerKey !== "string") {
          throw new Error("The Brunch identity response has no owner key");
        }
        const { ownerKey } = body;
        setIdentity({ accountId, ownerKey });
      } catch (error) {
        if (!controller.signal.aborted) {
          captureException(error, { source: "brunch.identity" });
        }
      }
    })();
    return () => controller.abort();
  }, [accountId, captureException]);

  return identity !== null && identity.accountId === accountId
    ? identity.ownerKey
    : null;
};

/**
 * The Petrinaut editor for the open net, with Brunch as its assistant while
 * the net is saved and the account's owner key is known. Rendered inside the
 * embed's `ErrorTrackerContext`, so Brunch's contained failures reach the
 * same reporter as Petrinaut's.
 */
export const EmbedPetrinaut = ({
  handle,
  savedEntityId,
  readTitle,
  readonly,
  setTitle,
  title,
}: {
  handle: PetrinautDocHandle;
  /** The open net's entity id, or `null` while it is an unsaved draft. */
  savedEntityId: EntityId | null;
  /** The editor's current title, read when Brunch's tools need it. */
  readTitle: () => string;
  readonly: boolean;
  setTitle: (title: string) => void;
  title: string;
}) => {
  const ownerKey = useBrunchOwnerKey();

  const editor = useMemo(() => ({ handle, readTitle }), [handle, readTitle]);
  const openDocument = useMemo<BrunchOpenDocument | null>(
    () =>
      savedEntityId === null ? null : { documentId: savedEntityId, editor },
    [savedEntityId, editor],
  );

  const brunch = useBrunchAssistant({
    ownerKey: ownerKey ?? "",
    chatEndpoint: brunchChatEndpoint,
    fetch: brunchFetch,
    // Brunch is offered only on saved nets.
    selected: ownerKey !== null && openDocument !== null,
    openDocument,
    voice: brunchVoice,
    interviewBudget: brunchInterviewBudget,
    words: brunchWords,
    plugins: embedPlugins,
  });

  return (
    // Brunch's plugin renders its chat from this, inside the editor.
    <BrunchAssistantContext value={brunch.assistant}>
      {/* The title is the breadcrumbs' final crumb, so the editor's own
          title field stays hidden. */}
      <Petrinaut
        handle={handle}
        createNewNet={noNetSwitchingError}
        existingNets={[]}
        hideNetManagementControls="all"
        loadPetriNet={noNetSwitchingError}
        plugins={brunch.plugins}
        readonly={readonly}
        setTitle={setTitle}
        title={title}
      />
    </BrunchAssistantContext>
  );
};
