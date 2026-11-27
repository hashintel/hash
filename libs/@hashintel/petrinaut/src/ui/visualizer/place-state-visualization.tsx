/**
 * @layerRoot ui.visualizer
 * @role Draws a place's tokens through its visualizer code: the lowered HIR interpreted into the elements Core allows
 *
 * `PlaceStateVisualization` is the entry. The canvas loads it with one
 * dynamic import, so the interpreter stays out of the canvas chunk, and shows
 * `VisualizerLoading` until it arrives. The folder beside this file lowers
 * the code through the language client, interprets the result into React
 * elements and gives the SVG a camera.
 *
 * This is where code a user wrote becomes DOM. The tags, attributes and
 * style properties it may produce are Core's (`VIEW_ELEMENT_TAGS`,
 * `VIEW_ELEMENT_ATTRIBUTES`, `VIEW_STYLE_PROPERTIES`, `isSafeViewValue`).
 * `render-visualizer-hir.test.tsx` checks that anything else is refused and
 * draws every example visualizer against recorded markup.
 * [Compiling user code](doc:core.hir/user-code) says how Core lowers a
 * visualizer and why nothing from it runs as JavaScript.
 */
import { Suspense, use, useDeferredValue } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  buildVisualizerContext,
  coerceTokenAttributeValue,
  createUserKeyedRecord,
  defaultTokenAttributeValue,
  getOwn,
  mergeParameterValues,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../react/document/sdcpn-context";
import { useDefaultParameterValues } from "../../react/document/use-default-parameter-values";
import { ExecutionFrameSourceContext } from "../../react/execution-frame/context";
import { SimulationContext } from "../../react/simulation/context";
import {
  renderVisualizerHir,
  type VisualizerSize,
} from "./place-state-visualization/render-visualizer-hir";
import { useVisualizerHir } from "./place-state-visualization/use-visualizer-hir";
import { VisualizerErrorBoundary } from "./place-state-visualization/visualizer-error-boundary";
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
 * The most tokens a count is drawn from. A count costs the engine nothing to
 * hold, and a visualizer is handed one record per token, so a larger one
 * would freeze the tab. It is the ceiling `range()` has, for the same reason.
 */
const maxCountedTokens = 1_000_000;

/**
 * The place's tokens for the frame being shown: the current frame of a run,
 * or the initial marking before one. A place whose tokens carry nothing, for
 * want of a type or of an element in it, holds a count, so its tokens are
 * that many records with no attribute: `tokens.length` reads the count, and
 * `tokens.map` draws one mark per token. A count above `maxCountedTokens`
 * gives `null`.
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
): TokenRecord[] | null => {
  const { initialMarking } = use(SimulationContext);
  const { currentFrameReader, totalFrames } = use(ExecutionFrameSourceContext);
  const frameReader = totalFrames > 0 ? currentFrameReader : null;
  const marking = initialMarking[place.id];

  // A frame keeps the count of such a place and no token to read.
  if (!placeType || placeType.elements.length === 0) {
    const count = frameReader
      ? frameReader.getPlaceTokenCount(place.id)
      : Array.isArray(marking)
        ? marking.length
        : typeof marking === "number"
          ? marking
          : 0;
    return count > maxCountedTokens
      ? null
      : new Array<TokenRecord>(count).fill(plainToken);
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
  if (tokens === null) {
    return (
      <div className={visualizerErrorStyle}>
        {`This place holds more than ${maxCountedTokens.toLocaleString("en-US")} tokens, too many to draw.`}
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
