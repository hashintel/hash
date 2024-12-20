import type { Brand } from "@local/advanced-types/brand";

import type { Uuid } from "./branded.js";

/** An ID to uniquely identify an account (e.g. a User) */
export type AccountId = Brand<Uuid, "AccountId">;

/** An ID to uniquely identify an account group (e.g. an Org) */
export type AccountGroupId = Brand<Uuid, "AccountGroupId">;

/** An account ID of creating actor */
export type CreatedById = Brand<AccountId, "CreatedById">;

/** An account ID of an actor that has created a specific edition */
export type EditionCreatedById = Brand<AccountId, "EditionCreatedById">;

/** An account ID of an actor that has archived an edition */
export type EditionArchivedById = Brand<AccountId, "EditionArchivedById">;
