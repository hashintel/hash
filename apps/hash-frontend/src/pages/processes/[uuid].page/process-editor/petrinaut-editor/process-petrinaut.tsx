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
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import { useAuthInfo } from "../../../../shared/auth-info-context";
import { useBrunchHashGraphReadTools } from "./process-petrinaut/brunch-hash-graph-reads";
import { topBarPlugin } from "./process-petrinaut/top-bar-plugin";

import type { EntityId, UserId } from "@blockprotocol/type-system";

const editorPlugins = [topBarPlugin];
const editorPluginsWithBrunch = [topBarPlugin, brunchPlugin];

/** Brunch's HASH agent, reached through hash-api's Brunch route. */
const brunchChatEndpoint = `${apiOrigin}/api/brunch${brunchRoutes.agents}/${brunchRoutes.hashAgent}`;

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
      "the host (process-editor) drives all net loads.",
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

/**
 * Brunch's assistant for one saved net, mounted only while it is offered, so
 * the hook never runs without an owner key. Renders nothing: it hands the
 * assistant to its parent, which keeps `<Petrinaut>` mounted whether or not
 * Brunch is offered. Unmounting withdraws it.
 *
 * Memoised, and its props must stay stable: the hook returns a new assistant
 * on every render, so if the parent's update re-rendered this component, each
 * hand-over would schedule the next and never settle.
 */
const BrunchSession = memo(
  ({
    ownerKey,
    openDocument,
    shown,
    hostTools,
    hostSave,
    versionLoad,
    onChange,
  }: {
    ownerKey: string;
    openDocument: BrunchOpenDocument;
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
    const { assistant } = useBrunchAssistant({
      ownerKey,
      chatEndpoint: brunchChatEndpoint,
      fetch: brunchFetch,
      selected: shown,
      openDocument,
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
 * the net is saved, the user may edit it, and the account's owner key is
 * known. Rendered inside the editor's `ErrorTrackerContext`, so Brunch's
 * contained failures reach the same reporter as Petrinaut's.
 */
export const ProcessPetrinaut = ({
  handle,
  savedEntityId,
  readTitle,
  hostSave,
  versionLoad,
  readonly,
  setTitle,
  title,
}: {
  handle: PetrinautDocHandle;
  /** The open net's entity id, or `null` while it is an unsaved draft. */
  savedEntityId: EntityId | null;
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
  const ownerKey = useBrunchOwnerKey();
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
            ownerKey !== null && openDocument !== null
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
