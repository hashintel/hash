import { use } from "react";

import {
  generateDefaultTransitionKernelCode,
  getArcEndpoint,
  getDocumentUri,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../../../../react/document/sdcpn-context";
import { useEditorState } from "../../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { resolvePort } from "../../../arc-endpoint";
import { CodeTemplateMenu } from "../../../code-template-menu";
import { codeSectionStyle } from "../../../styles";
import { useTransitionPropertiesContext } from "../../context";

import type {
  Color,
  InputArc,
  OutputArc,
  Place,
  ResolvedLibraries,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core";

type Net = Pick<SDCPN, "places" | "componentInstances">;

/**
 * The place an arc ends at and its name in kernel code, where the net still
 * has it. A port is named `Instance::Port`.
 */
const arcPlace = (
  arc: InputArc | OutputArc,
  net: Net,
  sdcpn: SDCPN,
  libraries: ResolvedLibraries,
): { place: Place; placeName: string } | undefined => {
  const endpoint = getArcEndpoint(arc);

  if (endpoint.kind === "place") {
    const place = net.places.find(({ id }) => id === endpoint.placeId);
    return place ? { place, placeName: place.name } : undefined;
  }

  const { instance, port } = resolvePort(endpoint, net, sdcpn, libraries);
  return instance && port?.isPort
    ? { place: port, placeName: `${instance.name}::${port.name}` }
    : undefined;
};

/** The default kernel code of a transition, from its arcs to typed places. */
const defaultKernelCode = ({
  transition,
  net,
  sdcpn,
  types,
  libraries,
}: {
  transition: Transition;
  net: Net;
  sdcpn: SDCPN;
  types: Color[];
  libraries: ResolvedLibraries;
}) => {
  const typeById = new Map(
    [
      ...[...libraries.values()].flatMap(({ components }) =>
        components.flatMap((component) => component.types),
      ),
      ...sdcpn.types,
      ...(sdcpn.components ?? []).flatMap((component) => component.types),
      ...types,
    ].map((type) => [type.id, type]),
  );

  const templateArcs = (arcs: (InputArc | OutputArc)[]) =>
    arcs.flatMap((arc) => {
      const resolved = arcPlace(arc, net, sdcpn, libraries);
      const type = resolved?.place.colorId
        ? typeById.get(resolved.place.colorId)
        : undefined;

      return resolved && type
        ? [{ placeName: resolved.placeName, type, weight: arc.weight }]
        : [];
    });

  return generateDefaultTransitionKernelCode(
    templateArcs(
      transition.inputArcs.filter((arc) => arc.type !== "inhibitor"),
    ),
    templateArcs(transition.outputArcs),
  );
};

export const ResultsHeaderAction: React.FC = () => {
  const { logicAvailability, transition, types } =
    useTransitionPropertiesContext();
  const { updateTransition } = usePetrinautMutations();
  const { petriNetDefinition: sdcpn } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const globalMode = useEditorState((editor) => editor.globalMode);
  const { libraries } = use(CompositionContext);

  if (globalMode !== "edit" || !logicAvailability.transitionKernel) {
    return null;
  }

  return (
    <CodeTemplateMenu
      onLoadDefault={() =>
        updateTransition({
          transitionId: transition.id,
          update: {
            transitionKernelCode: defaultKernelCode({
              transition,
              net: activeNet,
              sdcpn,
              types,
              libraries,
            }),
          },
        })
      }
    />
  );
};

export const TransitionResultsContent: React.FC = () => {
  const { transition } = useTransitionPropertiesContext();
  const { updateTransition } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <div className={codeSectionStyle}>
      <CodeEditor
        path={getDocumentUri("transition-kernel", transition.id)}
        language="typescript"
        value={transition.transitionKernelCode || ""}
        height="100%"
        onChange={(value) => {
          if (value === undefined) {
            return;
          }

          updateTransition({
            transitionId: transition.id,
            update: { transitionKernelCode: value },
          });
        }}
        options={{ readOnly: isReadOnly }}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      />
    </div>
  );
};
