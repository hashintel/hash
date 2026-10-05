/**
 * What the host knows and Petrinaut does not: Brunch's endpoint and the open
 * document's record. The host provides it above the editor; the plugin reads
 * it on every render.
 */

import { createContext } from "react";

import type { DocumentRecord } from "../../local-storage-demo/documents/document-repository";
import type { DocumentRevisionId } from "@hashintel/petrinaut-core";

export interface BrunchHost {
  /** The Brunch chat endpoint, e.g. `VITE_BRUNCH_CHAT_ENDPOINT`. */
  readonly chatEndpoint: string;
  /** The open document's record: id, incarnation, title, revision. `null` between documents. */
  readonly document: DocumentRecord | null;
  /** Resolves once the host has stored the revision, so tool results can cite it. */
  readonly settleRevision: (input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<void>;
}

export const BrunchHostContext = createContext<BrunchHost | null>(null);
