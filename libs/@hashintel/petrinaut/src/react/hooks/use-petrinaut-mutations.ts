import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { ActiveNetContext } from "../state/active-net-context";
import {
  mutationBlockedBy,
  useReadOnlyReason,
} from "../state/use-read-only-reason";
import { useHostRulesFeedback } from "./use-host-rules-feedback";
import { useReadOnlyFeedback } from "./use-read-only-feedback";

import type { PetrinautMutations } from "@hashintel/petrinaut-core";

type PetrinautMutationInput<Name extends keyof PetrinautMutations> = Parameters<
  PetrinautMutations[Name]
>[0];

/**
 * The mutations as the editor calls them. Each answers whether it went to
 * Core: `false` when the editor is read-only or the host's rules refuse it,
 * for a caller with something to do only once the change is made.
 */
export type GuardedPetrinautMutations = {
  [Name in keyof PetrinautMutations]: (
    input: PetrinautMutationInput<Name>,
  ) => boolean;
};

/** The mutations of the document as a whole. The others act on the open net. */
const documentWideMutations: ReadonlySet<keyof PetrinautMutations> = new Set([
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addMetric",
  "updateMetric",
  "removeMetric",
  "addComponent",
  "updateComponent",
  "removeComponent",
  "setImplementation",
]);

/**
 * React-facing bundle of atomic SDCPN mutations.
 *
 * Each helper is wrapped so that:
 *
 * - It shows the read-only notice and does nothing while
 *   {@link mutationBlockedBy} names a reason, the rule the AI
 *   tool dispatcher applies too: scenario and metric mutations stay
 *   available in simulate mode, where the Simulate panel manages them.
 * - It shows the sentence and does nothing where the host's rules refuse the
 *   mutation, which Core itself would throw.
 *
 * Components MUST NOT reach for `usePetrinautInstance().mutations` directly;
 * the public `usePetrinautInstance()` return type narrows away the mutation
 * surface to keep the readonly guard centralised in this hook.
 */
export function usePetrinautMutations(): GuardedPetrinautMutations {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "usePetrinautMutations must be used inside <PetrinautProvider> (or <Petrinaut>).",
    );
  }
  const { activeComponentId } = use(ActiveNetContext);
  const readOnlyReason = useReadOnlyReason();
  const notifyReadOnly = useReadOnlyFeedback();
  const notifyHostRules = useHostRulesFeedback();
  const { mutations } = instance;

  const guarded = <Name extends keyof PetrinautMutations>(
    name: Name,
  ): GuardedPetrinautMutations[Name] => {
    const target = mutations[name] as (
      input: PetrinautMutationInput<Name>,
    ) => void;
    return ((input: PetrinautMutationInput<Name>) => {
      if (mutationBlockedBy(name, readOnlyReason, input) !== null) {
        notifyReadOnly();
        return false;
      }
      const nextInput = documentWideMutations.has(name)
        ? input
        : ({
            ...input,
            targetComponentId: activeComponentId,
          } as PetrinautMutationInput<Name>);
      // Asked of the input as it goes out, with the net it targets.
      const refusal = instance.mutationRefusal(name, nextInput);
      if (refusal !== null) {
        notifyHostRules(refusal);
        return false;
      }
      target(nextInput);
      return true;
    }) as GuardedPetrinautMutations[Name];
  };

  return Object.fromEntries(
    (Object.keys(mutations) as (keyof PetrinautMutations)[]).map((name) => [
      name,
      guarded(name),
    ]),
  ) as GuardedPetrinautMutations;
}
