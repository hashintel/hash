import { createContext, use } from "react";

import {
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../react/state/active-net-context";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { usePetrinautPresentation } from "../views/shared/presentation-context";
import { getDocumentUri } from "./editor-paths";

import type { SelectionItem } from "@hashintel/petrinaut-core";
import type { PropsWithChildren } from "react";

type CodeEntry = {
  path: string;
  label: string;
  selection: SelectionItem;
  panel: string;
  section: string;
};

type CodeNavigation = {
  enabled: boolean;
  entries: CodeEntry[];
  open: (path: string) => void;
};

const CodeNavigationContext = createContext<CodeNavigation>({
  enabled: false,
  entries: [],
  open: () => {},
});

export const useCodeNavigation = () => use(CodeNavigationContext);

export const CodeNavigationProvider = ({ children }: PropsWithChildren) => {
  const { activeNet } = use(ActiveNetContext);
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  const { selectItem } = use(EditorContext);
  const { subViewPanels, updateSubViewSection } = use(UserSettingsContext);
  const { showSourceCode: enabled } = usePetrinautPresentation();
  const entries: CodeEntry[] = [
    ...activeNet.transitions.flatMap((transition): CodeEntry[] => {
      const availability = getTransitionLogicAvailability(
        transition,
        petriNetDefinition,
        extensions,
        activeNet,
      );
      const lambdaType = getEffectiveTransitionLambdaType(
        transition,
        availability,
      );
      const shared = {
        selection: { type: "transition" as const, id: transition.id },
        panel: "transition-properties",
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
                section: "transition-firing-time",
              },
            ]
          : []),
        ...(availability.transitionKernel
          ? [
              {
                ...shared,
                path: getDocumentUri("transition-kernel", transition.id),
                label: "Transition kernel",
                section: "transition-results",
              },
            ]
          : []),
      ];
    }),
    ...(extensions.colors && extensions.dynamics
      ? activeNet.differentialEquations.map(
          (equation): CodeEntry => ({
            path: getDocumentUri("differential-equation", equation.id),
            label: "Differential equation",
            selection: { type: "differentialEquation", id: equation.id },
            panel: "diff-eq-properties",
            section: "diff-eq-main-content",
          }),
        )
      : []),
    ...activeNet.places.flatMap((place): CodeEntry[] =>
      place.visualizerCode === undefined
        ? []
        : [
            {
              path: `inmemory://sdcpn/places/${place.id}/visualizer.tsx`,
              label: "Visualizer",
              selection: { type: "place", id: place.id },
              panel: "place-properties",
              section: "place-visualizer",
            },
          ],
    ),
  ];

  const value: CodeNavigation = {
    enabled,
    entries,
    open: (path: string) => {
      const entry = entries.find((candidate) => candidate.path === path);
      if (!enabled || !entry) return;
      updateSubViewSection(entry.panel, entry.section, {
        ...subViewPanels[entry.panel]?.[entry.section],
        collapsed: false,
      });
      selectItem(entry.selection);
    },
  };
  return (
    <CodeNavigationContext value={value}>{children}</CodeNavigationContext>
  );
};
