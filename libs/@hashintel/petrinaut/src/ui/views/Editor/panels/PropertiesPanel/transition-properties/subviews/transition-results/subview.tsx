import { use } from "react";

import {
  generateDefaultTransitionKernelCode,
  getArcEndpoint,
  resolveComponent,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../../../react/state/composition-context";
import { useEditorState } from "../../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../../monaco/editor-paths";
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
} from "@hashintel/petrinaut-core";

const getTypeById = ({
  sdcpn,
  types,
  libraries,
}: {
  sdcpn: SDCPN;
  types: Color[];
  libraries: ResolvedLibraries;
}) =>
  new Map(
    [
      ...[...libraries.values()].flatMap(({ components }) =>
        components.flatMap((component) => component.types),
      ),
      ...sdcpn.types,
      ...(sdcpn.components ?? []).flatMap((component) => component.types),
      ...types,
    ].map((type) => [type.id, type]),
  );

const createTransitionArcPlaceResolver = (
  sdcpn: SDCPN,
  net: { places: Place[]; componentInstances?: SDCPN["componentInstances"] },
  libraries: ResolvedLibraries,
): ((
  arc: InputArc | OutputArc,
) => { place: Place; placeName: string } | undefined) => {
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  const componentById = new Map(
    (sdcpn.components ?? []).map((component) => [component.id, component]),
  );
  const instanceById = new Map(
    (net.componentInstances ?? []).map((instance) => [instance.id, instance]),
  );

  return (arc) => {
    const endpoint = getArcEndpoint(arc);

    if (endpoint.kind === "place") {
      const place = placeById.get(endpoint.placeId);
      return place ? { place, placeName: place.name } : undefined;
    }

    const instance = instanceById.get(endpoint.componentInstanceId);
    const component = instance
      ? resolveComponent(sdcpn, instance.component, libraries, componentById)
      : undefined;
    const place = component?.places.find(
      (p) => p.id === endpoint.portPlaceId && p.isPort,
    );

    if (!instance || !place) return undefined;
    return { place, placeName: `${instance.name}::${place.name}` };
  };
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
      onLoadDefault={() => {
        const resolveArcPlace = createTransitionArcPlaceResolver(
          sdcpn,
          activeNet,
          libraries,
        );
        const typeById = getTypeById({ sdcpn, types, libraries });

        const inputs = transition.inputArcs
          .filter((arc) => arc.type !== "inhibitor")
          .map((arc) => {
            const resolved = resolveArcPlace(arc);
            const type = resolved?.place.colorId
              ? typeById.get(resolved.place.colorId)
              : undefined;

            if (!resolved || !type) {
              return null;
            }

            return {
              placeName: resolved.placeName,
              type,
              weight: arc.weight,
            };
          })
          .filter((i) => i !== null);

        const outputs = transition.outputArcs
          .map((arc) => {
            const resolved = resolveArcPlace(arc);
            const type = resolved?.place.colorId
              ? typeById.get(resolved.place.colorId)
              : undefined;

            if (!resolved || !type) {
              return null;
            }

            return {
              placeName: resolved.placeName,
              type,
              weight: arc.weight,
            };
          })
          .filter((o) => o !== null);

        updateTransition({
          transitionId: transition.id,
          update: {
            transitionKernelCode: generateDefaultTransitionKernelCode(
              inputs,
              outputs,
            ),
          },
        });
      }}
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
