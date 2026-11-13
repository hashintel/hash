import { Suspense, use, useDeferredValue } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  buildVisualizerContext,
  coerceTokenAttributeValue,
  createUserKeyedRecord,
  defaultTokenAttributeValue,
  getOwn,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../react/execution-frame/context";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../react/hooks/use-default-parameter-values";
import { SimulationContext } from "../../../react/simulation/context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import {
  renderVisualizerHir,
  type VisualizerSize,
} from "../../lib/render-visualizer-hir";
import { useVisualizerHir } from "../../lib/use-visualizer-hir";
import { VisualizerErrorBoundary } from "../Editor/panels/PropertiesPanel/place-properties/subviews/place-visualizer/visualizer-error-boundary";
import { VisualizerLoading } from "./visualizer-loading";

import type { Color, Place, TokenRecord } from "@hashintel/petrinaut-core";

const messageStyle = css({
  padding: "[12px]",
  fontSize: "xs",
  color: "[#666]",
  lineHeight: "[1.5]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
  whiteSpace: "pre-wrap",
});

interface PlaceStateVisualizationProps {
  place: Place;
  placeType: Color | null;
  size: VisualizerSize;
}

/** The token of a place with no type: it carries no attribute. */
const plainToken: TokenRecord = Object.freeze(
  createUserKeyedRecord<TokenRecord[string]>(),
);

/**
 * The place's tokens for the frame being shown: the current frame of a run,
 * or the initial marking before one. A place with no type holds a count, so
 * its tokens are that many records with no attribute: `tokens.length` reads
 * the count, and `tokens.map` draws one mark per token.
 *
 * Marking records may hold uuid values as at-rest strings; they are coerced
 * to runtime token values (uuid → bigint) as the engine would. Total per
 * element: a stored value that no longer converts (e.g. legacy data
 * predating a schema edit) falls back to the element's default instead of
 * crashing the panel.
 */
const useCurrentTokens = (
  place: Place,
  placeType: Color | null,
): TokenRecord[] => {
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);
  const frameReader = totalFrames > 0 ? currentFrameReader : null;
  const marking = initialMarking[place.id];

  if (!placeType) {
    const count = frameReader
      ? frameReader.getPlaceTokenCount(place.id)
      : typeof marking === "number"
        ? marking
        : 0;
    return new Array<TokenRecord>(count).fill(plainToken);
  }
  if (frameReader) {
    return frameReader.getPlaceTokens(place);
  }
  if (!Array.isArray(marking)) {
    return [];
  }
  return marking.map((token) => {
    const coerced: TokenRecord = createUserKeyedRecord();
    for (const element of placeType.elements) {
      try {
        coerced[element.name] = coerceTokenAttributeValue(
          element,
          getOwn(token, element.name),
          `Initial marking for place ${place.name}`,
        );
      } catch {
        coerced[element.name] = defaultTokenAttributeValue(element.type);
      }
    }
    return coerced;
  });
};

/**
 * The picture itself: the visualizer lowered by the language worker and
 * interpreted here for the tokens on screen. No code from the net runs; a
 * visualizer that does not lower shows its first diagnostic instead.
 */
const VisualizerPicture: React.FC<{
  place: Place;
  placeType: Color | null;
  code: string;
  size: VisualizerSize;
}> = ({ place, placeType, code, size }) => {
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  const { parameterValues } = use(SimulationContext);
  const defaultParameterValues = useDefaultParameterValues();
  const hir = useVisualizerHir(
    code,
    buildVisualizerContext(petriNetDefinition, place, extensions),
  );
  const tokens = useCurrentTokens(place, placeType);

  if (!hir.ok) {
    return (
      <div className={visualizerErrorStyle}>
        {hir.diagnostics[0]?.message ?? "This visualizer cannot be drawn."}
      </div>
    );
  }
  return renderVisualizerHir(
    hir.view,
    tokens,
    mergeParameterValues(parameterValues, defaultParameterValues),
    size,
  );
};

/**
 * Renders a place's custom visualizer using simulation frame data, falling back
 * to the initial marking when no simulation has run. A place with no type
 * draws too, from its token count.
 */
export const PlaceStateVisualization: React.FC<
  PlaceStateVisualizationProps
> = ({ place, placeType, size }) => {
  const code = useDeferredValue(place.visualizerCode);
  if (!code) {
    return <div className={messageStyle}>No visualizer code defined</div>;
  }

  return (
    <>
      <Suspense fallback={<VisualizerLoading />}>
        <VisualizerErrorBoundary resetKey={code}>
          <VisualizerPicture
            place={place}
            placeType={placeType}
            code={code}
            size={size}
          />
        </VisualizerErrorBoundary>
      </Suspense>
      {code !== place.visualizerCode && <VisualizerLoading />}
    </>
  );
};
