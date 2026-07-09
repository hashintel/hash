/**
 * Local development utility for importing externally generated supply-chain
 * analysis artifacts into a HASH web.
 *
 * The importer publishes a directory of JSON artifacts into HASH's analysis
 * storage namespace so the `/supply-chain` route can exercise the same gateway
 * path as seeded demo data.
 */

import express from "express";

import {
  type ProvidedEntityEditionProvenance,
  type WebId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import { getOrgByShortname } from "../graph/knowledge/system-types/org";
import {
  ensureHashSystemAccountExists,
  systemAccountId,
} from "../graph/system-account";
import { getEnvStorageType } from "../lib/config";
import { isDevEnv, isTestEnv } from "../lib/env-config";
import { logger } from "../logger";
import { setupStorageProviders } from "../storage";
import {
  defaultSupplyChainDatasetVersion,
  planSupplyChainDatasetImport,
  uploadSupplyChainDataset,
} from "./supply-chain-dataset-import";

import type { ImpureGraphContext } from "../graph/context-types";

interface CliArgs {
  dryRun: boolean;
  orgShortname?: string;
  source?: string;
  version: string;
  webId?: WebId;
}

const usage = `
Usage:
  yarn workspace @apps/hash-api dev:import-supply-chain-data -- --source <path> (--org-shortname <shortname> | --web-id <webId>) [--version <version>] [--dry-run]

Options:
  --source <path>              Directory containing products.json and product artifacts
  --org-shortname <shortname>  Resolve the target HASH web from an organization shortname
  --web-id <webId>             Target HASH web id directly
  --version <version>          Dataset version to publish (default: local timestamp)
  --dry-run                    Validate and report without uploading
`;

const readFlagValue = (
  args: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return { value, nextIndex: index + 1 };
};

const parseArgs = (argv: string[]): CliArgs => {
  const parsed: CliArgs = {
    dryRun: false,
    version: defaultSupplyChainDatasetVersion(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--":
        break;
      case "--source": {
        const { value, nextIndex } = readFlagValue(argv, i, arg);
        parsed.source = value;
        i = nextIndex;
        break;
      }
      case "--org-shortname": {
        const { value, nextIndex } = readFlagValue(argv, i, arg);
        parsed.orgShortname = value;
        i = nextIndex;
        break;
      }
      case "--web-id": {
        const { value, nextIndex } = readFlagValue(argv, i, arg);
        parsed.webId = value as WebId;
        i = nextIndex;
        break;
      }
      case "--version": {
        const { value, nextIndex } = readFlagValue(argv, i, arg);
        parsed.version = value;
        i = nextIndex;
        break;
      }
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--help":
      case "-h":
        process.stdout.write(usage);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.source) {
    throw new Error("--source is required");
  }
  if (parsed.orgShortname && parsed.webId) {
    throw new Error("Pass exactly one of --org-shortname or --web-id");
  }
  if (!parsed.orgShortname && !parsed.webId) {
    throw new Error("Pass exactly one of --org-shortname or --web-id");
  }

  return parsed;
};

const provenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "api",
  },
};

const createContext = (): ImpureGraphContext<true> => {
  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const uploadProvider = setupStorageProviders(express(), getEnvStorageType());

  return {
    graphApi,
    provenance,
    uploadProvider,
  };
};

const resolveTargetWebId = async (
  context: ImpureGraphContext<true>,
  args: CliArgs,
): Promise<WebId> => {
  if (args.webId) {
    return args.webId;
  }

  await ensureHashSystemAccountExists({ logger, context });

  const org = await getOrgByShortname(
    context,
    { actorId: systemAccountId },
    { shortname: args.orgShortname! },
  );

  if (!org) {
    throw new Error(
      `No organization found with shortname "${args.orgShortname}"`,
    );
  }

  return org.webId;
};

const importSupplyChainDataset = async () => {
  if (!isDevEnv && !isTestEnv) {
    throw new Error(
      "Supply-chain dataset import is only available in development or test.",
    );
  }

  const args = parseArgs(process.argv.slice(2));
  const plan = planSupplyChainDatasetImport({
    sourceDir: args.source!,
    version: args.version,
  });

  logger.info(
    `Supply-chain dataset ${plan.version}: ${plan.manifest.products.length} products, ${plan.manifest.sites.length} sites, ${Object.values(
      plan.manifest.steps,
    ).reduce(
      (sum, productSteps) => sum + productSteps.length,
      0,
    )} steps, ${plan.files.length} source JSON files.`,
  );

  if (args.dryRun && args.webId) {
    logger.info("Dry run complete; no files uploaded.");
    return;
  }

  const context = createContext();
  const webId = await resolveTargetWebId(context, args);

  if (args.dryRun) {
    logger.info(`Dry run complete for web ${webId}; no files uploaded.`);
    return;
  }

  const result = await uploadSupplyChainDataset({
    plan,
    uploadProvider: context.uploadProvider,
    webId,
  });

  logger.info(
    `Imported supply-chain dataset ${plan.version} into web ${webId}: ${result.uploadedFiles} JSON files uploaded.`,
  );
};

try {
  await importSupplyChainDataset();
} catch (error) {
  logger.error(
    error instanceof Error ? error.message : `Import failed: ${String(error)}`,
  );
  process.stderr.write(usage);
  process.exit(1);
}
