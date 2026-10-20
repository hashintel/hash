import { createContext, use, useEffect } from "react";

import { type PetrinautDocHandle, type SDCPN } from "@hashintel/petrinaut";
import {
  getLatestNetDefinitionToolName,
  hashPetrinautDocument,
  mutationActionInputSchemas,
} from "@hashintel/petrinaut-core";
import {
  definePetrinautPlugin,
  describeRefusal,
  type EditResult,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import {
  type EditorCallResult,
  type IframeToHostMessage,
  isHostToIframeMessage,
} from "../../shared/messages";

/**
 * The handle the embed created for the open net. The bridge reads and hashes
 * `handle.doc()`, as the Petrinaut website's executor does, rather than the
 * plugin API's `document.net`, which leaves out disabled extensions' data.
 */
export const EditorBridgeHandleContext =
  createContext<PetrinautDocHandle | null>(null);

/**
 * FE-2010 probe: serves the host's `editorCall` messages from inside the
 * sandbox, so code outside the iframe can read and edit the open net.
 *
 * This tests the bridge's mechanics only: attach identity, content revision,
 * stale refusal and reload. Its tools are not Brunch's executor
 * (`createCanonicalPetrinautHostTools` in the Petrinaut website), whose
 * outputs and read-back metadata Brunch's server depends on; reusing that
 * executor here is groundwork, not part of this probe.
 */
const EditorBridgePlugin = definePetrinautPlugin({
  id: "hash.editor-bridge",
  name: "Editor bridge",
  description:
    "Lets the HASH page read and edit the open net with Petrinaut's tools.",
  author: "HASH",
  required: true,
  access: { document: "write" },
});

type EditorDocument = Parameters<
  PluginHook<typeof EditorBridgePlugin>
>[0]["document"];

type MutationToolName = keyof typeof mutationActionInputSchemas;

type ToolOutcome =
  | { ok: true; output: unknown }
  | {
      ok: false;
      disposition: Extract<EditorCallResult, { ok: false }>["disposition"];
      message: string;
    };

/** Content revision without canvas positions, as Brunch's stack computes it. */
const documentRevisionOf = (definition: SDCPN): string =>
  hashPetrinautDocument(definition, { exclude: ["layout"] });

/** A nonce per attach; `crypto.randomUUID` needs a secure context. */
const newAttachId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const isMutationToolName = (toolName: string): toolName is MutationToolName =>
  Object.hasOwn(mutationActionInputSchemas, toolName);

const runEditorTool = (
  handle: PetrinautDocHandle,
  document: EditorDocument,
  toolName: string,
  input: unknown,
): ToolOutcome => {
  if (toolName === getLatestNetDefinitionToolName) {
    return {
      ok: true,
      output: { title: document.title.get(), definition: handle.doc() },
    };
  }

  if (!isMutationToolName(toolName)) {
    return {
      ok: false,
      disposition: "unstarted",
      message: `The editor has no tool named "${toolName}".`,
    };
  }

  const parsed = mutationActionInputSchemas[toolName].safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      disposition: "unstarted",
      message: parsed.error.message,
    };
  }

  const edit = document.edit[toolName] as (input: unknown) => EditResult;
  const result = edit(parsed.data);
  return result.applied
    ? { ok: true, output: { applied: true } }
    : {
        ok: false,
        disposition: "unstarted",
        message: describeRefusal(result.reason),
      };
};

const postToHost = (message: IframeToHostMessage) => {
  window.parent.postMessage(message, "*");
};

const useEditorBridgePlugin: PluginHook<typeof EditorBridgePlugin> = ({
  document,
}) => {
  const handle = use(EditorBridgeHandleContext);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const attachId = newAttachId();
    const revisionNow = (): string | null => {
      const definition = handle.doc();
      return definition ? documentRevisionOf(definition) : null;
    };

    let reportedRevision = revisionNow();
    const unsubscribe = handle.subscribe(() => {
      const revision = revisionNow();
      if (revision === null || revision === reportedRevision) {
        return;
      }
      reportedRevision = revision;
      postToHost({ kind: "documentChanged", attachId, revision });
    });

    const answer = (callId: string, result: EditorCallResult) =>
      postToHost({ kind: "editorCallResult", callId, attachId, result });

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }
      const data: unknown = event.data;
      if (!isHostToIframeMessage(data) || data.kind !== "editorCall") {
        return;
      }

      const before = revisionNow();
      if (data.attachId !== attachId || before === null) {
        postToHost({
          kind: "editorCallResult",
          callId: data.callId,
          attachId: data.attachId,
          result: {
            ok: false,
            disposition: "unstarted",
            message:
              before === null
                ? "The editor has no document loaded."
                : "This editor did not attach with that id.",
            revision: before,
          },
        });
        return;
      }

      if (
        data.expectedRevision !== undefined &&
        data.expectedRevision !== before
      ) {
        answer(data.callId, {
          ok: false,
          disposition: "stale",
          message: "The net changed since the revision the caller expected.",
          revision: before,
        });
        return;
      }

      let outcome: ToolOutcome;
      try {
        outcome = runEditorTool(handle, document, data.toolName, data.input);
      } catch (error) {
        outcome = {
          ok: false,
          disposition: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }

      const after = revisionNow();
      answer(
        data.callId,
        outcome.ok
          ? {
              ok: true,
              output: outcome.output,
              metadata: {
                documentRevision: {
                  before,
                  ...(after !== null && after !== before ? { after } : {}),
                },
              },
            }
          : { ...outcome, revision: after },
      );
    };

    window.addEventListener("message", onMessage);
    postToHost({
      kind: "editorAttached",
      attachId,
      documentId: handle.id,
      revision: reportedRevision,
    });

    return () => {
      window.removeEventListener("message", onMessage);
      unsubscribe();
    };
  }, [handle, document]);

  return {};
};

export const editorBridgePlugin = EditorBridgePlugin(useEditorBridgePlugin);
