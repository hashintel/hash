import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

type DocumentOrigin =
  | { readonly kind: "local" }
  | {
      readonly kind: "template";
      readonly bundleKey: string;
      readonly fixtureVersion: string;
    };

export interface DocumentRecord {
  readonly documentId: string;
  readonly incarnationId: string;
  readonly revisionId: DocumentRevisionId;
  readonly title: string;
  readonly definition: SDCPN;
  readonly origin: DocumentOrigin;
  /** ISO timestamp of the last write, when the source records one. */
  readonly lastUpdated?: string;
}

export type DocumentRepositoryStatus =
  | { readonly state: "loading" }
  | { readonly state: "ready" }
  | { readonly state: "unavailable"; readonly error: Error };

export interface DocumentRepository {
  readonly records: readonly DocumentRecord[];
  readonly current: DocumentRecord | null;
  readonly status: DocumentRepositoryStatus;
  open(documentId: string): void;
  readonly actions: {
    readonly create?: (input: {
      readonly title: string;
      readonly definition: SDCPN;
    }) => DocumentRecord;
    readonly rename?: (input: {
      readonly documentId: string;
      readonly title: string;
    }) => void;
    readonly createCleanNetProjection?: () => Promise<void>;
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

export interface ProcessAgentSeed {
  readonly documentId: string;
  readonly conversationId: string;
}

/** What the route resolved to. */
export interface DocumentSource {
  readonly repository: DocumentRepository;
  /** The only channel by which remote conversation identity enters the host. */
  readonly processAgentSeed?: ProcessAgentSeed;
}

/** Host-level coordinator; the only seam that knows both document sources. */
export interface DocumentController {
  readonly source: DocumentSource;
  createLocalAndOpen(input: {
    readonly title: string;
    readonly definition: SDCPN;
  }): void;
}
