import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { webScopedKey } from "../analysis/shared/storage-key";
import { getOrgByShortname } from "../graph/knowledge/system-types/org";
import { systemAccountId } from "../graph/system-account";
import {
  planSupplyChainDatasetImport,
  uploadSupplyChainDataset,
} from "./supply-chain-dataset-import";

import type { ImpureGraphContext } from "../graph/context-types";
import type { Logger } from "@local/hash-backend-utils/logger";

/**
 * Vendored, web-agnostic demo dataset for the supply-chain views.
 */
const DEMO_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "supply-chain-demo",
);

const EXAMPLE_ORG_SHORTNAME = "example-org";
const STORAGE_NAMESPACE = "supply-chain";

/** The `datasetVersion` of the vendored dataset, or `null` if unreadable. */
const readVendoredDatasetVersion = (): string | null => {
  try {
    const raw = fs.readFileSync(
      path.join(DEMO_DATA_DIR, "current.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { datasetVersion?: unknown };
    return typeof parsed.datasetVersion === "string"
      ? parsed.datasetVersion
      : null;
  } catch {
    return null;
  }
};

/**
 * Upload the vendored supply-chain demo dataset into the `@example-org` web's
 * storage namespace so the analysis gateway can serve it to seeded users.
 *
 * Safe to call on every boot:
 * - no-ops in environments without the example org (e.g. production) or without
 *   vendored data;
 * - skips when the web already has this `datasetVersion` seeded (so reboots are
 *   cheap), and otherwise re-uploads. Storage keys are deterministic, so an
 *   upload overwrites the existing object rather than creating duplicates.
 */
export const seedSupplyChainDemo = async (params: {
  logger: Logger;
  context: ImpureGraphContext<false, true>;
}): Promise<void> => {
  const { logger, context } = params;

  if (!fs.existsSync(DEMO_DATA_DIR)) {
    logger.info("No supply-chain demo data vendored; skipping demo seed.");
    return;
  }

  const { uploadProvider } = context;
  if (!uploadProvider) {
    logger.warn(
      "No upload provider available; skipping supply-chain demo seed.",
    );
    return;
  }

  const org = await getOrgByShortname(
    context,
    { actorId: systemAccountId },
    { shortname: EXAMPLE_ORG_SHORTNAME },
  );

  if (!org) {
    logger.info(
      `No "${EXAMPLE_ORG_SHORTNAME}" org found; skipping supply-chain demo seed.`,
    );
    return;
  }

  const { webId } = org;
  const currentKey = webScopedKey(webId, STORAGE_NAMESPACE, "current.json");
  const vendoredVersion = readVendoredDatasetVersion();

  if (!vendoredVersion) {
    logger.warn(
      "Supply-chain demo data has no readable current.json pointer; skipping demo seed.",
    );
    return;
  }

  // Idempotency: if this web already has the vendored version seeded, skip the
  // re-upload entirely. (Bumping `datasetVersion` falls through and re-seeds.)
  try {
    const existing = await uploadProvider.downloadDirect({ key: currentKey });
    const parsed = JSON.parse(existing.toString("utf8")) as {
      datasetVersion?: unknown;
    };
    if (parsed.datasetVersion === vendoredVersion) {
      logger.info(
        `Supply-chain demo dataset v${vendoredVersion} already seeded into web ${webId}; skipping.`,
      );
      return;
    }
  } catch {
    // Not seeded yet (or pointer unreadable) — fall through and upload.
  }

  const plan = planSupplyChainDatasetImport({
    sourceDir: path.join(DEMO_DATA_DIR, vendoredVersion),
    version: vendoredVersion,
  });
  const result = await uploadSupplyChainDataset({
    plan,
    uploadProvider,
    webId,
  });

  logger.info(
    `Seeded supply-chain demo dataset v${vendoredVersion} into web ${webId} (${result.uploadedFiles} files).`,
  );
};
