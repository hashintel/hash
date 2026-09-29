import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

export interface DocumentRecord {
  readonly documentId: string;
  readonly incarnationId: string;
  readonly revisionId: DocumentRevisionId;
  readonly title: string;
  readonly definition: SDCPN;
  /** ISO timestamp of the last write, when the source records one. */
  readonly lastUpdated?: string;
}

type DocumentRepositoryStatus =
  | { readonly state: "loading" }
  | { readonly state: "ready" };

export interface DocumentRepository {
  readonly records: readonly DocumentRecord[];
  readonly current: DocumentRecord | null;
  readonly status: DocumentRepositoryStatus;
  open(documentId: string): void;
  readonly actions: {
    readonly create: (input: {
      readonly title: string;
      readonly definition: SDCPN;
    }) => DocumentRecord;
    readonly rename: (input: {
      readonly documentId: string;
      readonly title: string;
    }) => void;
  };
  persistRevision(change: {
    readonly documentId: string;
    readonly incarnationId: string;
    readonly definition: SDCPN;
    readonly previousRevisionId: DocumentRevisionId;
    readonly revisionId: DocumentRevisionId;
  }): Promise<void>;
  settleRevision(input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }): Promise<void>;
}

/** Host-level coordinator over the local document repository. */
export interface DocumentController {
  readonly repository: DocumentRepository;
  createAndOpen(input: {
    readonly title: string;
    readonly definition: SDCPN;
  }): void;
}
