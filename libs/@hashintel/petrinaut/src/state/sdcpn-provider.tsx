import { createContext, useContext, useMemo } from "react";

import type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../core/types/sdcpn";
import { calculateGraphLayout } from "../lib/calculate-graph-layout";

type SDCPNProviderProps = {
  createNewNet: (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => void;
  existingNets: MinimalNetMetadata[];
  loadPetriNet: (petriNetId: string) => void;
  petriNetId: string | null;
  petriNetDefinition: SDCPN;
  readonly: boolean;
  mutatePetriNetDefinition: MutateSDCPN;
  setTitle: (title: string) => void;
  title: string;
};

type MutationHelperFunctions = {
  addPlace: (place: Place) => void;
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
  updatePlacePosition: (
    placeId: string,
    position: { x: number; y: number },
  ) => void;
  removePlace: (placeId: string) => void;
  addTransition: (transition: Transition) => void;
  updateTransition: (
    transitionId: string,
    updateFn: (transition: Transition) => void,
  ) => void;
  updateTransitionPosition: (
    transitionId: string,
    position: { x: number; y: number },
  ) => void;
  removeTransition: (transitionId: string) => void;
  addArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
  removeArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
  ) => void;
  updateArcWeight: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
  addType: (type: Color) => void;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
  removeType: (typeId: string) => void;
  addDifferentialEquation: (equation: DifferentialEquation) => void;
  updateDifferentialEquation: (
    equationId: string,
    updateFn: (equation: DifferentialEquation) => void,
  ) => void;
  removeDifferentialEquation: (equationId: string) => void;
  addParameter: (parameter: Parameter) => void;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
  removeParameter: (parameterId: string) => void;
  getItemType: (
    id: string,
  ) =>
    | "place"
    | "transition"
    | "arc"
    | "type"
    | "differentialEquation"
    | "parameter"
    | null;
  deleteItemsByIds: (ids: Set<string>) => void;
  layoutGraph: () => Promise<void>;
};

const arcIdPrefix = "$A_";
type ArcIdPrefix = typeof arcIdPrefix;

const arcIdSeparator = "___";

/**
 * Arc ID format: {@link arcIdPrefix}<inputId>{@link arcIdSeparator}<outputId>
 */
export const generateArcId = ({
  inputId,
  outputId,
}: { inputId: string; outputId: string }): `${ArcIdPrefix}${string}` => {
  return `${arcIdPrefix}${inputId}${arcIdSeparator}${outputId}`;
};

type SDCPNContextValue = SDCPNProviderProps & MutationHelperFunctions;

export const SDCPNContext = createContext<SDCPNContextValue | null>(null);

export const SDCPNProvider: React.FC<SDCPNProviderProps> = ({
  children,
  ...rest
}: React.PropsWithChildren<SDCPNProviderProps>) => {
  const value = useMemo<SDCPNContextValue>(
    () => ({
      ...rest,
      addPlace: (place) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          sdcpn.places.push(place);
        });
      },
      updatePlace: (placeId, updateFn) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const place of sdcpn.places) {
            if (place.id === placeId) {
              updateFn(place);
              break;
            }
          }
        });
      },
      updatePlacePosition: (placeId, position) => {
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
      removePlace: (placeId) => {
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
      addTransition: (transition) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          sdcpn.transitions.push(transition);
        });
      },
      updateTransition: (transitionId, updateFn) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const transition of sdcpn.transitions) {
            if (transition.id === transitionId) {
              updateFn(transition);
              break;
            }
          }
        });
      },
      updateTransitionPosition: (transitionId, position) => {
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
      removeTransition: (transitionId) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const [index, transition] of sdcpn.transitions.entries()) {
            if (transition.id === transitionId) {
              sdcpn.transitions.splice(index, 1);
              break;
            }
          }
        });
      },
      addArc: (transitionId, arcType, placeId, weight) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const transition of sdcpn.transitions) {
            if (transition.id === transitionId) {
              transition[arcType === "input" ? "inputArcs" : "outputArcs"].push(
                { placeId, weight },
              );
              break;
            }
          }
        });
      },
      removeArc: (transitionId, arcType, placeId) => {
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
      updateArcWeight: (transitionId, arcType, placeId, weight) => {
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
      addType: (type) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          sdcpn.types.push(type);
        });
      },
      updateType: (typeId, updateFn) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const type of sdcpn.types) {
            if (type.id === typeId) {
              updateFn(type);
              break;
            }
          }
        });
      },
      removeType: (typeId) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const [index, type] of sdcpn.types.entries()) {
            if (type.id === typeId) {
              sdcpn.types.splice(index, 1);
              break;
            }
          }
        });
      },
      addDifferentialEquation: (equation) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          sdcpn.differentialEquations.push(equation);
        });
      },
      updateDifferentialEquation: (equationId, updateFn) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const equation of sdcpn.differentialEquations) {
            if (equation.id === equationId) {
              updateFn(equation);
              break;
            }
          }
        });
      },
      removeDifferentialEquation: (equationId) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const [
            index,
            equation,
          ] of sdcpn.differentialEquations.entries()) {
            if (equation.id === equationId) {
              sdcpn.differentialEquations.splice(index, 1);
              break;
            }
          }
        });
      },
      addParameter: (parameter) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          sdcpn.parameters.push(parameter);
        });
      },
      updateParameter: (parameterId, updateFn) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const parameter of sdcpn.parameters) {
            if (parameter.id === parameterId) {
              updateFn(parameter);
              break;
            }
          }
        });
      },
      removeParameter: (parameterId) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          for (const [index, parameter] of sdcpn.parameters.entries()) {
            if (parameter.id === parameterId) {
              sdcpn.parameters.splice(index, 1);
              break;
            }
          }
        });
      },
      getItemType: (id) => {
        const sdcpn = rest.petriNetDefinition;

        if (id.startsWith(arcIdPrefix)) {
          return "arc";
        }

        if (sdcpn.types.some((type) => type.id === id)) {
          return "type";
        }

        if (sdcpn.parameters.some((parameter) => parameter.id === id)) {
          return "parameter";
        }

        if (
          sdcpn.differentialEquations.some((equation) => equation.id === id)
        ) {
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
      deleteItemsByIds: (ids) => {
        rest.mutatePetriNetDefinition((sdcpn) => {
          const idsToProcess = new Set(ids);

          /**
           * Deal with the transitions first because we always need to check them,
           * in case they, an arc within them or a place referenced by an arc is being deleted.
           */
          for (const [index, transition] of sdcpn.transitions.entries()) {
            if (idsToProcess.has(transition.id)) {
              sdcpn.transitions.splice(index, 1);
              idsToProcess.delete(transition.id);
            }

            for (const [
              inputArcIndex,
              inputArc,
            ] of transition.inputArcs.entries()) {
              const arcId = generateArcId({
                inputId: inputArc.placeId,
                outputId: transition.id,
              });

              if (
                idsToProcess.has(arcId) ||
                idsToProcess.has(inputArc.placeId)
              ) {
                transition.inputArcs.splice(inputArcIndex, 1);
                idsToProcess.delete(arcId);
              }
            }

            for (const [
              outputArcIndex,
              outputArc,
            ] of transition.outputArcs.entries()) {
              const arcId = generateArcId({
                inputId: transition.id,
                outputId: outputArc.placeId,
              });

              if (
                idsToProcess.has(arcId) ||
                idsToProcess.has(outputArc.placeId)
              ) {
                transition.outputArcs.splice(outputArcIndex, 1);
                idsToProcess.delete(arcId);
              }
            }

            /**
             * If we have no more ids we can return now.
             * Places aren't referred to by anything else, so no more ids == no places to delete.
             */
            if (idsToProcess.size === 0) {
              return;
            }
          }

          for (const [index, place] of sdcpn.places.entries()) {
            if (idsToProcess.has(place.id)) {
              sdcpn.places.splice(index, 1);
              idsToProcess.delete(place.id);
            }
          }
        });
      },
      layoutGraph: async () => {
        const sdcpn = rest.petriNetDefinition;

        if (sdcpn.places.length === 0 && sdcpn.transitions.length === 0) {
          return;
        }

        const positions = await calculateGraphLayout(sdcpn);

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
    }),
    [rest],
  );

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};

export function useSDCPNContext(): SDCPNContextValue {
  const context = useContext(SDCPNContext);

  if (!context) {
    throw new Error("useSDCPNContext must be used within SDCPNProvider");
  }

  return context;
}
