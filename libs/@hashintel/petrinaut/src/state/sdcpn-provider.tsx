import { use } from "react";

import { calculateGraphLayout } from "../lib/calculate-graph-layout";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../views/SDCPN/styles/styling";
import {
  ARC_ID_PREFIX,
  generateArcId,
  SDCPNContext,
  type SDCPNContextValue,
  type SDCPNProviderProps,
} from "./sdcpn-context";
import { UserSettingsContext } from "./user-settings-context";

export const SDCPNProvider: React.FC<SDCPNProviderProps> = ({
  children,
  ...rest
}: React.PropsWithChildren<SDCPNProviderProps>) => {
  const { compactNodes } = use(UserSettingsContext);
  const dimensions = compactNodes
    ? compactNodeDimensions
    : classicNodeDimensions;
  const value: SDCPNContextValue = {
    ...rest,
    addPlace(place) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        sdcpn.places.push(place);
      });
    },
    updatePlace(placeId, updateFn) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const place of sdcpn.places) {
          if (place.id === placeId) {
            updateFn(place);
            break;
          }
        }
      });
    },
    updatePlacePosition(placeId, position) {
      rest.mutatePetriNetDefinition((sdcpn) => {
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
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const [placeIndex, place] of sdcpn.places.entries()) {
          if (place.id === placeId) {
            sdcpn.places.splice(placeIndex, 1);

            for (const transition of sdcpn.transitions) {
              for (const [
                inputArcIndex,
                inputArc,
              ] of transition.inputArcs.entries()) {
                if (inputArc.placeId === placeId) {
                  transition.inputArcs.splice(inputArcIndex, 1);
                }
              }
            }

            for (const transition of sdcpn.transitions) {
              for (const [
                outputArcIndex,
                outputArc,
              ] of transition.outputArcs.entries()) {
                if (outputArc.placeId === placeId) {
                  transition.outputArcs.splice(outputArcIndex, 1);
                }
              }
            }
            break;
          }
        }
      });
    },
    addTransition(transition) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        sdcpn.transitions.push(transition);
      });
    },
    updateTransition(transitionId, updateFn) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            updateFn(transition);
            break;
          }
        }
      });
    },
    updateTransitionPosition(transitionId, position) {
      rest.mutatePetriNetDefinition((sdcpn) => {
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
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const [index, transition] of sdcpn.transitions.entries()) {
          if (transition.id === transitionId) {
            sdcpn.transitions.splice(index, 1);
            break;
          }
        }
      });
    },
    addArc(transitionId, arcType, placeId, weight) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            transition[arcType === "input" ? "inputArcs" : "outputArcs"].push({
              placeId,
              weight,
            });
            break;
          }
        }
      });
    },
    removeArc(transitionId, arcType, placeId) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            for (const [index, arc] of transition[
              arcType === "input" ? "inputArcs" : "outputArcs"
            ].entries()) {
              if (arc.placeId === placeId) {
                transition[
                  arcType === "input" ? "inputArcs" : "outputArcs"
                ].splice(index, 1);
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcWeight(transitionId, arcType, placeId, weight) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const transition of sdcpn.transitions) {
          if (transition.id === transitionId) {
            for (const arc of transition[
              arcType === "input" ? "inputArcs" : "outputArcs"
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
    addType(type) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        sdcpn.types.push(type);
      });
    },
    updateType(typeId, updateFn) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const type of sdcpn.types) {
          if (type.id === typeId) {
            updateFn(type);
            break;
          }
        }
      });
    },
    removeType(typeId) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const [index, type] of sdcpn.types.entries()) {
          if (type.id === typeId) {
            sdcpn.types.splice(index, 1);
            break;
          }
        }
      });
    },
    addDifferentialEquation(equation) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        sdcpn.differentialEquations.push(equation);
      });
    },
    updateDifferentialEquation(equationId, updateFn) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const equation of sdcpn.differentialEquations) {
          if (equation.id === equationId) {
            updateFn(equation);
            break;
          }
        }
      });
    },
    removeDifferentialEquation(equationId) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const [index, equation] of sdcpn.differentialEquations.entries()) {
          if (equation.id === equationId) {
            sdcpn.differentialEquations.splice(index, 1);
            break;
          }
        }
      });
    },
    addParameter(parameter) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        sdcpn.parameters.push(parameter);
      });
    },
    updateParameter(parameterId, updateFn) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const parameter of sdcpn.parameters) {
          if (parameter.id === parameterId) {
            updateFn(parameter);
            break;
          }
        }
      });
    },
    removeParameter(parameterId) {
      rest.mutatePetriNetDefinition((sdcpn) => {
        for (const [index, parameter] of sdcpn.parameters.entries()) {
          if (parameter.id === parameterId) {
            sdcpn.parameters.splice(index, 1);
            break;
          }
        }
      });
    },
    getItemType(id) {
      const sdcpn = rest.petriNetDefinition;

      // TODO: Selection and elements IDs should be reworked
      if (id.startsWith(ARC_ID_PREFIX)) {
        return "arc";
      }

      if (sdcpn.types.some((type) => type.id === id)) {
        return "type";
      }

      if (sdcpn.parameters.some((parameter) => parameter.id === id)) {
        return "parameter";
      }

      if (sdcpn.differentialEquations.some((equation) => equation.id === id)) {
        return "differentialEquation";
      }

      if (sdcpn.places.some((place) => place.id === id)) {
        return "place";
      }

      if (sdcpn.transitions.some((transition) => transition.id === id)) {
        return "transition";
      }

      return null;
    },
    deleteItemsByIds(items) {
      rest.mutatePetriNetDefinition((sdcpn) => {
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
        }

        if (equationIds.size > 0) {
          for (let i = sdcpn.differentialEquations.length - 1; i >= 0; i--) {
            if (equationIds.has(sdcpn.differentialEquations[i]!.id)) {
              sdcpn.differentialEquations.splice(i, 1);
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
      const sdcpn = rest.petriNetDefinition;

      if (sdcpn.places.length === 0 && sdcpn.transitions.length === 0) {
        return;
      }

      const positions = await calculateGraphLayout(sdcpn, dimensions);

      rest.mutatePetriNetDefinition((sdcpnToMutate) => {
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
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
