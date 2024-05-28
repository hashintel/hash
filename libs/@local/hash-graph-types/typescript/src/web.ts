import type { Brand } from "@local/advanced-types/brand";

import type { AccountGroupId, AccountId } from "./account";

/** An account ID of an actor that is the owner of something */
export type OwnedById = Brand<AccountId | AccountGroupId, "OwnedById">;
