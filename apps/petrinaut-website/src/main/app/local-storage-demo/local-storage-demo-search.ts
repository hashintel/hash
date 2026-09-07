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

const fixtureSearchSchema = z.object({
  [crewReservationFixtureQuery]: optionalSearchStringSchema,
});

export type LocalStorageDemoSearch = z.infer<typeof fixtureSearchSchema> &
  SharedExampleSearch;

/**
 * The local demo URL names the prepared fixture it opened and speaks the
 * shared example contract for the location inside the net.
 */
export const validateLocalStorageDemoSearch = (
  input: Record<string, unknown>,
): LocalStorageDemoSearch => ({
  ...fixtureSearchSchema.parse(input),
  ...validateSharedExampleSearch(input),
});

/**
 * Replaces the contract part of the demo search and carries the fixture key
 * over. Every other route writes a contract-only search; here the fixture key
 * names the prepared conversation, and dropping it on the first selection
 * would silently swap the fixture's tools and conversation for the ordinary
 * per-net conversation mid-session.
 */
export const withBrunchFixtureKey = (
  current: LocalStorageDemoSearch,
  next: SharedExampleSearch,
): LocalStorageDemoSearch => ({
  [crewReservationFixtureQuery]: current[crewReservationFixtureQuery],
  ...next,
});

export const isCrewReservationFixtureSelected = (
  search: LocalStorageDemoSearch,
): boolean => search[crewReservationFixtureQuery] === crewReservationFixtureId;
