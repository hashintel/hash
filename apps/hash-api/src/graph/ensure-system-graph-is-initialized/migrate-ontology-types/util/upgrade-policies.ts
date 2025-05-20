import type { ActorEntityUuid } from "@blockprotocol/type-system";
import {
  createPolicy,
  deletePolicyById,
  queryPolicies,
} from "@local/hash-graph-sdk/policy";
import type {
  PolicyCreationParams,
  PrincipalConstraint,
} from "@rust/hash-graph-authorization/types";

import type { ImpureGraphContext } from "../../../context-types";

export type NamedPartialPolicy = Omit<
  PolicyCreationParams,
  "principal" | "name"
> & {
  name: string;
};

export const createOrUpgradePolicies = async ({
  authentication,
  context,
  policies,
  principal,
}: {
  authentication: { actorId: ActorEntityUuid };
  context: ImpureGraphContext<false, true>;
  policies: NamedPartialPolicy[];
  principal: PrincipalConstraint | null;
}) =>
  Promise.all(
    policies.map(async (policy) => {
      const [existingPolicy] = await queryPolicies(
        context.graphApi,
        authentication,
        {
          name: policy.name,
          principal: principal
            ? { filter: "constrained", ...principal }
            : { filter: "unconstrained" },
        },
      );

      if (existingPolicy) {
        // TODO: Properly update the policy to match the new one
        await deletePolicyById(
          context.graphApi,
          authentication,
          existingPolicy.id,
        );
      }

      await createPolicy(context.graphApi, authentication, {
        ...policy,
        principal,
      });
    }),
  );
