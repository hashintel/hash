/**
 * Contract types for the ingest pipeline UI.
 *
 * These mirror the Zod schemas in the internal repo's pipeline contracts
 * but as plain TypeScript types — the Mastra API validates; the frontend
 * just consumes the JSON.
 */

// ---------------------------------------------------------------------------
//  Anchors & blocks
// ---------------------------------------------------------------------------

export interface PdfBbox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  unit: "pt";
}

export interface FilePageBboxAnchor {
  kind: "file_page_bbox";
  page: number;
  bbox: PdfBbox;
}

export type Anchor = FilePageBboxAnchor;

export interface Block {
  blockId: string;
  sourceId: string;
  kind: string;
  text: string;
  anchors: Anchor[];
  confidence?: number;
  attributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
//  Evidence refs
// ---------------------------------------------------------------------------

export interface BlockSpan {
  blockId: string;
  start: number;
  end: number;
}

export interface EvidenceRef {
  sourceId: string;
  blockIds: string[];
  blockSpans: BlockSpan[];
  quote: string;
}

// ---------------------------------------------------------------------------
//  Corpus
// ---------------------------------------------------------------------------

export interface Source {
  sourceId: string;
  kind: "file" | "web" | "audio" | "video";
  mimeType: string;
  stableRef: {
    contentHash: string;
    fileEntityId?: string;
    snapshotId?: string;
  };
}

export interface ExtractedCorpus {
  version: "v0";
  parser: string;
  sources: Source[];
  blocks: Block[];
  metadata: {
    language?: string;
    createdAt?: string;
  };
}

// ---------------------------------------------------------------------------
//  Discovery domain
// ---------------------------------------------------------------------------

export type MentionCategory =
  | "person"
  | "organization"
  | "place"
  | "artifact"
  | "event"
  | "other";

export interface EntityMention {
  chunkId: string;
  blockId: string;
  start: number;
  end: number;
  surface: string;
}

export interface RosterEntry {
  rosterEntryId: string;
  canonicalName: string;
  category?: MentionCategory;
  discoveredTypeId: string;
  resolvedTypeId: string;
  summary: string;
  mentions: EntityMention[];
  chunkIds: string[];
  mergedLocalIds: string[];
}

export interface ExtractedClaim {
  claimId: string;
  rosterEntryId: string;
  claimText: string;
  subject: string;
  predicate: string;
  object: string;
  evidenceRefs: EvidenceRef[];
}

// ---------------------------------------------------------------------------
//  Page images
// ---------------------------------------------------------------------------

export interface PageImageManifest {
  contentHash: string;
  pageNumber: number;
  imageUrl: string;
  pdfPageWidth: number;
  pdfPageHeight: number;
  bboxOrigin: "BOTTOMLEFT" | "TOPLEFT";
}

// ---------------------------------------------------------------------------
//  Run status & view
// ---------------------------------------------------------------------------

export interface RunStatus {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  phase?: string;
  step?: string;
  contentHash?: string;
  counts?: {
    pages?: number;
    chunks?: number;
    mentions?: number;
    claims?: number;
  };
  startedAt?: string;
  updatedAt?: string;
  error?: string;
}

export interface IngestRunView {
  runId: string;
  sourceMetadata: {
    filename: string;
    contentHash: string;
    mimeType: string;
  };
  pageImages: PageImageManifest[];
  roster: { entries: RosterEntry[] };
  claims: ExtractedClaim[];
  corpus: ExtractedCorpus;
}
