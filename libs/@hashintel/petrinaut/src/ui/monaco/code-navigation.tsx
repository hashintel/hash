import { startTransition, use, useState } from "react";

import {
  getDocumentUri,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../react/document/active-net-context";
import { CompositionContext } from "../../react/document/composition-context";
import { useSDCPNState } from "../../react/document/sdcpn-context";
import { usePetrinautNavigate } from "../../react/navigation/navigation";
import { useEditorActions } from "../../react/state/editor-context";
import { useUserSettingsFields } from "../../react/state/user-settings-context";
import { usePetrinautPresentation } from "../views/shared/presentation-context";
import { CodeNavigationContext } from "./code-navigation-context";

import type { CodeEntry, CodeNavigation } from "./code-navigation-context";
import type { PropsWithChildren } from "react";

export const CodeNavigationProvider = ({ children }: PropsWithChildren) => {
  const navigate = usePetrinautNavigate();
  const [focusRequest, setFocusRequest] = useState<{ path: string } | null>(
    null,
  );
  const { activeNet } = use(ActiveNetContext);
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const extensions = useSDCPNState((document) => document.extensions);
  const { libraries } = use(CompositionContext);
  const { selectItem } = useEditorActions();
  const { subViewPanels, updateSubViewSection } = useUserSettingsFields(
    "subViewPanels",
    "updateSubViewSection",
  );
  const { showSourceCode: enabled } = usePetrinautPresentation();
  const entries: CodeEntry[] = [
    ...activeNet.transitions.flatMap((transition): CodeEntry[] => {
      const availability = getTransitionLogicAvailability(
        transition,
        petriNetDefinition,
        extensions,
        activeNet,
        libraries,
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
      ? activeNet.differentialEquations.map((equation): CodeEntry => ({
          path: getDocumentUri("differential-equation", equation.id),
          label: "Differential equation",
          selection: { type: "differentialEquation", id: equation.id },
          panel: "diff-eq-properties",
          section: "diff-eq-main-content",
        }))
      : []),
    ...activeNet.places.flatMap((place): CodeEntry[] =>
      place.visualizerCode === undefined
        ? []
        : [
            {
              path: getDocumentUri("place-visualizer", place.id),
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
    focusRequest,
    acknowledgeFocus: (path) =>
      setFocusRequest((request) => (request?.path === path ? null : request)),
    open: (path, options) => {
      const entry = entries.find((candidate) => candidate.path === path);
      if (!enabled || !entry) return;
      const expandSection = () =>
        updateSubViewSection(entry.panel, entry.section, {
          ...subViewPanels[entry.panel]?.[entry.section],
          collapsed: false,
        });
      if (options?.maximize) {
        navigate(
          {
            selection: [entry.selection],
            expandedSubView: { container: entry.panel, id: entry.section },
          },
          { cause: "user", action: "subview" },
        );
        setFocusRequest({ path });
        // The section fills its container whether or not it is collapsed.
        // Expanding it only matters once the user goes back, so it waits:
        // the container then knows of the request first, and keeps the
        // layout of its sections still until the section covers them.
        startTransition(expandSection);
      } else {
        expandSection();
        selectItem(entry.selection);
      }
    },
  };
  return (
    <CodeNavigationContext value={value}>{children}</CodeNavigationContext>
  );
};
