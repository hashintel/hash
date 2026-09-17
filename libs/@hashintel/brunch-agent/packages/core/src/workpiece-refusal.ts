import type {
  WorkpieceRefusalCode,
  WorkpieceRevisionPointer,
} from "./workpiece";

/** Model-correctable workpiece validation. Unexpected failures must not use this type. */
export class WorkpieceValidationRefusal extends Error {
  readonly code: WorkpieceRefusalCode;
  readonly currentRevision: WorkpieceRevisionPointer | null;

  constructor(
    code: WorkpieceRefusalCode,
    message: string,
    currentRevision: WorkpieceRevisionPointer | null = null,
  ) {
    super(message);
    this.name = "WorkpieceValidationRefusal";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

export const isWorkpieceValidationRefusal = (
  error: unknown,
): error is WorkpieceValidationRefusal =>
  error instanceof WorkpieceValidationRefusal;

export const workpieceRevisionPointer = (
  revision: {
    readonly revisionId: string;
    readonly sha256: string;
    readonly ordinal: number;
  } | null,
): WorkpieceRevisionPointer | null =>
  revision === null
    ? null
    : {
        revisionId: revision.revisionId,
        sha256: revision.sha256,
        ordinal: revision.ordinal,
      };
