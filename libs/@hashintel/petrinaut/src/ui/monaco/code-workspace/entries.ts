import {
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { getDocumentUri } from "../editor-paths";

import type { PetrinautMutations } from "../../../react";
import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { SDCPNContextValue } from "../../../react/state/sdcpn-context";
import type { SelectionItem } from "@hashintel/petrinaut-core";

export type CodeEntry = {
  path: string;
  owner: string;
  ownerKind: string;
  label: string;
  value: string;
  selection: SelectionItem;
  update: (value: string) => void;
};

export const getCodeEntries = (
  activeNet: ActiveNetDefinition,
  sdcpn: SDCPNContextValue["petriNetDefinition"],
  extensions: SDCPNContextValue["extensions"],
  mutations: Pick<
    PetrinautMutations,
    "updatePlace" | "updateTransition" | "updateDifferentialEquation"
  >,
): CodeEntry[] => [
  ...activeNet.transitions.flatMap((transition): CodeEntry[] => {
    const availability = getTransitionLogicAvailability(
      transition,
      sdcpn,
      extensions,
      activeNet,
    );
    const lambdaType = getEffectiveTransitionLambdaType(
      transition,
      availability,
    );
    const shared = {
      owner: transition.name,
      ownerKind: "Transition",
      selection: { type: "transition" as const, id: transition.id },
    };
    return [
      ...(availability.lambda
        ? [
            {
              ...shared,
              path: getDocumentUri("transition-lambda", transition.id),
              label:
                lambdaType === "predicate"
                  ? "Predicate (λ)"
                  : "Stochastic rate (λ)",
              value:
                transition.lambdaType === lambdaType
                  ? transition.lambdaCode
                  : "",
              update: (value: string) =>
                mutations.updateTransition({
                  transitionId: transition.id,
                  update: { lambdaType, lambdaCode: value },
                }),
            },
          ]
        : []),
      ...(availability.transitionKernel
        ? [
            {
              ...shared,
              path: getDocumentUri("transition-kernel", transition.id),
              label: "Transition kernel",
              value: transition.transitionKernelCode,
              update: (value: string) =>
                mutations.updateTransition({
                  transitionId: transition.id,
                  update: { transitionKernelCode: value },
                }),
            },
          ]
        : []),
    ];
  }),
  ...(extensions.colors && extensions.dynamics
    ? activeNet.differentialEquations.map(
        (equation): CodeEntry => ({
          path: getDocumentUri("differential-equation", equation.id),
          owner: equation.name,
          ownerKind: "Differential equation",
          label: "Differential equation",
          value: equation.code,
          selection: { type: "differentialEquation", id: equation.id },
          update: (value) =>
            mutations.updateDifferentialEquation({
              equationId: equation.id,
              update: { code: value },
            }),
        }),
      )
    : []),
  ...activeNet.places.flatMap((place): CodeEntry[] =>
    place.visualizerCode === undefined
      ? []
      : [
          {
            path: `inmemory://sdcpn/places/${place.id}/visualizer.tsx`,
            owner: place.name,
            ownerKind: "Place",
            label: "Visualizer",
            value: place.visualizerCode,
            selection: { type: "place", id: place.id },
            update: (value) =>
              mutations.updatePlace({
                placeId: place.id,
                update: { visualizerCode: value },
              }),
          },
        ],
  ),
];
