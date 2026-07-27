import { DatasetUnavailableError } from "../../shared/errors";
import { webScopedKey } from "../../shared/storage-key";

import type { AnalysisResolutionContext } from "../../shared/analysis-registry";
import type { WebId } from "@blockprotocol/type-system";

/** Top-level storage namespace for all supply-chain analysis artifacts. */
export const SUPPLY_CHAIN_NAMESPACE = "supply-chain";

/**
 * Dataset pointer written by the seed/publish step. Indirecting through a
 * pointer (rather than a hard-coded version) lets a new dataset be published
 * atomically by flipping `current.json` once all `{version}/…` objects exist.
 */
export interface DatasetPointer {
  datasetVersion: string;
}

/**
 * Manifest enumerating every valid id in a published dataset. Used both to
 * validate client-supplied ids (so only known artifacts are resolvable) and to
 * answer list-style analyses' membership checks.
 */
export interface SupplyChainManifest {
  datasetVersion: string;
  products: string[];
  /** Products with a published production_schedule.json artifact. */
  productionSchedules?: string[];
  sites: string[];
  /** Map of productId -> the step ids available for that product. */
  steps: Record<string, string[]>;
}

export const datasetPointerKey = (webId: WebId): string =>
  webScopedKey(webId, SUPPLY_CHAIN_NAMESPACE, "current.json");

export const datasetBaseKey = (webId: WebId, version: string): string =>
  webScopedKey(webId, SUPPLY_CHAIN_NAMESPACE, version);

export const manifestKey = (webId: WebId, version: string): string =>
  `${datasetBaseKey(webId, version)}/manifest.json`;

const parseJson = <T>(buffer: Buffer, what: string): T => {
  try {
    return JSON.parse(buffer.toString("utf8")) as T;
  } catch {
    throw new DatasetUnavailableError(`Malformed ${what}`);
  }
};

/**
 * Resolve the current dataset version and manifest for a web. Throws
 * {@link DatasetUnavailableError} if the web has no published dataset.
 */
export const resolveDataset = async (
  ctx: AnalysisResolutionContext,
): Promise<{
  version: string;
  base: string;
  manifest: SupplyChainManifest;
}> => {
  const pointerBytes = await ctx.loadArtifact(datasetPointerKey(ctx.webId));
  if (!pointerBytes) {
    throw new DatasetUnavailableError(
      `No supply-chain dataset published for web ${ctx.webId}`,
    );
  }

  const { datasetVersion } = parseJson<DatasetPointer>(
    pointerBytes,
    "dataset pointer",
  );
  if (!datasetVersion) {
    throw new DatasetUnavailableError("Dataset pointer missing datasetVersion");
  }

  const manifestBytes = await ctx.loadArtifact(
    manifestKey(ctx.webId, datasetVersion),
  );
  if (!manifestBytes) {
    throw new DatasetUnavailableError(
      `Dataset manifest missing for web ${ctx.webId} version ${datasetVersion}`,
    );
  }

  const manifest = parseJson<SupplyChainManifest>(manifestBytes, "manifest");

  return {
    version: datasetVersion,
    base: datasetBaseKey(ctx.webId, datasetVersion),
    manifest,
  };
};
