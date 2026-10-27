import {
  memo,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { brunchRoutes } from "@hashintel/brunch-agent";
import {
  type BrunchAssistant,
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

import { useAuthInfo } from "../../../../shared/auth-info-context";
import { embedChromePlugin } from "./embed-chrome-plugin";

import type { EntityId, UserId } from "@blockprotocol/type-system";

const embedPlugins = [embedChromePlugin];

/** Brunch's Petrinaut agent, reached through hash-api's Brunch route. */
const brunchChatEndpoint = `${apiOrigin}/api/brunch${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`;

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
 * it loads, when nobody is signed in, when this deployment has no Brunch
 * (hash-api answers 503), or when the request failed. Requested again
 * whenever the signed-in account changes.
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
        if (response.status === 503) {
          return;
        }
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

type BrunchSessionOutput = Pick<BrunchAssistant, "assistant" | "plugins">;

/**
 * Brunch's assistant for one saved net, mounted only while it is offered, so
 * the hook never runs without an owner key. Renders nothing: it hands the
 * assistant and plugins to its parent, which keeps `<Petrinaut>` mounted
 * whether or not Brunch is offered. Unmounting withdraws them.
 *
 * Memoised, and its props must stay stable: the hook returns a new assistant
 * on every render, so if the parent's update re-rendered this component, each
 * hand-over would schedule the next and never settle.
 */
const BrunchSession = memo(
  ({
    ownerKey,
    openDocument,
    onChange,
  }: {
    ownerKey: string;
    openDocument: BrunchOpenDocument;
    onChange: (output: BrunchSessionOutput | null) => void;
  }) => {
    const { assistant, plugins } = useBrunchAssistant({
      ownerKey,
      chatEndpoint: brunchChatEndpoint,
      fetch: brunchFetch,
      selected: true,
      openDocument,
      voice: brunchVoice,
      interviewBudget: brunchInterviewBudget,
      words: brunchWords,
      plugins: embedPlugins,
    });

    useLayoutEffect(() => {
      onChange({ assistant, plugins });
      return () => onChange(null);
    }, [assistant, plugins, onChange]);

    return null;
  },
);

/**
 * The Petrinaut editor for the open net, with Brunch as its assistant while
 * the net is saved, the user may edit it, and the account's owner key is
 * known. Rendered inside the embed's `ErrorTrackerContext`, so Brunch's
 * contained failures reach the same reporter as Petrinaut's.
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
  /** The user may not edit or save this net. */
  readonly: boolean;
  setTitle: (title: string) => void;
  title: string;
}) => {
  const ownerKey = useBrunchOwnerKey();
  const [brunch, setBrunch] = useState<BrunchSessionOutput | null>(null);

  const editor = useMemo(() => ({ handle, readTitle }), [handle, readTitle]);
  // Brunch edits and saves the net, so it is offered only on saved nets the
  // user may edit.
  const openDocument = useMemo<BrunchOpenDocument | null>(
    () =>
      savedEntityId === null || readonly
        ? null
        : { documentId: savedEntityId, editor },
    [savedEntityId, readonly, editor],
  );

  return (
    <>
      {ownerKey !== null && openDocument !== null && (
        <BrunchSession
          ownerKey={ownerKey}
          openDocument={openDocument}
          onChange={setBrunch}
        />
      )}
      {/* Brunch's plugin renders its chat from this, inside the editor. */}
      <BrunchAssistantContext value={brunch?.assistant ?? null}>
        {/* The title is the breadcrumbs' final crumb, so the editor's own
            title field stays hidden. */}
        <Petrinaut
          handle={handle}
          createNewNet={noNetSwitchingError}
          existingNets={[]}
          hideNetManagementControls="all"
          loadPetriNet={noNetSwitchingError}
          plugins={brunch?.plugins ?? embedPlugins}
          readonly={readonly}
          setTitle={setTitle}
          title={title}
        />
      </BrunchAssistantContext>
    </>
  );
};
