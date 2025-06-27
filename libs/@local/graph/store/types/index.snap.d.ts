// This file was generated from `libs/@local/graph/store/tests/codegen.rs`

import type { ActionName, Effect, PrincipalConstraint } from "@rust/hash-graph-authorization/types";
export interface CreateEntityPolicyParams {
	name: string;
	effect: Effect;
	principal: (PrincipalConstraint | null);
	actions: ActionName[];
}
