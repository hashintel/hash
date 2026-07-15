import type { Express } from "express";

export const PETRINAUT_OPTIMIZER_STATUS_PATH =
  "/api/petrinaut-optimizer/status";

const STATUS_REQUEST_TIMEOUT_MS = 5_000;

type Fetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type WarningLogger = {
  warn: (message: string, metadata?: Record<string, unknown>) => void;
};

type PetrinautOptimizerHandlerOptions = {
  origin: URL | null;
  fetchImpl?: Fetch;
  logger: WarningLogger;
};

/**
 * Resolve the private optimizer origin from the environment.
 *
 * Both variables may be omitted for local NodeAPI development. Supplying only
 * one is treated as a configuration error rather than silently constructing an
 * unusable URL.
 */
export const getPetrinautOptimizerOrigin = (
  environment: NodeJS.ProcessEnv = process.env,
): URL | null => {
  const host = environment.HASH_PETRINAUT_OPT_HOST;
  const portValue = environment.HASH_PETRINAUT_OPT_PORT;

  if (!host && !portValue) {
    return null;
  }
  if (!host || !portValue) {
    throw new Error(
      "HASH_PETRINAUT_OPT_HOST and HASH_PETRINAUT_OPT_PORT must be set together",
    );
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("HASH_PETRINAUT_OPT_PORT must be an integer from 1 to 65535");
  }

  const urlHost =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return new URL(`http://${urlHost}:${port}`);
};

/**
 * Mount the first NodeAPI-to-optimizer integration point.
 *
 * This intentionally exposes only the optimizer's lightweight status payload.
 * The optimization request and streaming contracts will be added separately.
 */
export const setupPetrinautOptimizerHandler = (
  app: Express,
  { origin, fetchImpl = fetch, logger }: PetrinautOptimizerHandlerOptions,
) => {
  app.get(PETRINAUT_OPTIMIZER_STATUS_PATH, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!origin) {
      res.status(503).json({ error: "Petrinaut optimizer is not configured" });
      return;
    }

    try {
      const upstreamResponse = await fetchImpl(new URL("/status", origin), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
      });

      if (!upstreamResponse.ok) {
        throw new Error(
          `Petrinaut optimizer returned status ${upstreamResponse.status}`,
        );
      }

      const status: unknown = await upstreamResponse.json();
      res.json(status);
    } catch (error) {
      logger.warn("Could not reach Petrinaut optimizer", { error });
      res.status(503).json({ error: "Petrinaut optimizer is unavailable" });
    }
  });
};
