import { use } from "react";

import { pasteFromClipboard } from "../clipboard/clipboard";
import type { MutateSDCPN, SDCPN } from "../core/types/sdcpn";
import { calculateGraphLayout } from "../lib/calculate-graph-layout";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../views/SDCPN/styles/styling";
import { MutationContext, type MutationContextValue } from "./mutation-context";
import { generateArcId, SDCPNContext } from "./sdcpn-context";
import { useIsReadOnly } from "./use-is-read-only";
import { UserSettingsContext } from "./user-settings-context";

type MutationProviderProps = React.PropsWithChildren<{
  mutatePetriNetDefinition: MutateSDCPN;
}>;

export const MutationProvider: React.FC<MutationProviderProps> = ({
  mutatePetriNetDefinition,
  children,
}) => {
  const { petriNetDefinition, readonly } = use(SDCPNContext);
  const { compactNodes } = use(UserSettingsContext);
  const isReadOnly = useIsReadOnly();

  const dimensions = compactNodes
    ? compactNodeDimensions
    : classicNodeDimensions;

  function guardedMutate(fn: (sdcpn: SDCPN) => void): void {
    if (isReadOnly) {
      return;
    }
    mutatePetriNetDefinition(fn);
  }

  /**
   * Scenario CRUD is allowed even in simulate mode (the Simulate panel is
   * where scenarios are managed). Only true `readonly` blocks them.
   */
  function scenarioMutate(fn: (sdcpn: SDCPN) => void): void {
    if (readonly) {
      return;
    }
    mutatePetriNetDefinition(fn);
  }

  const value: MutationContextValue = {
    addPlace(place) {
      guardedMutate((sdcpn) => {
        sdcpn.places.push(place);
      });
    },
    updatePlace(placeId, updateFn) {
      guardedMutate((sdcpn) => {
        for (const place of sdcpn.places) {
          if (place.id === placeId) {
            updateFn(place);
            break;
          }
        }
      });
    },
    updatePlacePosition(placeId, position) {
      guardedMutate((sdcpn) => {
        for (const place of sdcpn.places) {
          if (place.id === placeId) {
            place.x = position.x;
            place.y = position.y;
            break;
          }
        }
      });
    },
    removePlace(placeId) {
      guardedMutate((sdcpn) => {
        for (const [placeIndex, place] of sdcpn.places.entries()) {
          if (place.id === placeId) {
            sdcpn.places.splice(placeIndex, 1);

            // Iterate backwards to avoid skipping entries when splicing
            for (const transition of sdcpn.transitions) {
              for (let i = transition.inputArcs.length - 1; i >= 0; i--) {
                if (transition.inputArcs[i]!.placeId === placeId) {
                  transition.inputArcs.splice(i, 1);
                }
              }
              for (let i = transition.outputArcs.length - 1; i >= 0; i--) {
                if (transition.outputArcs[i]!.placeId === placeId) {
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
      guardedMutate((sdcpn) => {
        sdcpn.transitions.push(transition);
      });
    },
    updateTransition(transitionId, updateFn) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            updateFn(transition);
            break;
          }
        }
      });
    },
    updateTransitionPosition(transitionId, position) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            transition.x = position.x;
            transition.y = position.y;
            break;
          }
        }
      });
    },
    removeTransition(transitionId) {
      guardedMutate((sdcpn) => {
        for (const [index, transition] of sdcpn.transitions.entries()) {
          if (transition.id === transitionId) {
            sdcpn.transitions.splice(index, 1);
            break;
          }
        }
      });
    },
    addArc(transitionId, arcDirection, placeId, weight) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            if (arcDirection === "input") {
              transition["inputArcs"].push({
                type: "standard",
                placeId,
                weight,
              });
            } else {
              transition["outputArcs"].push({ placeId, weight });
            }
            break;
          }
        }
      });
    },
    removeArc(transitionId, arcDirection, placeId) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            for (const [index, arc] of transition[
              arcDirection === "input" ? "inputArcs" : "outputArcs"
            ].entries()) {
              if (arc.placeId === placeId) {
                transition[
                  arcDirection === "input" ? "inputArcs" : "outputArcs"
                ].splice(index, 1);
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcWeight(transitionId, arcDirection, placeId, weight) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            for (const arc of transition[
              arcDirection === "input" ? "inputArcs" : "outputArcs"
            ]) {
              if (arc.placeId === placeId) {
                arc.weight = weight;
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcType(transitionId, placeId, type) {
      guardedMutate((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            for (const arc of transition["inputArcs"]) {
              if (arc.placeId === placeId) {
                arc.type = type;
                break;
              }
            }
            break;
          }
        }
      });
    },
    addType(type) {
      guardedMutate((sdcpn) => {
        sdcpn.types.push(type);
      });
    },
    updateType(typeId, updateFn) {
      guardedMutate((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === typeId) {
            updateFn(type);
            break;
          }
        }
      });
    },
    removeType(typeId) {
      guardedMutate((sdcpn) => {
        for (const [index, type] of sdcpn.types.entries()) {
          if (type.id === typeId) {
            sdcpn.types.splice(index, 1);
            break;
          }
        }
        // Clear dangling colorId references
        for (const place of sdcpn.places) {
          if (place.colorId === typeId) {
            place.colorId = null;
          }
        }
        for (const equation of sdcpn.differentialEquations) {
          if (equation.colorId === typeId) {
            equation.colorId = "";
          }
        }
      });
    },
    addDifferentialEquation(equation) {
      guardedMutate((sdcpn) => {
        sdcpn.differentialEquations.push(equation);
      });
    },
    updateDifferentialEquation(equationId, updateFn) {
      guardedMutate((sdcpn) => {
        for (const equation of sdcpn.differentialEquations) {
          if (equation.id === equationId) {
            updateFn(equation);
            break;
          }
        }
      });
    },
    removeDifferentialEquation(equationId) {
      guardedMutate((sdcpn) => {
        for (const [index, equation] of sdcpn.differentialEquations.entries()) {
          if (equation.id === equationId) {
            sdcpn.differentialEquations.splice(index, 1);
            break;
          }
        }
        // Clear dangling differentialEquationId references
        for (const place of sdcpn.places) {
          if (place.differentialEquationId === equationId) {
            place.differentialEquationId = null;
          }
        }
      });
    },
    addParameter(parameter) {
      guardedMutate((sdcpn) => {
        sdcpn.parameters.push(parameter);
      });
    },
    updateParameter(parameterId, updateFn) {
      guardedMutate((sdcpn) => {
        for (const parameter of sdcpn.parameters) {
          if (parameter.id === parameterId) {
            updateFn(parameter);
            break;
          }
        }
      });
    },
    removeParameter(parameterId) {
      guardedMutate((sdcpn) => {
        for (const [index, parameter] of sdcpn.parameters.entries()) {
          if (parameter.id === parameterId) {
            sdcpn.parameters.splice(index, 1);
            break;
          }
        }
      });
    },
    addScenario(scenario) {
      scenarioMutate((sdcpn) => {
        const scenarios = sdcpn.scenarios ?? [];
        scenarios.push(scenario);
        // eslint-disable-next-line no-param-reassign -- mutating draft inside immer/structuredClone
        sdcpn.scenarios = scenarios;
      });
    },
    updateScenario(scenarioId, updateFn) {
      scenarioMutate((sdcpn) => {
        for (const scenario of sdcpn.scenarios ?? []) {
          if (scenario.id === scenarioId) {
            updateFn(scenario);
            break;
          }
        }
      });
    },
    removeScenario(scenarioId) {
      scenarioMutate((sdcpn) => {
        const scenarios = sdcpn.scenarios;
        if (!scenarios) {
          return;
        }
        for (const [index, scenario] of scenarios.entries()) {
          if (scenario.id === scenarioId) {
            scenarios.splice(index, 1);
            break;
          }
        }
      });
    },
    deleteItemsByIds(items) {
      guardedMutate((sdcpn) => {
        // Partition selection by type for targeted deletion
        const placeIds = new Set<string>();
        const transitionIds = new Set<string>();
        const arcIds = new Set<string>();
        const typeIds = new Set<string>();
        const equationIds = new Set<string>();
        const parameterIds = new Set<string>();

        for (const [id, item] of items) {
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

        // Transitions need special handling: we always iterate them when places,
        // transitions, or arcs are being deleted, because arcs live inside transitions
        // and deleting a place must cascade to remove its connected arcs.
        const hasCanvasDeletes =
          placeIds.size > 0 || transitionIds.size > 0 || arcIds.size > 0;

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
          // Clear dangling colorId references on places and equations
          for (const place of sdcpn.places) {
            if (place.colorId && typeIds.has(place.colorId)) {
              place.colorId = null;
            }
          }
          for (const equation of sdcpn.differentialEquations) {
            if (typeIds.has(equation.colorId)) {
              equation.colorId = "";
            }
          }
        }

        if (equationIds.size > 0) {
          for (let i = sdcpn.differentialEquations.length - 1; i >= 0; i--) {
            if (equationIds.has(sdcpn.differentialEquations[i]!.id)) {
              sdcpn.differentialEquations.splice(i, 1);
            }
          }
          // Clear dangling differentialEquationId references on places
          for (const place of sdcpn.places) {
            if (
              place.differentialEquationId &&
              equationIds.has(place.differentialEquationId)
            ) {
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
    async layoutGraph() {
      if (isReadOnly) {
        return;
      }

      const sdcpn = petriNetDefinition;

      if (sdcpn.places.length === 0 && sdcpn.transitions.length === 0) {
        return;
      }

      const positions = await calculateGraphLayout(sdcpn, dimensions);

      guardedMutate((sdcpnToMutate) => {
        for (const place of sdcpnToMutate.places) {
          const position = positions[place.id];
          if (position) {
            if (place.x !== position.x) {
              place.x = position.x;
            }
            if (place.y !== position.y) {
              place.y = position.y;
            }
          }
        }

        for (const transition of sdcpnToMutate.transitions) {
          const position = positions[transition.id];
          if (position) {
            if (transition.x !== position.x) {
              transition.x = position.x;
            }
            if (transition.y !== position.y) {
              transition.y = position.y;
            }
          }
        }
      });
    },
    async pasteEntities() {
      if (isReadOnly) {
        return null;
      }
      return pasteFromClipboard(mutatePetriNetDefinition);
    },
    commitNodePositions(commits) {
      guardedMutate((sdcpn) => {
        for (const { id, itemType, position } of commits) {
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

  return (
    <MutationContext.Provider value={value}>
      {children}
    </MutationContext.Provider>
  );
};
