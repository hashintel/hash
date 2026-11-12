import {
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { brunchRoutes } from "@hashintel/brunch-agent";
import {
  BrunchAssistantContext,
  type BrunchHostSave,
  type BrunchOpenDocument,
  brunchPlugin,
  hashPetrinautHostTools,
  type PetrinautAiAssistant,
  type PetrinautAiAutomaticTool,
  useBrunchAssistant,
  type VersionLoad,
} from "@hashintel/brunch-agent/ui";
import {
  ErrorTrackerContext,
  Petrinaut,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut";

import { brunchAgentOrigin } from "../../../../../lib/public-env";
import { useAuthInfo } from "../../../../shared/auth-info-context";
import { useBrunchHashGraphReadTools } from "./process-petrinaut/brunch-hash-graph-reads";
import { topBarPlugin } from "./process-petrinaut/top-bar-plugin";
import { useBrunchConversationPointer } from "./process-petrinaut/use-brunch-conversation-pointer";

import type { EntityId, UserId } from "@blockprotocol/type-system";

const editorPlugins = [topBarPlugin];
const editorPluginsWithBrunch = [topBarPlugin, brunchPlugin];

/** Brunch's HASH agent, which the page calls directly. */
const brunchChatEndpoint = (origin: string) =>
  `${origin}${brunchRoutes.agents}/${brunchRoutes.hashAgent}`;

/** Returns `{ actorKey }` for the signed-in account. */
const brunchIdentityEndpoint = (origin: string) =>
  `${origin}${brunchRoutes.hashIdentity}`;

/**
 * Carries Brunch's requests with the user's HASH session cookie, from which
 * Brunch learns who they are from hash-api. Module-level, so its identity
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
      "the host (process-editor) drives all net loads.",
  );
};

/**
 * Brunch's origin and the signed-in account's actor key, from Brunch, or
 * `null` while it loads, when nobody with a completed signup is signed in,
 * when this deployment has no Brunch, when Brunch declines the session, or
 * when the request failed; only a failure is reported. Requested again
 * whenever the signed-in account changes.
 */
const useBrunchConnection = (): {
  readonly origin: string;
  readonly actorKey: string;
} | null => {
  const { authenticatedUser } = useAuthInfo();
  const origin = brunchAgentOrigin;
  const accountId = authenticatedUser?.accountSignupComplete
    ? authenticatedUser.accountId
    : null;
  const { captureException } = use(ErrorTrackerContext);
  const [identity, setIdentity] = useState<{
    origin: string;
    accountId: UserId;
    actorKey: string;
  } | null>(null);

  useEffect(() => {
    if (origin === null || accountId === null) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(brunchIdentityEndpoint(origin), {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        // Brunch declining this session is an answer, not a failure: the
        // page just doesn't offer the assistant.
        if (response.status === 401) {
          return;
        }
        if (!response.ok) {
          throw new Error(
            `The Brunch identity request failed with status ${response.status}`,
          );
        }
        const body = (await response.json()) as { actorKey?: unknown };
        if (typeof body.actorKey !== "string") {
          throw new Error("The Brunch identity response has no actor key");
        }
        const { actorKey } = body;
        setIdentity({ origin, accountId, actorKey });
      } catch (error) {
        if (!controller.signal.aborted) {
          captureException(error, { source: "brunch.identity" });
        }
      }
    })();
    return () => controller.abort();
  }, [origin, accountId, captureException]);

  return identity !== null &&
    identity.origin === origin &&
    identity.accountId === accountId
    ? identity
    : null;
};

/**
 * Brunch's assistant for one saved net, mounted only while it is offered, so
 * the hook never runs without an actor key. Renders nothing: it hands the
 * assistant to its parent, which keeps `<Petrinaut>` mounted whether or not
 * Brunch is offered. Unmounting withdraws it.
 *
 * Memoised, and its props must stay stable: the hook returns a new assistant
 * on every render, so if the parent's update re-rendered this component, each
 * hand-over would schedule the next and never settle.
 */
const BrunchSession = memo(
  ({
    actorKey,
    chatEndpoint,
    openDocument,
    processEntityId,
    processExists,
    shown,
    hostTools,
    hostSave,
    versionLoad,
    onChange,
  }: {
    actorKey: string;
    /** Brunch's HASH agent. */
    chatEndpoint: string;
    openDocument: BrunchOpenDocument;
    /** The open net's entity id, which its conversation is stored against. */
    processEntityId: EntityId;
    /** The net is saved. A draft's entity doesn't exist yet. */
    processExists: boolean;
    /** The editor shows Brunch's assistant. */
    shown: boolean;
    /**
     * Reads of the HASH graph, run here as the signed-in user, and the
     * agent's Petrinaut tools, run on the editor.
     */
    hostTools: readonly PetrinautAiAutomaticTool[];
    /** The editor's Save, which the agent runs once the user approves it. */
    hostSave: BrunchHostSave;
    /**
     * Brunch tells its agent about a load once, on the next turn, and the
     * Ledger marks reflections on elements the loaded version lacks.
     */
    versionLoad: VersionLoad | undefined;
    onChange: (assistant: PetrinautAiAssistant | null) => void;
  }) => {
    const conversationPointer = useBrunchConversationPointer({
      processEntityId,
      processExists,
    });
    const { assistant } = useBrunchAssistant({
      actorKey,
      chatEndpoint,
      fetch: brunchFetch,
      selected: shown,
      openDocument,
      conversationPointer,
      voice: brunchVoice,
      interviewBudget: brunchInterviewBudget,
      words: brunchWords,
      hostTools,
      hostSave,
      ...(versionLoad === undefined ? {} : { versionLoad }),
    });

    useLayoutEffect(() => {
      onChange(assistant);
      return () => onChange(null);
    }, [assistant, onChange]);

    return null;
  },
);

/**
 * The Petrinaut editor for the open net, with Brunch as its assistant while
 * the user may edit it and the account's actor key is known. A draft is
 * offered Brunch too: it has its final id from the start, so its
 * conversation is the saved net's. Rendered inside the editor's `ErrorTrackerContext`, so Brunch's
 * contained failures reach the same reporter as Petrinaut's.
 */
export const ProcessPetrinaut = ({
  handle,
  entityId,
  saved,
  readTitle,
  hostSave,
  versionLoad,
  readonly,
  setTitle,
  title,
}: {
  handle: PetrinautDocHandle;
  /** The open net's entity id; a draft's is the one its first save creates. */
  entityId: EntityId;
  /** The net is saved, so its entity exists. */
  saved: boolean;
  /** The editor's current title, read when Brunch's tools need it. */
  readTitle: () => string;
  /** The editor's Save, for the agent: what it would do now, and running it. Stable for the handle. */
  hostSave: BrunchHostSave;
  /** The latest load of another saved version of the open net, while the open net builds on it. */
  versionLoad: VersionLoad | undefined;
  /** The user may not edit or save this net. */
  readonly: boolean;
  setTitle: (title: string) => void;
  title: string;
}) => {
  const brunch = useBrunchConnection();
  const graphReads = useBrunchHashGraphReadTools();
  const hostTools = useMemo(
    () => [...graphReads, ...hashPetrinautHostTools],
    [graphReads],
  );
  const [brunchAssistant, setBrunchAssistant] =
    useState<PetrinautAiAssistant | null>(null);
  // Brunch's panel content marks Brunch as shown while the editor mounts it.
  // A load replaces the handle, and the old content's unmark runs before the
  // new content's mark in the same commit, so Brunch stays shown across it.
  const [brunchShown, setBrunchShown] = useState(false);
  const showBrunch = useCallback(() => {
    setBrunchShown(true);
    return () => setBrunchShown(false);
  }, []);
  const brunchHost = useMemo(
    () => ({ assistant: brunchAssistant, show: showBrunch }),
    [brunchAssistant, showBrunch],
  );

  const editor = useMemo(() => ({ handle, readTitle }), [handle, readTitle]);
  // Brunch edits and saves the net, so it is offered only on nets the user
  // may edit. The id is the same before and after a draft's first save, so
  // that save changes nothing Brunch's session is built from.
  const openDocument = useMemo<BrunchOpenDocument | null>(
    () => (readonly ? null : { documentId: entityId, editor }),
    [entityId, readonly, editor],
  );

  return (
    <>
      {brunch !== null && openDocument !== null && (
        <BrunchSession
          actorKey={brunch.actorKey}
          chatEndpoint={brunchChatEndpoint(brunch.origin)}
          openDocument={openDocument}
          processEntityId={entityId}
          processExists={saved}
          shown={brunchShown}
          hostTools={hostTools}
          hostSave={hostSave}
          versionLoad={versionLoad}
          onChange={setBrunchAssistant}
        />
      )}
      {/* Brunch's plugin renders its chat from this, inside the editor. */}
      <BrunchAssistantContext value={brunchHost}>
        {/* The title is the breadcrumbs' final crumb, so the editor's own
            title field stays hidden. */}
        <Petrinaut
          handle={handle}
          createNewNet={noNetSwitchingError}
          existingNets={[]}
          hideNetManagementControls="all"
          loadPetriNet={noNetSwitchingError}
          plugins={
            brunch !== null && openDocument !== null
              ? editorPluginsWithBrunch
              : editorPlugins
          }
          readonly={readonly}
          setTitle={setTitle}
          title={title}
        />
      </BrunchAssistantContext>
    </>
  );
};
