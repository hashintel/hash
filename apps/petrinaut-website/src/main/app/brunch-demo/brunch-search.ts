import { z } from "zod";

import {
  validateSharedExampleSearch,
  type SharedExampleSearch,
} from "../../../examples/example-search";

/**
 * The router's search parser JSON-decodes values before validation, so a
 * numeric-looking parameter arrives pre-mangled (`?runId=1e3` becomes 1000,
 * ids above 2^53 lose precision). Accepting only strings drops such values to
 * `undefined` instead of coercing them into plausible-looking altered ids.
 */
const optionalSearchStringSchema = z.string().optional().catch(undefined);

const brunchStreamSearchSchema = z.object({
  runId: optionalSearchStringSchema,
  sse: optionalSearchStringSchema,
});

export type BrunchRouteSearch = z.infer<typeof brunchStreamSearchSchema> &
  SharedExampleSearch;

/**
 * A Brunch URL names the stream (`sse`, `runId`) and speaks the shared example
 * contract for the location inside the net.
 */
export const validateBrunchSearch = (
  input: Record<string, unknown>,
): BrunchRouteSearch => ({
  ...brunchStreamSearchSchema.parse(input),
  ...validateSharedExampleSearch(input),
});

/**
 * Replaces the contract part of a Brunch search and carries the stream keys
 * over. Every other route writes a contract-only search; here the stream keys
 * name the run, and dropping them would swap the live editor for the
 * missing-endpoint status page mid-run.
 */
export const withBrunchStreamKeys = (
  current: BrunchRouteSearch,
  next: SharedExampleSearch,
): BrunchRouteSearch => ({
  runId: current.runId,
  sse: current.sse,
  ...next,
});
