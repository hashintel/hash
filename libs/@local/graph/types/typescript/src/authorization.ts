import type { AccountGroupId, AccountId } from "./account.js";

/** An ID to uniquely identify an authorization subject (either a User or an Org) */
export type AuthorizationSubjectId = AccountId | AccountGroupId;
