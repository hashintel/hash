/**
 * Errors thrown while resolving a named analysis. The gateway maps each to an
 * appropriate per-result status (the batch request itself still returns 200).
 */

/** Invalid or missing arguments for an analysis (maps to `error`, client fault). */
export class AnalysisArgError extends Error {
  public readonly code = "INVALID_ARGS";

  constructor(message: string) {
    super(message);
    this.name = "AnalysisArgError";
  }
}

/** A requested entity/artifact does not exist in the resolved dataset. */
export class AnalysisNotFoundError extends Error {
  public readonly code = "NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "AnalysisNotFoundError";
  }
}

/** The analysis computation ran but failed (maps to `error`). */
export class AnalysisExecutionError extends Error {
  public readonly code = "EXECUTION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "AnalysisExecutionError";
  }
}

/** The dataset for a web/version is missing or not yet provisioned. */
export class DatasetUnavailableError extends Error {
  public readonly code = "DATASET_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "DatasetUnavailableError";
  }
}
