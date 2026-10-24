import { mutationActionInputSchemas } from "../action-schemas";
import { withWrittenIdsInErrors } from "../actions";
import { createPetrinaut, type Petrinaut } from "../instance";
import { createRustDocHandle } from "./rust-doc-handle";

import type { CreateRustPetrinautOptions } from "./index";

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
          input: mutationActionInputSchemas.updatePlace.parse(input),
        });
      },
      removePlace(input) {
        handle.execute({
          type: "removePlace",
          input: mutationActionInputSchemas.removePlace.parse(input),
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
