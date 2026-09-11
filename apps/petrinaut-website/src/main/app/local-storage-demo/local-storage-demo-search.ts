import { z } from "zod";

import {
  validateSharedExampleSearch,
  type SharedExampleSearch,
} from "../../../examples/example-search";
import {
  crewReservationFixtureId,
  crewReservationFixtureQuery,
} from "./prepared-crew-reservation-fixture";

/**
 * Accepting only strings keeps the router's JSON-decoding search parser from
 * coercing a fixture id into some other value; anything else drops out.
 */
const optionalSearchStringSchema = z.string().optional().catch(undefined);
const optionalBundleKeySchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .optional()
  .catch(undefined);

const fixtureSearchSchema = z.object({
  [crewReservationFixtureQuery]: optionalSearchStringSchema,
  bundle: optionalBundleKeySchema,
  brunchTracer: z
    .enum(["root-arc", "construction", "root-creation"])
    .optional()
    .catch(undefined),
});

export type LocalStorageDemoSearch = z.infer<typeof fixtureSearchSchema> &
  SharedExampleSearch;

/**
 * The local demo URL names any prepared fixture, worked-model bundle or tracer
 * it opened and speaks the shared example contract for the location inside
 * the net.
 */
export const validateLocalStorageDemoSearch = (
  input: Record<string, unknown>,
): LocalStorageDemoSearch => ({
  ...fixtureSearchSchema.parse(input),
  ...validateSharedExampleSearch(input),
});

/**
 * Replaces the contract part of the demo search while carrying the selected
 * editor/session identity over. Dropping it on the first item selection would
 * silently swap the bundle, fixture or tracer conversation for an ordinary
 * per-net conversation mid-session.
 */
export const withLocalStorageDemoIdentity = (
  current: LocalStorageDemoSearch,
  next: SharedExampleSearch,
): LocalStorageDemoSearch => ({
  [crewReservationFixtureQuery]: current[crewReservationFixtureQuery],
  bundle: current.bundle,
  ...(current.brunchTracer === undefined
    ? {}
    : { brunchTracer: current.brunchTracer }),
  ...next,
});

export const isCrewReservationFixtureSelected = (
  search: LocalStorageDemoSearch,
): boolean => search[crewReservationFixtureQuery] === crewReservationFixtureId;

export const isRootArcTracerSelected = (
  search: LocalStorageDemoSearch,
): boolean =>
  isCrewReservationFixtureSelected(search) &&
  search.brunchTracer === "root-arc";

export const isConstructionSelected = (
  search: LocalStorageDemoSearch,
): boolean =>
  search.brunchTracer === "construction" ||
  search.brunchTracer === "root-creation";

/** Identity of the stateful editor selected by the route's fixture mode. */
export const localStorageDemoRouteIdentity = (
  search: LocalStorageDemoSearch,
):
  | "ordinary"
  | "worked-model-bundle"
  | "root-arc-tracer"
  | "construction-candidate"
  | "root-creation-candidate"
  | typeof crewReservationFixtureId =>
  search.brunchTracer === "root-creation"
    ? "root-creation-candidate"
    : isConstructionSelected(search)
      ? "construction-candidate"
      : isRootArcTracerSelected(search)
        ? "root-arc-tracer"
        : isCrewReservationFixtureSelected(search)
          ? crewReservationFixtureId
          : search.bundle !== undefined
            ? "worked-model-bundle"
            : "ordinary";
