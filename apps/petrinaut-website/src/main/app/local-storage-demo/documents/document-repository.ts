import type { SDCPN } from "@hashintel/petrinaut-core";

/** Identifies one write of a stored record; each write names its predecessor. */
export type RecordRevisionId = string;

export interface DocumentRecord {
  readonly documentId: string;
  readonly incarnationId: string;
  readonly revisionId: RecordRevisionId;
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
    readonly previousRevisionId: RecordRevisionId;
    readonly revisionId: RecordRevisionId;
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
