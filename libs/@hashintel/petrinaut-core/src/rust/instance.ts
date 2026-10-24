import { mutationActionInputSchemas } from "../action-schemas";
import { withWrittenIdsInErrors } from "../actions";
import { getArcEndpoint } from "../arc-endpoints";
import { createPetrinaut, type Petrinaut } from "../instance";
import { createRustDocHandle } from "./rust-doc-handle";

import type { MutationActionInput } from "../action-schemas";
import type { RustArcTarget } from "./commands";
import type { CreateRustPetrinautOptions } from "./index";

const arcTarget = (input: MutationActionInput<"removeArc">): RustArcTarget => ({
  targetSubnetId: input.targetSubnetId,
  transitionId: input.transitionId,
  arcDirection: input.arcDirection,
  endpoint: getArcEndpoint(input),
});

const nativeUpdate = <Input extends { update: object }>(input: Input) => ({
  ...input,
  unset: Object.entries(input.update)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key),
});

/** The Wasm module must be initialized before constructing an instance. */
export const createRustInstance = (
  options: CreateRustPetrinautOptions,
): Petrinaut => {
  const handle = createRustDocHandle({
    ...options,
    capabilities: {
      ...options.capabilities,
      readonly: options.readonly || options.capabilities?.readonly,
    },
  });
  const instance = createPetrinaut({ document: handle });
  return {
    ...instance,
    mutations: withWrittenIdsInErrors({
      ...instance.mutations,
      addPlace(input) {
        const { targetSubnetId, ...place } =
          mutationActionInputSchemas.addPlace.parse(input);
        handle.execute({ type: "addPlace", input: { targetSubnetId, place } });
      },
      updatePlace(input) {
        handle.execute({
          type: "updatePlace",
          input: nativeUpdate(
            mutationActionInputSchemas.updatePlace.parse(input),
          ),
        });
      },
      removePlace(input) {
        handle.execute({
          type: "removePlace",
          input: mutationActionInputSchemas.removePlace.parse(input),
        });
      },
      addTransition(input) {
        const { targetSubnetId, ...transition } =
          mutationActionInputSchemas.addTransition.parse(input);
        handle.execute({
          type: "addTransition",
          input: { targetSubnetId, transition },
        });
      },
      updateTransition(input) {
        handle.execute({
          type: "updateTransition",
          input: nativeUpdate(
            mutationActionInputSchemas.updateTransition.parse(input),
          ),
        });
      },
      removeTransition(input) {
        handle.execute({
          type: "removeTransition",
          input: mutationActionInputSchemas.removeTransition.parse(input),
        });
      },
      addArc(input) {
        const parsed = mutationActionInputSchemas.addArc.parse(input);
        handle.execute({
          type: "addArc",
          input: {
            target: arcTarget(parsed),
            weight: parsed.weight,
            type: parsed.type,
          },
        });
      },
      removeArc(input) {
        const parsed = mutationActionInputSchemas.removeArc.parse(input);
        handle.execute({ type: "removeArc", input: arcTarget(parsed) });
      },
      updateArcWeight(input) {
        const parsed = mutationActionInputSchemas.updateArcWeight.parse(input);
        handle.execute({
          type: "updateArcWeight",
          input: { target: arcTarget(parsed), weight: parsed.weight },
        });
      },
      updateArcType(input) {
        const parsed = mutationActionInputSchemas.updateArcType.parse(input);
        handle.execute({
          type: "updateArcType",
          input: {
            target: arcTarget({ ...parsed, arcDirection: "input" }),
            type: parsed.type,
          },
        });
      },
      updateArcPlace(input) {
        const parsed = mutationActionInputSchemas.updateArcPlace.parse(input);
        handle.execute({
          type: "updateArcPlace",
          input: {
            target: arcTarget({
              ...parsed,
              endpoint: parsed.oldEndpoint,
              placeId: parsed.oldPlaceId,
            }),
            newEndpoint: getArcEndpoint({
              endpoint: parsed.newEndpoint,
              placeId: parsed.newPlaceId,
            }),
          },
        });
      },
      commitNodePositions(input) {
        handle.execute({
          type: "commitNodePositions",
          input: mutationActionInputSchemas.commitNodePositions.parse(input),
        });
      },
      updatePlacePosition(input) {
        const { placeId, position, targetSubnetId } =
          mutationActionInputSchemas.updatePlacePosition.parse(input);
        handle.execute({
          type: "commitNodePositions",
          input: {
            targetSubnetId,
            commits: [{ id: placeId, itemType: "place", position }],
          },
        });
      },
      updateTransitionPosition(input) {
        const { transitionId, position, targetSubnetId } =
          mutationActionInputSchemas.updateTransitionPosition.parse(input);
        handle.execute({
          type: "commitNodePositions",
          input: {
            targetSubnetId,
            commits: [{ id: transitionId, itemType: "transition", position }],
          },
        });
      },
      updateComponentInstancePosition(input) {
        const { instanceId, position, targetSubnetId } =
          mutationActionInputSchemas.updateComponentInstancePosition.parse(
            input,
          );
        handle.execute({
          type: "commitNodePositions",
          input: {
            targetSubnetId,
            commits: [
              { id: instanceId, itemType: "componentInstance", position },
            ],
          },
        });
      },
    }),
    dispose() {
      instance.dispose();
      handle.dispose();
    },
  };
};
