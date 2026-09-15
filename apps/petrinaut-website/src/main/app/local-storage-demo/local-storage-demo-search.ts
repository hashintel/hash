import { z } from "zod";

import {
  validateSharedExampleSearch,
  type SharedExampleSearch,
} from "../../../examples/example-search";
const optionalBundleKeySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .optional()
  .catch(undefined);

const demoSearchSchema = z.object({
  bundle: optionalBundleKeySchema,
});

export type LocalStorageDemoSearch = z.infer<typeof demoSearchSchema> &
  SharedExampleSearch;

/**
 * The local demo URL names a worked-model bundle and speaks the shared example
 * contract for the location inside the net.
 */
export const validateLocalStorageDemoSearch = (
  input: Record<string, unknown>,
): LocalStorageDemoSearch => ({
  ...demoSearchSchema.parse(input),
  ...validateSharedExampleSearch(input),
});

/**
 * Replaces the contract part of the demo search while carrying the selected
 * editor/session identity over. Dropping it on the first item selection would
 * silently swap the bundle for an ordinary per-net conversation mid-session.
 */
export const withLocalStorageDemoIdentity = (
  current: LocalStorageDemoSearch,
  next: LocalStorageDemoSearch,
): LocalStorageDemoSearch => ({
  bundle: current.bundle,
  ...next,
});

/** Identity of the stateful editor selected by the route. */
export const localStorageDemoRouteIdentity = (
  search: LocalStorageDemoSearch,
): "ordinary" | "worked-model-bundle" =>
  search.bundle !== undefined ? "worked-model-bundle" : "ordinary";
