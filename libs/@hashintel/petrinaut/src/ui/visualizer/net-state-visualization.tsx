/**
 * Draws the state of a whole net through the net's own visualizer code: the
 * root net's, or a component's for one of its instances. The counterpart of
 * `PlaceStateVisualization`, which draws one place.
 */
import { Suspense, use, useDeferredValue } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  buildNetVisualizerContext,
  createUserKeyedRecord,
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../react/document/sdcpn-context";
import { useCompositionStateIndex } from "../../react/document/use-composition-state";
import { useDefaultParameterValues } from "../../react/document/use-default-parameter-values";
import { useExecutableDefinition } from "../../react/document/use-executable-definition";
import { ExecutionFrameSourceContext } from "../../react/execution-frame/context";
import { SimulationContext } from "../../react/simulation/context";
import {
  renderVisualizerHir,
  type VisualizerSize,
} from "./place-state-visualization/render-visualizer-hir";
import { useVisualizerHir } from "./place-state-visualization/use-visualizer-hir";
import { VisualizerErrorBoundary } from "./place-state-visualization/visualizer-error-boundary";
import { maxCountedTokens, readPlaceTokens } from "./place-tokens";
import { VisualizerLoading } from "./visualizer-loading";

import type { Component, SDCPN, ViewPlaces } from "@hashintel/petrinaut-core";

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
  fontSize: "xs",
  whiteSpace: "pre-wrap",
});

/** The root net, or a component: what a net's visualizer can belong to. */
type VisualizedNet = SDCPN | Component;

interface NetStateVisualizationProps {
  /**
   * The net to draw, as the simulator is given it: the root net, or the
   * component an instance runs.
   */
  net: VisualizedNet;
  /**
   * The component instances that lead from the root net to the state drawn:
   * empty for the root net. `null` draws the net holding no token, as a
   * component nothing instantiates does.
   */
  path: readonly string[] | null;
  size: VisualizerSize;
}

type NetPlaces =
  | { ok: true; places: ViewPlaces }
  | { ok: false; placeName: string };

/**
 * The places of `net` for the frame being shown, by name, each with its
 * count and its tokens: what a net's visualizer reads as `places`. A later
 * place of the same name wins, as it does where the code is checked. A place
 * with too many tokens to hand over stops the picture and is named.
 */
const useNetPlaces = (
  net: VisualizedNet,
  path: readonly string[] | null,
): NetPlaces => {
  const { extensions } = use(SDCPNContext);
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);
  const stateIndex = useCompositionStateIndex();
  const frameReader = totalFrames > 0 ? currentFrameReader : null;

  const places = createUserKeyedRecord<ViewPlaces[string]>();
  for (const place of net.places) {
    const placeType =
      extensions.colors && place.colorId
        ? (net.types.find((type) => type.id === place.colorId) ?? null)
        : null;
    const tokens =
      path === null
        ? []
        : readPlaceTokens({
            place,
            placeType,
            stateId: stateIndex.flatPlaceId(path, place.id),
            frameReader,
            initialMarking,
          });
    if (tokens === null) {
      return { ok: false, placeName: place.name };
    }
    places[place.name] = { count: tokens.length, tokens };
  }
  return { ok: true, places };
};

/**
 * The parameter values the net's code reads. The root net reads the run's.
 * A component reads those of the instance drawn, and its own defaults where
 * no instance is.
 */
const useNetParameterValues = (
  net: VisualizedNet,
  path: readonly string[] | null,
): Readonly<Record<string, number | boolean>> => {
  const { extensions } = use(SDCPNContext);
  const { parameterValues } = use(SimulationContext);
  const rootDefaults = useDefaultParameterValues();
  const stateIndex = useCompositionStateIndex();

  if (path?.length === 0) {
    return mergeParameterValues(parameterValues, rootDefaults);
  }
  const instanceValues =
    path === null ? null : stateIndex.instanceParameterValues(path);
  if (instanceValues) {
    return instanceValues;
  }
  return extensions.parameters
    ? deriveDefaultParameterValues(net.parameters)
    : {};
};

/**
 * The picture itself: the visualizer lowered by the language worker and
 * interpreted here for the state on screen. No code from the net runs; a
 * visualizer that does not lower shows its first diagnostic instead.
 */
const NetVisualizerPicture: React.FC<
  NetStateVisualizationProps & { code: string }
> = ({ net, path, code, size }) => {
  const { extensions } = use(SDCPNContext);
  const definition = useExecutableDefinition();
  const hir = useVisualizerHir(
    code,
    buildNetVisualizerContext(definition, net, extensions),
  );
  const netPlaces = useNetPlaces(net, path);
  const parameters = useNetParameterValues(net, path);

  if (!hir.ok) {
    return (
      <div className={visualizerErrorStyle}>
        {hir.diagnostics[0]?.message ?? "This visualizer cannot be drawn."}
      </div>
    );
  }
  if (!netPlaces.ok) {
    return (
      <div className={visualizerErrorStyle}>
        {`${netPlaces.placeName} holds more than ${maxCountedTokens.toLocaleString("en-US")} tokens, too many to draw.`}
      </div>
    );
  }
  return renderVisualizerHir(
    hir.view,
    { places: netPlaces.places },
    parameters,
    size,
  );
};

/**
 * Renders a net's visualizer from simulation frame data, falling back to the
 * initial marking when no simulation has run. Draws nothing for a net with
 * no visualizer code.
 */
export const NetStateVisualization: React.FC<NetStateVisualizationProps> = ({
  net,
  path,
  size,
}) => {
  const code = useDeferredValue(net.visualizerCode);
  if (!code) {
    return null;
  }

  return (
    <>
      <Suspense fallback={<VisualizerLoading />}>
        <VisualizerErrorBoundary resetKey={code}>
          <NetVisualizerPicture net={net} path={path} code={code} size={size} />
        </VisualizerErrorBoundary>
      </Suspense>
      {code !== net.visualizerCode ? <VisualizerLoading /> : null}
    </>
  );
};
