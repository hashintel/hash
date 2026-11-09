/**
 * Preloaded into the server process by the smoke driver (`NODE_OPTIONS=--import`):
 * counts every HTTP request to the model provider's API in a JSON-lines ledger
 * and refuses, without sending, any request beyond the budget. Erasable
 * TypeScript only: `yarn` and `tsx`'s own processes load it through Node's
 * type stripping, before any TypeScript loader.
 *
 * - `SMOKE_REQUEST_LEDGER`: the ledger file; it persists across driver runs, so
 *   a retried run counts against the same budget.
 * - `SMOKE_REQUEST_BUDGET`: the most requests the ledger may record.
 *
 * Records the path, status and, for a refusal by the provider, its error body.
 * Never records headers: they carry the API key.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const ledger = process.env.SMOKE_REQUEST_LEDGER;
const budget = Number(process.env.SMOKE_REQUEST_BUDGET ?? 0);
const providerHosts = new Set(["api.anthropic.com", "openrouter.ai"]);

const record = (path: string, entry: Record<string, unknown>) =>
  appendFileSync(
    path,
    `${JSON.stringify({ ...entry, at: new Date().toISOString(), pid: process.pid })}\n`,
  );

const sent = (path: string) =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.includes('"event":"request"')).length
    : 0;

const urlOf = (input: string | URL | Request) =>
  new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );

if (ledger !== undefined) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = urlOf(input);
    if (!providerHosts.has(url.hostname)) return original(input, init);
    const used = sent(ledger);
    if (used >= budget) {
      record(ledger, { event: "refused", path: url.pathname, used, budget });
      throw new Error(`Smoke budget of ${budget} model requests is spent.`);
    }
    const n = used + 1;
    record(ledger, { event: "request", n, path: url.pathname });
    const response = await original(input, init);
    const error = response.ok
      ? undefined
      : (await response.clone().text()).slice(0, 4000);
    record(ledger, { event: "response", n, status: response.status, error });
    return response;
  };
}
