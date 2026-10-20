import { type RefObject, useCallback, useMemo, useRef } from "react";

import {
  type EditorCallResult,
  type HostToIframeMessage,
  type IframeToHostMessage,
  nextRequestId,
} from "../../shared/messages";

/**
 * A call the iframe never answered for the editor it named. Its effect is
 * unknown, so this is never a browser-call failure disposition: `replaced`
 * means any effect happened in an editor whose unsaved state is gone;
 * `no-answer` means the editor may still have applied it.
 */
type EditorCallUnknown = {
  ok: false;
  unknown: "no-editor" | "replaced" | "no-answer";
  message: string;
};

export type EditorCallOutcome = (EditorCallResult | EditorCallUnknown) & {
  attachId: string | null;
};

type PendingCall = {
  attachId: string;
  resolve: (outcome: EditorCallOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
};

type AttachedEditor = {
  attachId: string;
  documentId: string;
  revision: string | null;
};

type EditorMessage<Kind extends IframeToHostMessage["kind"]> = Extract<
  IframeToHostMessage,
  { kind: Kind }
>;

/**
 * FE-2010 probe, host side of the editor bridge: calls tools on the editor
 * the iframe currently hosts, and tracks that editor's attach id and content
 * revision.
 *
 * Each call is bound to the attach current when it was sent. A reload or a
 * net switch attaches anew, which settles every call bound to the old attach
 * as `replaced`, so an answer from a replaced editor is never reported as a
 * result on the new one.
 */
export const useEditorToolBridge = ({
  iframeRef,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) => {
  const editorRef = useRef<AttachedEditor | null>(null);
  const pendingRef = useRef(new Map<string, PendingCall>());

  const settle = useCallback((callId: string, outcome: EditorCallOutcome) => {
    const pending = pendingRef.current.get(callId);
    if (!pending) {
      return;
    }
    pendingRef.current.delete(callId);
    clearTimeout(pending.timer);
    pending.resolve(outcome);
  }, []);

  const settleUnknownWhere = useCallback(
    (
      matches: (pending: PendingCall) => boolean,
      unknown: Omit<EditorCallUnknown, "ok">,
    ) => {
      for (const [callId, pending] of pendingRef.current) {
        if (matches(pending)) {
          settle(callId, { ok: false, ...unknown, attachId: pending.attachId });
        }
      }
    },
    [settle],
  );

  const handlers = useMemo(
    () => ({
      /** A `ready` after the first means the iframe document was replaced. */
      onReady: () => {
        editorRef.current = null;
        settleUnknownWhere(() => true, {
          unknown: "replaced",
          message: "The editor reloaded before answering.",
        });
      },
      onEditorAttached: ({
        attachId,
        documentId,
        revision,
      }: EditorMessage<"editorAttached">) => {
        editorRef.current = { attachId, documentId, revision };
        settleUnknownWhere((pending) => pending.attachId !== attachId, {
          unknown: "replaced",
          message: "Another editor attached before this call was answered.",
        });
      },
      onEditorCallResult: ({
        callId,
        attachId,
        result,
      }: EditorMessage<"editorCallResult">) => {
        if (pendingRef.current.get(callId)?.attachId !== attachId) {
          return;
        }
        settle(callId, { ...result, attachId });
      },
      onDocumentChanged: ({
        attachId,
        revision,
      }: EditorMessage<"documentChanged">) => {
        if (editorRef.current?.attachId === attachId) {
          editorRef.current = { ...editorRef.current, revision };
        }
      },
    }),
    [settle, settleUnknownWhere],
  );

  const callEditorTool = useCallback(
    (
      toolName: string,
      input: unknown,
      {
        expectedRevision,
        timeoutMs = 10_000,
      }: { expectedRevision?: string; timeoutMs?: number } = {},
    ) =>
      new Promise<EditorCallOutcome>((resolve) => {
        const editor = editorRef.current;
        const iframeWindow = iframeRef.current?.contentWindow;
        if (!editor || !iframeWindow) {
          resolve({
            ok: false,
            unknown: "no-editor",
            message: "No editor is attached; the call was not sent.",
            attachId: null,
          });
          return;
        }

        const callId = nextRequestId();
        pendingRef.current.set(callId, {
          attachId: editor.attachId,
          resolve,
          timer: setTimeout(
            () =>
              settle(callId, {
                ok: false,
                unknown: "no-answer",
                message: `The editor did not answer within ${timeoutMs} ms; the call's effect is unknown.`,
                attachId: editor.attachId,
              }),
            timeoutMs,
          ),
        });

        /** As `useHostBridge`'s `send`: an opaque-origin iframe needs "*". */
        iframeWindow.postMessage(
          {
            kind: "editorCall",
            callId,
            attachId: editor.attachId,
            toolName,
            input,
            ...(expectedRevision === undefined ? {} : { expectedRevision }),
          } satisfies HostToIframeMessage,
          "*",
        );
      }),
    [iframeRef, settle],
  );

  const getAttachedEditor = useCallback(() => editorRef.current, []);

  return { handlers, callEditorTool, getAttachedEditor };
};
