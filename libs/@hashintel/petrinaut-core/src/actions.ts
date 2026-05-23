import {
  colorSchema,
  differentialEquationSchema,
  metricSchema,
  parameterSchema,
  mutationActionInputSchemas,
  placeSchema,
  scenarioSchema,
  transitionSchema,
  type MutationActionInput,
} from "./action-schemas";
import { generateArcId } from "./arc-id";

import type { SDCPN } from "./types/sdcpn";

export type MutationHelperFunctions = {
  [Name in keyof typeof mutationActionInputSchemas]: (input: MutationActionInput<Name>) => void;
};

export function createPetrinautActions(
  mutate: (fn: (sdcpn: SDCPN) => void) => void,
): MutationHelperFunctions {
  return {
    addPlace(place) {
      const parsedPlace = placeSchema.parse(place);
      mutate((sdcpn) => {
        sdcpn.places.push(parsedPlace);
      });
    },
    updatePlace(input) {
      const parsed = mutationActionInputSchemas.updatePlace.parse(input);
      mutate((sdcpn) => {
        for (const place of sdcpn.places) {
          if (place.id === parsed.placeId) {
            Object.assign(place, parsed.update);
            placeSchema.parse(place);
            break;
          }
        }
      });
    },
    updatePlacePosition(input) {
      const parsed = mutationActionInputSchemas.updatePlacePosition.parse(input);
      mutate((sdcpn) => {
        for (const place of sdcpn.places) {
          if (place.id === parsed.placeId) {
            place.x = parsed.position.x;
            place.y = parsed.position.y;
            break;
          }
        }
      });
    },
    removePlace(input) {
      const { placeId: parsedPlaceId } = mutationActionInputSchemas.removePlace.parse(input);
      mutate((sdcpn) => {
        for (const [placeIndex, place] of sdcpn.places.entries()) {
          if (place.id === parsedPlaceId) {
            sdcpn.places.splice(placeIndex, 1);

            for (const transition of sdcpn.transitions) {
              for (let i = transition.inputArcs.length - 1; i >= 0; i--) {
                if (transition.inputArcs[i]!.placeId === parsedPlaceId) {
                  transition.inputArcs.splice(i, 1);
                }
              }
              for (let i = transition.outputArcs.length - 1; i >= 0; i--) {
                if (transition.outputArcs[i]!.placeId === parsedPlaceId) {
                  transition.outputArcs.splice(i, 1);
                }
              }
            }
            break;
          }
        }
      });
    },
    addTransition(transition) {
      const parsedTransition = transitionSchema.parse(transition);
      mutate((sdcpn) => {
        sdcpn.transitions.push(parsedTransition);
      });
    },
    updateTransition(input) {
      const parsed = mutationActionInputSchemas.updateTransition.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            Object.assign(transition, parsed.update);
            transitionSchema.parse(transition);
            break;
          }
        }
      });
    },
    updateTransitionPosition(input) {
      const parsed = mutationActionInputSchemas.updateTransitionPosition.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            transition.x = parsed.position.x;
            transition.y = parsed.position.y;
            break;
          }
        }
      });
    },
    removeTransition(input) {
      const { transitionId: parsedTransitionId } =
        mutationActionInputSchemas.removeTransition.parse(input);
      mutate((sdcpn) => {
        for (const [index, transition] of sdcpn.transitions.entries()) {
          if (transition.id === parsedTransitionId) {
            sdcpn.transitions.splice(index, 1);
            break;
          }
        }
      });
    },
    addArc(input) {
      const parsed = mutationActionInputSchemas.addArc.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            if (parsed.arcDirection === "input") {
              transition.inputArcs.push({
                type: "standard",
                placeId: parsed.placeId,
                weight: parsed.weight,
              });
            } else {
              transition.outputArcs.push({
                placeId: parsed.placeId,
                weight: parsed.weight,
              });
            }
            break;
          }
        }
      });
    },
    removeArc(input) {
      const parsed = mutationActionInputSchemas.removeArc.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            for (const [index, arc] of transition[
              parsed.arcDirection === "input" ? "inputArcs" : "outputArcs"
            ].entries()) {
              if (arc.placeId === parsed.placeId) {
                transition[parsed.arcDirection === "input" ? "inputArcs" : "outputArcs"].splice(
                  index,
                  1,
                );
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcWeight(input) {
      const parsed = mutationActionInputSchemas.updateArcWeight.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            for (const arc of transition[
              parsed.arcDirection === "input" ? "inputArcs" : "outputArcs"
            ]) {
              if (arc.placeId === parsed.placeId) {
                arc.weight = parsed.weight;
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcType(input) {
      const parsed = mutationActionInputSchemas.updateArcType.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            for (const arc of transition.inputArcs) {
              if (arc.placeId === parsed.placeId) {
                arc.type = parsed.type;
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcPlace(input) {
      const parsed = mutationActionInputSchemas.updateArcPlace.parse(input);
      mutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === parsed.transitionId) {
            for (const arc of transition[
              parsed.arcDirection === "input" ? "inputArcs" : "outputArcs"
            ]) {
              if (arc.placeId === parsed.oldPlaceId) {
                arc.placeId = parsed.newPlaceId;
                break;
              }
            }
            break;
          }
        }
      });
    },
    addType(type) {
      const parsedType = colorSchema.parse(type);
      mutate((sdcpn) => {
        sdcpn.types.push(parsedType);
      });
    },
    updateType(input) {
      const parsed = mutationActionInputSchemas.updateType.parse(input);
      mutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === parsed.typeId) {
            Object.assign(type, parsed.update);
            colorSchema.parse(type);
            break;
          }
        }
      });
    },
    addTypeElement(input) {
      const parsed = mutationActionInputSchemas.addTypeElement.parse(input);
      mutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === parsed.typeId) {
            type.elements.push(parsed.element);
            colorSchema.parse(type);
            break;
          }
        }
      });
    },
    updateTypeElement(input) {
      const parsed = mutationActionInputSchemas.updateTypeElement.parse(input);
      mutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === parsed.typeId) {
            for (const element of type.elements) {
              if (element.elementId === parsed.elementId) {
                Object.assign(element, parsed.update);
                colorSchema.parse(type);
                break;
              }
            }
            break;
          }
        }
      });
    },
    removeTypeElement(input) {
      const parsed = mutationActionInputSchemas.removeTypeElement.parse(input);
      mutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === parsed.typeId) {
            for (const [index, element] of type.elements.entries()) {
              if (element.elementId === parsed.elementId) {
                type.elements.splice(index, 1);
                colorSchema.parse(type);
                break;
              }
            }
            break;
          }
        }
      });
    },
    moveTypeElement(input) {
      const parsed = mutationActionInputSchemas.moveTypeElement.parse(input);
      mutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === parsed.typeId) {
            const fromIndex = type.elements.findIndex(
              (element) => element.elementId === parsed.elementId,
            );
            if (fromIndex === -1) {
              break;
            }
            const [element] = type.elements.splice(fromIndex, 1);
            if (element) {
              type.elements.splice(parsed.toIndex, 0, element);
              colorSchema.parse(type);
            }
            break;
          }
        }
      });
    },
    removeType(input) {
      const { typeId: parsedTypeId } = mutationActionInputSchemas.removeType.parse(input);
      mutate((sdcpn) => {
        for (const [index, type] of sdcpn.types.entries()) {
          if (type.id === parsedTypeId) {
            sdcpn.types.splice(index, 1);
            break;
          }
        }
        for (const place of sdcpn.places) {
          if (place.colorId === parsedTypeId) {
            place.colorId = null;
          }
        }
        for (const equation of sdcpn.differentialEquations) {
          if (equation.colorId === parsedTypeId) {
            equation.colorId = null;
          }
        }
      });
    },
    addDifferentialEquation(equation) {
      const parsedEquation = differentialEquationSchema.parse(equation);
      mutate((sdcpn) => {
        sdcpn.differentialEquations.push(parsedEquation);
      });
    },
    updateDifferentialEquation(input) {
      const parsed = mutationActionInputSchemas.updateDifferentialEquation.parse(input);
      mutate((sdcpn) => {
        for (const equation of sdcpn.differentialEquations) {
          if (equation.id === parsed.equationId) {
            Object.assign(equation, parsed.update);
            differentialEquationSchema.parse(equation);
            break;
          }
        }
      });
    },
    removeDifferentialEquation(input) {
      const { equationId: parsedEquationId } =
        mutationActionInputSchemas.removeDifferentialEquation.parse({
          ...input,
        });
      mutate((sdcpn) => {
        for (const [index, equation] of sdcpn.differentialEquations.entries()) {
          if (equation.id === parsedEquationId) {
            sdcpn.differentialEquations.splice(index, 1);
            break;
          }
        }
        for (const place of sdcpn.places) {
          if (place.differentialEquationId === parsedEquationId) {
            place.differentialEquationId = null;
          }
        }
      });
    },
    addParameter(parameter) {
      const parsedParameter = parameterSchema.parse(parameter);
      mutate((sdcpn) => {
        sdcpn.parameters.push(parsedParameter);
      });
    },
    updateParameter(input) {
      const parsed = mutationActionInputSchemas.updateParameter.parse(input);
      mutate((sdcpn) => {
        for (const parameter of sdcpn.parameters) {
          if (parameter.id === parsed.parameterId) {
            Object.assign(parameter, parsed.update);
            parameterSchema.parse(parameter);
            break;
          }
        }
      });
    },
    removeParameter(input) {
      const { parameterId: parsedParameterId } =
        mutationActionInputSchemas.removeParameter.parse(input);
      mutate((sdcpn) => {
        for (const [index, parameter] of sdcpn.parameters.entries()) {
          if (parameter.id === parsedParameterId) {
            sdcpn.parameters.splice(index, 1);
            break;
          }
        }
      });
    },
    addScenario(scenario) {
      const parsedScenario = scenarioSchema.parse(scenario);
      mutate((sdcpn) => {
        const scenarios = sdcpn.scenarios ?? [];
        scenarios.push(parsedScenario);
        // eslint-disable-next-line no-param-reassign -- mutating draft inside immer/structuredClone
        sdcpn.scenarios = scenarios;
      });
    },
    updateScenario(input) {
      const parsed = mutationActionInputSchemas.updateScenario.parse(input);
      mutate((sdcpn) => {
        for (const scenario of sdcpn.scenarios ?? []) {
          if (scenario.id === parsed.scenarioId) {
            Object.assign(scenario, parsed.update);
            scenarioSchema.parse(scenario);
            break;
          }
        }
      });
    },
    removeScenario(input) {
      const { scenarioId: parsedScenarioId } =
        mutationActionInputSchemas.removeScenario.parse(input);
      mutate((sdcpn) => {
        const scenarios = sdcpn.scenarios;
        if (!scenarios) {
          return;
        }
        for (const [index, scenario] of scenarios.entries()) {
          if (scenario.id === parsedScenarioId) {
            scenarios.splice(index, 1);
            break;
          }
        }
      });
    },
    addMetric(metric) {
      const parsedMetric = metricSchema.parse(metric);
      mutate((sdcpn) => {
        const metrics = sdcpn.metrics ?? [];
        metrics.push(parsedMetric);
        // eslint-disable-next-line no-param-reassign -- mutating draft inside immer/structuredClone
        sdcpn.metrics = metrics;
      });
    },
    updateMetric(input) {
      const parsed = mutationActionInputSchemas.updateMetric.parse(input);
      mutate((sdcpn) => {
        for (const metric of sdcpn.metrics ?? []) {
          if (metric.id === parsed.metricId) {
            Object.assign(metric, parsed.update);
            metricSchema.parse(metric);
            break;
          }
        }
      });
    },
    removeMetric(input) {
      const { metricId: parsedMetricId } = mutationActionInputSchemas.removeMetric.parse(input);
      mutate((sdcpn) => {
        const metrics = sdcpn.metrics;
        if (!metrics) {
          return;
        }
        for (const [index, metric] of metrics.entries()) {
          if (metric.id === parsedMetricId) {
            metrics.splice(index, 1);
            break;
          }
        }
      });
    },
    deleteItemsByIds(input) {
      const parsedItems = mutationActionInputSchemas.deleteItemsByIds.parse(input).items;
      mutate((sdcpn) => {
        const placeIds = new Set<string>();
        const transitionIds = new Set<string>();
        const arcIds = new Set<string>();
        const typeIds = new Set<string>();
        const equationIds = new Set<string>();
        const parameterIds = new Set<string>();

        for (const item of parsedItems) {
          const { id } = item;
          switch (item.type) {
            case "place":
              placeIds.add(id);
              break;
            case "transition":
              transitionIds.add(id);
              break;
            case "arc":
              arcIds.add(id);
              break;
            case "type":
              typeIds.add(id);
              break;
            case "differentialEquation":
              equationIds.add(id);
              break;
            case "parameter":
              parameterIds.add(id);
              break;
          }
        }

        const hasCanvasDeletes = placeIds.size > 0 || transitionIds.size > 0 || arcIds.size > 0;

        if (hasCanvasDeletes) {
          for (let i = sdcpn.transitions.length - 1; i >= 0; i--) {
            const transition = sdcpn.transitions[i]!;
            if (transitionIds.has(transition.id)) {
              sdcpn.transitions.splice(i, 1);
              continue;
            }

            for (
              let inputArcIndex = transition.inputArcs.length - 1;
              inputArcIndex >= 0;
              inputArcIndex--
            ) {
              const inputArc = transition.inputArcs[inputArcIndex]!;
              const arcId = generateArcId({
                inputId: inputArc.placeId,
                outputId: transition.id,
              });

              if (arcIds.has(arcId) || placeIds.has(inputArc.placeId)) {
                transition.inputArcs.splice(inputArcIndex, 1);
              }
            }

            for (
              let outputArcIndex = transition.outputArcs.length - 1;
              outputArcIndex >= 0;
              outputArcIndex--
            ) {
              const outputArc = transition.outputArcs[outputArcIndex]!;
              const arcId = generateArcId({
                inputId: transition.id,
                outputId: outputArc.placeId,
              });

              if (arcIds.has(arcId) || placeIds.has(outputArc.placeId)) {
                transition.outputArcs.splice(outputArcIndex, 1);
              }
            }
          }

          for (let i = sdcpn.places.length - 1; i >= 0; i--) {
            if (placeIds.has(sdcpn.places[i]!.id)) {
              sdcpn.places.splice(i, 1);
            }
          }
        }

        if (typeIds.size > 0) {
          for (let i = sdcpn.types.length - 1; i >= 0; i--) {
            if (typeIds.has(sdcpn.types[i]!.id)) {
              sdcpn.types.splice(i, 1);
            }
          }
          for (const place of sdcpn.places) {
            if (place.colorId && typeIds.has(place.colorId)) {
              place.colorId = null;
            }
          }
          for (const equation of sdcpn.differentialEquations) {
            if (equation.colorId && typeIds.has(equation.colorId)) {
              equation.colorId = null;
            }
          }
        }

        if (equationIds.size > 0) {
          for (let i = sdcpn.differentialEquations.length - 1; i >= 0; i--) {
            if (equationIds.has(sdcpn.differentialEquations[i]!.id)) {
              sdcpn.differentialEquations.splice(i, 1);
            }
          }
          for (const place of sdcpn.places) {
            if (place.differentialEquationId && equationIds.has(place.differentialEquationId)) {
              place.differentialEquationId = null;
            }
          }
        }

        if (parameterIds.size > 0) {
          for (let i = sdcpn.parameters.length - 1; i >= 0; i--) {
            if (parameterIds.has(sdcpn.parameters[i]!.id)) {
              sdcpn.parameters.splice(i, 1);
            }
          }
        }
      });
    },
    commitNodePositions(input) {
      const { commits: parsedCommits } =
        mutationActionInputSchemas.commitNodePositions.parse(input);
      mutate((sdcpn) => {
        for (const { id, itemType, position } of parsedCommits) {
          if (itemType === "place") {
            for (const place of sdcpn.places) {
              if (place.id === id) {
                place.x = position.x;
                place.y = position.y;
                break;
              }
            }
          } else {
            for (const transition of sdcpn.transitions) {
              if (transition.id === id) {
                transition.x = position.x;
                transition.y = position.y;
                break;
              }
            }
          }
        }
      });
    },
  };
}
