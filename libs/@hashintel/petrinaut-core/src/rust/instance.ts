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
      addSubnet(input) {
        handle.execute({
          type: "addSubnet",
          input: { entity: mutationActionInputSchemas.addSubnet.parse(input) },
        });
      },
      updateSubnet(input) {
        const parsed = mutationActionInputSchemas.updateSubnet.parse(input);
        handle.execute({
          type: "updateSubnet",
          input: {
            target: { id: parsed.subnetId },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeSubnet(input) {
        const parsed = mutationActionInputSchemas.removeSubnet.parse(input);
        handle.execute({
          type: "removeSubnet",
          input: { id: parsed.subnetId },
        });
      },
      addComponentInstance(input) {
        const { targetSubnetId, ...entity } =
          mutationActionInputSchemas.addComponentInstance.parse(input);
        handle.execute({
          type: "addComponentInstance",
          input: { targetSubnetId, entity },
        });
      },
      updateComponentInstance(input) {
        const parsed =
          mutationActionInputSchemas.updateComponentInstance.parse(input);
        handle.execute({
          type: "updateComponentInstance",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.instanceId,
            },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeComponentInstance(input) {
        const parsed =
          mutationActionInputSchemas.removeComponentInstance.parse(input);
        handle.execute({
          type: "removeComponentInstance",
          input: {
            targetSubnetId: parsed.targetSubnetId,
            id: parsed.instanceId,
          },
        });
      },
      deleteItemsByIds(input) {
        handle.execute({
          type: "deleteItemsByIds",
          input: mutationActionInputSchemas.deleteItemsByIds.parse(input),
        });
      },
      addType(input) {
        const { targetSubnetId, ...entity } =
          mutationActionInputSchemas.addType.parse(input);
        handle.execute({ type: "addType", input: { targetSubnetId, entity } });
      },
      updateType(input) {
        const parsed = mutationActionInputSchemas.updateType.parse(input);
        handle.execute({
          type: "updateType",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.typeId,
            },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeType(input) {
        const parsed = mutationActionInputSchemas.removeType.parse(input);
        handle.execute({
          type: "removeType",
          input: { targetSubnetId: parsed.targetSubnetId, id: parsed.typeId },
        });
      },
      addDifferentialEquation(input) {
        const { targetSubnetId, ...entity } =
          mutationActionInputSchemas.addDifferentialEquation.parse(input);
        handle.execute({
          type: "addDifferentialEquation",
          input: { targetSubnetId, entity },
        });
      },
      updateDifferentialEquation(input) {
        const parsed =
          mutationActionInputSchemas.updateDifferentialEquation.parse(input);
        handle.execute({
          type: "updateDifferentialEquation",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.equationId,
            },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeDifferentialEquation(input) {
        const parsed =
          mutationActionInputSchemas.removeDifferentialEquation.parse(input);
        handle.execute({
          type: "removeDifferentialEquation",
          input: {
            targetSubnetId: parsed.targetSubnetId,
            id: parsed.equationId,
          },
        });
      },
      addParameter(input) {
        const { targetSubnetId, ...entity } =
          mutationActionInputSchemas.addParameter.parse(input);
        handle.execute({
          type: "addParameter",
          input: { targetSubnetId, entity },
        });
      },
      updateParameter(input) {
        const parsed = mutationActionInputSchemas.updateParameter.parse(input);
        handle.execute({
          type: "updateParameter",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.parameterId,
            },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeParameter(input) {
        const parsed = mutationActionInputSchemas.removeParameter.parse(input);
        handle.execute({
          type: "removeParameter",
          input: {
            targetSubnetId: parsed.targetSubnetId,
            id: parsed.parameterId,
          },
        });
      },
      addScenario(input) {
        const entity = mutationActionInputSchemas.addScenario.parse(input);
        handle.execute({ type: "addScenario", input: { entity } });
      },
      updateScenario(input) {
        const parsed = mutationActionInputSchemas.updateScenario.parse(input);
        handle.execute({
          type: "updateScenario",
          input: {
            target: { id: parsed.scenarioId },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeScenario(input) {
        const parsed = mutationActionInputSchemas.removeScenario.parse(input);
        handle.execute({
          type: "removeScenario",
          input: { id: parsed.scenarioId },
        });
      },
      addMetric(input) {
        const entity = mutationActionInputSchemas.addMetric.parse(input);
        handle.execute({ type: "addMetric", input: { entity } });
      },
      updateMetric(input) {
        const parsed = mutationActionInputSchemas.updateMetric.parse(input);
        handle.execute({
          type: "updateMetric",
          input: {
            target: { id: parsed.metricId },
            ...nativeUpdate({ update: parsed.update }),
          },
        });
      },
      removeMetric(input) {
        const parsed = mutationActionInputSchemas.removeMetric.parse(input);
        handle.execute({
          type: "removeMetric",
          input: { id: parsed.metricId },
        });
      },
      addTypeElement(input) {
        const parsed = mutationActionInputSchemas.addTypeElement.parse(input);
        handle.execute({
          type: "editTypeElements",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.typeId,
            },
            edit: { kind: "add", element: parsed.element },
          },
        });
      },
      updateTypeElement(input) {
        const parsed =
          mutationActionInputSchemas.updateTypeElement.parse(input);
        handle.execute({
          type: "editTypeElements",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.typeId,
            },
            edit: {
              kind: "update",
              elementId: parsed.elementId,
              ...nativeUpdate({ update: parsed.update }),
            },
          },
        });
      },
      removeTypeElement(input) {
        const parsed =
          mutationActionInputSchemas.removeTypeElement.parse(input);
        handle.execute({
          type: "editTypeElements",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.typeId,
            },
            edit: { kind: "remove", elementId: parsed.elementId },
          },
        });
      },
      moveTypeElement(input) {
        const parsed = mutationActionInputSchemas.moveTypeElement.parse(input);
        handle.execute({
          type: "editTypeElements",
          input: {
            target: {
              targetSubnetId: parsed.targetSubnetId,
              id: parsed.typeId,
            },
            edit: {
              kind: "move",
              elementId: parsed.elementId,
              toIndex: parsed.toIndex,
            },
          },
        });
      },
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
